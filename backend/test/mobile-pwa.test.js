import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import {
  keyboardIsOpen,
  installMobileViewport,
} from "../../frontend/src/lib/mobileViewport.js";
const read = (path) =>
  readFile(new URL("../../frontend/" + path, import.meta.url), "utf8");

test("keyboard detection distinguishes software keyboards from pinch zoom, toolbars and desktop resize", () => {
  const normal = {
    baseline: 844,
    height: 844,
    scale: 1,
    focused: true,
    touch: true,
  };
  assert.equal(keyboardIsOpen(normal), false);
  assert.equal(keyboardIsOpen({ ...normal, height: 510 }), true);
  assert.equal(keyboardIsOpen({ ...normal, height: 760 }), false);
  assert.equal(keyboardIsOpen({ ...normal, height: 420, scale: 2 }), false);
  assert.equal(
    keyboardIsOpen({ ...normal, height: 510, focused: false }),
    false,
  );
  assert.equal(keyboardIsOpen({ ...normal, height: 510, touch: false }), false);
});

test("viewport adapter constrains dialogs and reveals obscured fields without blocking zoom or trapping focus", () => {
  const listeners = () => ({
    events: {},
    addEventListener(type, fn) {
      this.events[type] = fn;
    },
    removeEventListener(type) {
      delete this.events[type];
    },
  });
  const values = new Map(),
    attrs = new Map();
  const root = {
    style: {
      setProperty: (k, v) => values.set(k, v),
      removeProperty: (k) => values.delete(k),
    },
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
  };
  let scrolled = 0,
    callback;
  const field = {
    matches: () => true,
    getBoundingClientRect: () => ({ top: 630, bottom: 678 }),
    scrollIntoView: (options) => {
      assert.equal(options.block, "nearest");
      scrolled++;
    },
  };
  const doc = { ...listeners(), documentElement: root, activeElement: field };
  const viewport = { ...listeners(), height: 844, scale: 1, offsetTop: 0 };
  const win = {
    ...listeners(),
    visualViewport: viewport,
    innerHeight: 844,
    innerWidth: 390,
    matchMedia: () => ({ matches: true }),
    requestAnimationFrame: (fn) => {
      callback = fn;
      return 1;
    },
    cancelAnimationFrame: () => {},
  };
  const stop = installMobileViewport(win, doc);
  viewport.height = 510;
  viewport.offsetTop = 10;
  viewport.events.resize();
  callback();
  assert.equal(attrs.get("data-keyboard"), "open");
  assert.equal(values.get("--visual-viewport-height"), "510px");
  assert.equal(values.get("--visual-viewport-top"), "10px");
  assert.equal(scrolled, 1);
  viewport.scale = 2;
  viewport.events.resize();
  callback();
  assert.equal(attrs.has("data-keyboard"), false);
  assert.equal(values.has("--visual-viewport-height"), false);
  assert.equal(scrolled, 1);
  viewport.scale = 1;
  viewport.height = 844;
  doc.activeElement = { matches: () => false };
  doc.events.focusout();
  callback();
  assert.equal(attrs.has("data-keyboard"), false);
  stop();
  assert.equal(values.size, 0);
  assert.equal(Object.keys(viewport.events).length, 0);
  assert.equal(Object.keys(doc.events).length, 0);
  assert.equal(
    typeof installMobileViewport({ visualViewport: null }, {}),
    "function",
  );
});

test("manifest has install identity, standalone scope, native PNG sizes and a dedicated maskable icon", async () => {
  const manifest = JSON.parse(await read("public/manifest.json"));
  assert.equal(manifest.id, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.prefer_related_applications, false);
  for (const size of [192, 512])
    assert.ok(
      manifest.icons.some(
        (i) => i.sizes === `${size}x${size}` && i.purpose === "any",
      ),
    );
  assert.ok(
    manifest.icons.some(
      (i) => i.purpose === "maskable" && i.src.includes("maskable"),
    ),
  );
  for (const icon of [
    ...manifest.icons,
    { src: "/apple-touch-icon.png", sizes: "180x180" },
  ]) {
    const bytes = await readFile(
      new URL("../../frontend/public" + icon.src, import.meta.url),
    );
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    const [w, h] = icon.sizes.split("x").map(Number);
    assert.equal(bytes.readUInt32BE(16), w);
    assert.equal(bytes.readUInt32BE(20), h);
  }
});

test("viewport metadata keeps accessibility zoom and includes iOS/safe-area configuration", async () => {
  const html = await read("index.html"),
    css = await read("src/mobile.css");
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /interactive-widget=resizes-content/);
  assert.doesNotMatch(html, /user-scalable|maximum-scale|minimum-scale/);
  assert.match(html, /apple-touch-icon/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(css, /font-size: max\(16px, 1rem\) !important/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /100svh/);
  assert.doesNotMatch(css, /touch-action:\s*none|overflow-x:\s*hidden/);
  const config = JSON.parse(await read("vercel.json"));
  assert.ok(
    config.headers
      .find((h) => h.source === "/sw.js")
      .headers.some((h) => h.key === "Cache-Control" && h.value === "no-store"),
  );
});

const workerSource = await read("public/sw.js");
function worker(fetcher) {
  let handler;
  runInNewContext(workerSource, {
    self: {
      location: { origin: "https://app.example" },
      addEventListener: (type, callback) => {
        assert.equal(type, "fetch");
        handler = callback;
      },
    },
    URL,
    Response,
    fetch: fetcher,
    get caches() {
      throw new Error("Private data must never enter CacheStorage");
    },
    get indexedDB() {
      throw new Error("No persistent worker storage allowed");
    },
  });
  return async (request) => {
    let response;
    handler({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://app.example/calendar",
        ...request,
      },
      respondWith: (promise) => {
        response = promise;
      },
    });
    return response;
  };
}
test("service worker never intercepts API routes, writes, assets or cross-origin navigation", async () => {
  const dispatch = worker(() => {
    throw new Error("Must not fetch");
  });
  for (const request of [
    { url: "https://app.example/api" },
    { url: "https://app.example/api/tasks" },
    { method: "POST" },
    { mode: "cors", url: "https://app.example/assets/app.js" },
    { url: "https://other.example/" },
  ])
    assert.equal(await dispatch(request), undefined);
});
test("private navigation is network-only and real HTTP errors remain errors, never fake successes", async () => {
  const response = new Response("Service unavailable", { status: 503 });
  const dispatch = worker(async (request, options) => {
    assert.equal(request.url, "https://app.example/calendar");
    assert.equal(options.cache, "no-store");
    return response;
  });
  assert.equal(await dispatch({}), response);
});
test("offline navigation returns a generic non-cacheable 503 without private data or cached HTML", async () => {
  const dispatch = worker(async () => {
    throw new TypeError("Network lost");
  });
  const response = await dispatch({});
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-type"), /text\/html/);
  const html = await response.text();
  assert.match(html, /Let’s reconnect/);
  assert.match(html, /No private records/);
  assert.doesNotMatch(
    html,
    /user-scalable|maximum-scale|localStorage|token|password/,
  );
});
