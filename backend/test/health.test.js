import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { connectDatabase } from "../src/config/database.js";
test("unconfigured database fails startup and health reports unavailable", async () => {
  const previous = process.env.MONGODB_URI;
  delete process.env.MONGODB_URI;
  try {
    await assert.rejects(connectDatabase(), /MONGODB_URI is required/);
  } finally {
    if (previous) process.env.MONGODB_URI = previous;
  }
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const result = await fetch(
      `http://127.0.0.1:${server.address().port}/api/health`,
    );
    assert.equal(result.status, 503);
    assert.equal((await result.json()).database, "disconnected");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
