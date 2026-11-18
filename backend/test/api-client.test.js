import { test } from "node:test";
import assert from "node:assert/strict";
import { requestJson, ApiError } from "../../frontend/src/lib/request.js";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const quick = { wait: async () => {} };
test("read retries gateway/network failures, includes cookies and disables caching", async () => {
  let calls = 0;
  const waits = [];
  const data = await requestJson(
    "/api/tasks",
    { headers: new Headers({ "X-Custom": "ok" }) },
    {
      wait: async (ms) => waits.push(ms),
      fetcher: async (_url, options) => {
        assert.equal(options.credentials, "include");
        assert.equal(options.cache, "no-store");
        assert.equal(options.headers.get("X-ProdTrack-Request"), "1");
        assert.equal(options.headers.get("X-Custom"), "ok");
        calls++;
        if (calls === 1) return new Response("gateway", { status: 503 });
        if (calls === 2) throw new TypeError("offline");
        return json({ tasks: [] });
      },
    },
  );
  assert.deepEqual(data, { tasks: [] });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);
});
test("POST, PATCH, PUT and DELETE are never automatically retried", async () => {
  for (const method of ["POST", "PATCH", "PUT", "DELETE"])
    for (const network of [false, true]) {
      let calls = 0;
      await assert.rejects(
        requestJson(
          "/api/tasks",
          { method, body: "{}" },
          {
            ...quick,
            fetcher: async () => {
              calls++;
              if (network) throw new TypeError("offline");
              return new Response("gateway", { status: 503 });
            },
          },
        ),
        /could not confirm this change/,
      );
      assert.equal(calls, 1);
    }
});
test("unavailable reads have a bounded number of attempts and a wake-up message", async () => {
  let calls = 0;
  await assert.rejects(
    requestJson(
      "/api/auth/me",
      {},
      {
        ...quick,
        fetcher: async () => {
          calls++;
          return new Response("asleep", { status: 504 });
        },
      },
    ),
    (e) =>
      e instanceof ApiError &&
      e.status === 504 &&
      /may be waking up/.test(e.message),
  );
  assert.equal(calls, 3);
});
test("timeouts abort the fetch, bound reads and do not replay an uncertain write", async () => {
  for (const method of ["GET", "POST"]) {
    let calls = 0;
    await assert.rejects(
      requestJson(
        "/api/tasks",
        { method },
        {
          ...quick,
          timeoutMs: 8,
          fetcher: async (_url, { signal }) => {
            calls++;
            return new Promise((_resolve, reject) =>
              signal.addEventListener(
                "abort",
                () => reject(new DOMException("timed out", "AbortError")),
                { once: true },
              ),
            );
          },
        },
      ),
      (e) =>
        e instanceof ApiError && /waking up|could not confirm/.test(e.message),
    );
    assert.equal(calls, method === "GET" ? 3 : 1);
  }
});
test("caller cancellation aborts immediately without retry or false success", async () => {
  const c = new AbortController();
  let calls = 0;
  const pending = requestJson(
    "/api/auth/me",
    { signal: c.signal },
    {
      ...quick,
      fetcher: async (_url, { signal }) => {
        calls++;
        return new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () =>
            reject(new DOMException("cancelled", "AbortError")),
          ),
        );
      },
    },
  );
  c.abort();
  await assert.rejects(pending, (e) => e.name === "AbortError");
  assert.equal(calls, 1);
});
test("HTML routing errors and invalid JSON are explicit failures, never session-expiry signals", async () => {
  for (const response of [
    new Response("<html>wrong route</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }),
    new Response("<html>protection</html>", {
      status: 401,
      headers: { "Content-Type": "text/html" },
    }),
    new Response("{", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ]) {
    let calls = 0;
    await assert.rejects(
      requestJson(
        "/api/auth/me",
        {},
        {
          ...quick,
          fetcher: async () => {
            calls++;
            return response;
          },
        },
      ),
      (e) =>
        e instanceof ApiError &&
        e.status === 502 &&
        /server response/.test(e.message),
    );
    assert.equal(calls, 1);
  }
});
test("real JSON 401/403 and validation errors keep their status without retries", async () => {
  for (const status of [400, 401, 403, 404, 409, 429]) {
    let calls = 0;
    await assert.rejects(
      requestJson(
        "/api/auth/me",
        {},
        {
          ...quick,
          fetcher: async () => {
            calls++;
            return json({ error: "Expected error" }, status);
          },
        },
      ),
      (e) =>
        e instanceof ApiError &&
        e.status === status &&
        e.message === "Expected error",
    );
    assert.equal(calls, 1);
  }
});
test("204 and HEAD responses do not require JSON bodies", async () => {
  assert.equal(
    await requestJson(
      "/api/tasks/1",
      { method: "DELETE" },
      { fetcher: async () => new Response(null, { status: 204 }) },
    ),
    undefined,
  );
  assert.equal(
    await requestJson(
      "/api/health",
      { method: "HEAD" },
      { fetcher: async () => new Response(null, { status: 200 }) },
    ),
    undefined,
  );
});
