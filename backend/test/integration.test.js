import { test } from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { app } from "../src/app.js";
import User from "../src/models/User.js";
import Task from "../src/models/Task.js";
import Session from "../src/models/Session.js";
const origin = "http://localhost:5173";
test(
  "authentication and task APIs with isolated MongoDB",
  { timeout: 300000 },
  async (t) => {
    process.env.CLIENT_ORIGIN = origin;
    const mongo = await MongoMemoryServer.create({
      binary: {
        downloadDir: fileURLToPath(
          new URL("../.cache/mongodb/", import.meta.url),
        ),
      },
    });
    let server;
    try {
      await mongoose.connect(mongo.getUri());
      await Promise.all([User.init(), Task.init(), Session.init()]);
      server = app.listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      async function request(
        path,
        { cookie, body, method = "GET", headers = {} } = {},
      ) {
        const response = await fetch(base + "/api" + path, {
          method,
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            "X-ProdTrack-Request": "1",
            ...(cookie ? { Cookie: cookie } : {}),
            ...headers,
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const data = response.status === 204 ? null : await response.json();
        return {
          status: response.status,
          data,
          cookie: response.headers.get("set-cookie")?.split(";")[0],
          headers: response.headers,
        };
      }
      const account = {
        name: "Jordan Example",
        email: "jordan@example.test",
        password: "A secure test password 42!",
      };
      let alice, bob, taskId;
      await t.test("health, protected routes and CSRF", async () => {
        assert.equal((await request("/health")).status, 200);
        assert.equal((await request("/tasks")).status, 401);
        assert.equal((await request("/auth/me")).status, 401);
        assert.equal(
          (
            await request("/auth/register", {
              method: "POST",
              body: account,
              headers: { Origin: "https://untrusted.example" },
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request("/auth/register", {
              method: "POST",
              body: account,
              headers: { "X-ProdTrack-Request": "" },
            })
          ).status,
          403,
        );
      });
      await t.test(
        "registration validates and hashes credentials; cookie-only session",
        async () => {
          const short7 = await request("/auth/register", {
            method: "POST",
            body: { ...account, password: "1234567" },
          });
          assert.equal(short7.status, 400);
          assert.equal(short7.data.error, "Password must contain 8–128 characters.");
          assert.equal(
            (
              await request("/auth/register", {
                method: "POST",
                body: { ...account, password: "short" },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request("/auth/register", {
                method: "POST",
                body: { ...account, email: "invalid" },
              })
            ).status,
            400,
          );
          // Verify 8-character password succeeds (no composition restrictions)
          const reg8 = await request("/auth/register", {
            method: "POST",
            body: { name: "User Eight", email: "eight@example.test", password: "password" },
          });
          assert.equal(reg8.status, 201);
          // Verify 12-character password succeeds
          const reg12 = await request("/auth/register", {
            method: "POST",
            body: { name: "User Twelve", email: "twelve@example.test", password: "passphrase12" },
          });
          assert.equal(reg12.status, 201);
          // Verify 20-character password succeeds
          const reg20 = await request("/auth/register", {
            method: "POST",
            body: { name: "User Twenty", email: "twenty@example.test", password: "correct horse battery" },
          });
          assert.equal(reg20.status, 201);
          const result = await request("/auth/register", {
            method: "POST",
            body: account,
          });
          assert.equal(result.status, 201);
          alice = result.cookie;
          assert.equal(result.data.user.name, account.name);
          assert.deepEqual(Object.keys(result.data), ["user"]);
          assert.match(result.headers.get("set-cookie"), /HttpOnly/);
          assert.match(result.headers.get("set-cookie"), /SameSite=Lax/);
          assert.match(result.headers.get("set-cookie"), /Max-Age=/);
          const stored = await User.findOne({ email: account.email }).select(
            "+passwordHash",
          );
          assert.notEqual(stored.passwordHash, account.password);
          assert.match(stored.passwordHash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
          assert.ok(
            !(await Session.findOne()).tokenHash.includes(alice.split("=")[1]),
          );
          assert.equal(
            (await request("/auth/register", { method: "POST", body: account }))
              .status,
            409,
          );
          assert.equal(
            (await request("/auth/me", { cookie: alice })).data.user.email,
            account.email,
          );
        },
      );
      await t.test(
        "login rejects bad credentials and normalizes email",
        async () => {
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                body: { email: account.email, password: "incorrect password" },
              })
            ).status,
            401,
          );
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                body: {
                  email: "unknown@example.test",
                  password: account.password,
                },
              })
            ).status,
            401,
          );
          const result = await request("/auth/login", {
            method: "POST",
            body: { email: "JORDAN@EXAMPLE.TEST", password: account.password },
            cookie: alice,
          });
          assert.equal(result.status, 200);
          const previous = alice;
          alice = result.cookie;
          assert.notEqual(previous, alice);
          assert.equal(
            (await request("/auth/me", { cookie: previous })).status,
            401,
          );
          bob = (
            await request("/auth/register", {
              method: "POST",
              body: {
                ...account,
                email: "other@example.test",
                name: "Other person",
              },
            })
          ).cookie;
        },
      );
      await t.test("task creation and strict input validation", async () => {
        const body = {
          title: "Read [chapter]",
          priority: "High",
          dueDate: "2026-10-22",
          category: "Learning",
        };
        assert.equal(
          (await request("/tasks", { method: "POST", body })).status,
          401,
        );
        for (const changes of [
          { title: "" },
          { priority: "Urgent" },
          { dueDate: "2026-02-30" },
          { completed: "false" },
          { user: new mongoose.Types.ObjectId().toString() },
        ])
          assert.equal(
            (
              await request("/tasks", {
                method: "POST",
                cookie: alice,
                body: { ...body, ...changes },
              })
            ).status,
            400,
          );
        const result = await request("/tasks", {
          method: "POST",
          cookie: alice,
          body,
        });
        assert.equal(result.status, 201);
        taskId = result.data.task.id;
        assert.equal(result.data.task.completed, false);
        assert.equal(
          (await Task.findById(taskId)).user.toString(),
          (await User.findOne({ email: account.email })).id,
        );
      });
      await t.test("edit, complete, uncomplete and search/filter", async () => {
        assert.equal(
          (
            await request("/tasks/" + taskId, {
              method: "PATCH",
              cookie: alice,
              body: {
                completed: true,
                title: "Read [chapter] two",
                dueDate: "2026-10-23",
              },
            })
          ).data.task.completed,
          true,
        );
        const result = await request(
          "/tasks?search=%5Bchapter%5D&status=completed&priority=High&dueDate=2026-10-23",
          { cookie: alice },
        );
        assert.equal(result.status, 200);
        assert.equal(result.data.tasks.length, 1);
        assert.equal(
          (await request("/tasks?status=incomplete", { cookie: alice })).data
            .tasks.length,
          0,
        );
        assert.equal(
          (await request("/tasks?status=unknown", { cookie: alice })).status,
          400,
        );
        assert.equal(
          (
            await request("/tasks/" + taskId, {
              method: "PATCH",
              cookie: alice,
              body: { completed: false },
            })
          ).data.task.completed,
          false,
        );
      });
      await t.test(
        "users cannot list, edit or delete another user’s tasks",
        async () => {
          assert.equal(
            (await request("/tasks", { cookie: bob })).data.tasks.length,
            0,
          );
          assert.equal(
            (
              await request("/tasks/" + taskId, {
                method: "PATCH",
                cookie: bob,
                body: { title: "Stolen" },
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await request("/tasks/" + taskId, {
                method: "DELETE",
                cookie: bob,
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await request("/tasks/" + taskId, {
                method: "PATCH",
                cookie: alice,
                body: {
                  user: (await User.findOne({ email: "other@example.test" }))
                    .id,
                },
              })
            ).status,
            400,
          );
          assert.equal(
            (await Task.findById(taskId)).title,
            "Read [chapter] two",
          );
        },
      );
      await t.test(
        "logout revokes session and login restores saved data",
        async () => {
          assert.equal(
            (await request("/auth/logout", { method: "POST", cookie: alice }))
              .status,
            204,
          );
          assert.equal(
            (await request("/tasks", { cookie: alice })).status,
            401,
          );
          alice = (
            await request("/auth/login", { method: "POST", body: account })
          ).cookie;
          assert.equal(
            (await request("/tasks", { cookie: alice })).data.tasks[0].id,
            taskId,
          );
        },
      );
      await t.test(
        "data and sessions survive database reconnection",
        async () => {
          await mongoose.disconnect();
          await mongoose.connect(mongo.getUri());
          assert.equal(
            (await request("/auth/me", { cookie: alice })).status,
            200,
          );
          assert.equal(
            (await request("/tasks", { cookie: alice })).data.tasks[0].id,
            taskId,
          );
        },
      );
      await t.test(
        "legacy import validates first, is idempotent and scoped",
        async () => {
          const items = [
            {
              id: "browser-1",
              title: "Imported task",
              priority: "Low",
              dueDate: "2026-10-22",
              completed: true,
              category: "Personal",
            },
          ];
          assert.equal(
            (
              await request("/tasks/import", {
                method: "POST",
                cookie: alice,
                body: { tasks: [...items, { id: "bad", title: "" }] },
              })
            ).status,
            400,
          );
          assert.equal(
            await Task.countDocuments({ importKey: { $exists: true } }),
            0,
          );
          for (let i = 0; i < 2; i++)
            assert.equal(
              (
                await request("/tasks/import", {
                  method: "POST",
                  cookie: alice,
                  body: { tasks: items },
                })
              ).status,
              200,
            );
          assert.equal(
            (await request("/tasks", { cookie: alice })).data.tasks.length,
            2,
          );
          await request("/tasks/import", {
            method: "POST",
            cookie: bob,
            body: { tasks: items },
          });
          assert.equal(
            (await request("/tasks", { cookie: bob })).data.tasks.length,
            1,
          );
        },
      );
      await t.test(
        "invalid IDs, malformed JSON, errors and deletion",
        async () => {
          assert.equal(
            (
              await request("/tasks/bad-id", {
                method: "DELETE",
                cookie: alice,
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request("/tasks/" + new mongoose.Types.ObjectId(), {
                method: "DELETE",
                cookie: alice,
              })
            ).status,
            404,
          );
          assert.equal((await request("/missing")).status, 404);
          const malformed = await fetch(base + "/api/tasks", {
            method: "POST",
            headers: {
              Origin: origin,
              "Content-Type": "application/json",
              "X-ProdTrack-Request": "1",
              Cookie: alice,
            },
            body: "{bad",
          });
          assert.equal(malformed.status, 400);
          assert.equal(
            (
              await request("/tasks", {
                method: "POST",
                cookie: alice,
                body: { title: "x".repeat(110000) },
              })
            ).status,
            413,
          );
          assert.equal(
            (
              await request("/tasks/" + taskId, {
                method: "DELETE",
                cookie: alice,
              })
            ).status,
            204,
          );
          assert.equal(await Task.findById(taskId), null);
        },
      );
      await t.test(
        "expired sessions are rejected even before TTL cleanup",
        async () => {
          await Session.updateMany(
            { user: (await User.findOne({ email: account.email }))._id },
            { $set: { expiresAt: new Date(0) } },
          );
          assert.equal(
            (await request("/auth/me", { cookie: alice })).status,
            401,
          );
        },
      );
      await t.test(
        "production cookies enforce Secure and host-only scope",
        async () => {
          process.env.NODE_ENV = "production";
          try {
            const result = await request("/auth/login", {
              method: "POST",
              body: account,
            });
            assert.equal(result.status, 200);
            const cookie = result.headers.get("set-cookie");
            assert.match(cookie, /^__Host-prodtrack_session=/);
            assert.match(cookie, /; Secure/);
            assert.doesNotMatch(cookie, /Domain=/);
          } finally {
            process.env.NODE_ENV = "test";
          }
        },
      );
      await t.test(
        "database outage returns explicit unavailable status",
        async () => {
          await mongoose.disconnect();
          assert.equal((await request("/health")).status, 503);
          assert.equal((await request("/tasks", { cookie: bob })).status, 503);
          await mongoose.connect(mongo.getUri());
        },
      );
      await t.test("authentication attempts are throttled", async () => {
        let status;
        for (let i = 0; i < 35; i++)
          status = (await request("/auth/login", { method: "POST", body: {} }))
            .status;
        assert.equal(status, 429);
      });
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect();
      await mongo.stop();
    }
  },
);
