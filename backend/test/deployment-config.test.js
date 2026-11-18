import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const config = JSON.parse(
  await readFile(
    new URL("../../frontend/vercel.json", import.meta.url),
    "utf8",
  ),
);
test("Vercel SPA fallback cannot conflict with clean URL extension stripping", () => {
  const spa = config.rewrites.find((r) => r.destination === "/index.html");
  assert.ok(spa);
  assert.notEqual(config.cleanUrls, true);
});
test("Vercel API proxy precedes SPA routing and private API responses are not cached", () => {
  const api = config.rewrites.findIndex((r) => r.source === "/api/:path*");
  const spa = config.rewrites.findIndex((r) => r.destination === "/index.html");
  assert.ok(api >= 0 && api < spa);
  assert.match(
    config.rewrites[api].destination,
    /^https:\/\/[^/]+\.onrender\.com\/api\/:path\*$/,
  );
  const cache = config.headers
    .find((r) => r.source === "/api/(.*)")
    .headers.find((h) => h.key === "Cache-Control");
  assert.match(cache.value, /no-store/);
  const marker = config.headers
    .find((r) => r.source === "/(.*)")
    .headers.find((h) => h.key === "X-StudyMomentum-Routing");
  assert.equal(marker.value, "spa-fallback-v2");
});
