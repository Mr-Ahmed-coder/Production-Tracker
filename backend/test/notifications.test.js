import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { app } from "../src/app.js";
import { connectDatabase } from "../src/config/database.js";
import User from "../src/models/User.js";
import Session from "../src/models/Session.js";
import Task from "../src/models/Task.js";
import RecurringTask from "../src/models/RecurringTask.js";
import TaskOccurrence from "../src/models/TaskOccurrence.js";
import ProductivitySettings from "../src/models/ProductivitySettings.js";
import NotificationSettings from "../src/models/NotificationSettings.js";
import EmailDelivery from "../src/models/EmailDelivery.js";
import { newToken, hashToken } from "../src/security.js";
import {
  notificationSettings,
  unsubscribeToken,
} from "../src/email/preferences.js";
import { runEmailWorker, localClock } from "../src/email/worker.js";
import {
  sendEmail,
  EmailProviderError,
  emailConfig,
} from "../src/email/provider.js";
import { reminderEmail } from "../src/email/content.js";

test("local reminder clock handles midnight, half-hour offsets and DST gaps/folds", () => {
  assert.deepEqual(
    localClock("Africa/Kampala", new Date("2026-11-18T21:00:00Z")),
    { date: "2026-11-19", time: "00:00" },
  );
  assert.deepEqual(
    localClock("Asia/Kolkata", new Date("2026-11-19T12:30:00Z")),
    { date: "2026-11-19", time: "18:00" },
  );
  assert.equal(
    localClock("America/New_York", new Date("2026-03-08T07:00:00Z")).time,
    "03:00",
  );
  for (const time of ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"])
    assert.deepEqual(localClock("America/New_York", new Date(time)), {
      date: "2026-11-01",
      time: "01:30",
    });
});
test("branded email escapes task HTML, includes plain text and unsubscribe, caps long checklists", () => {
  const payload = reminderEmail({
    from: "test@example.test",
    to: "recipient@example.test",
    date: "2026-11-19",
    tasks: Array.from({ length: 51 }, () => ({
      title: "<script>bad</script>&",
    })),
    calendarUrl: "https://app.example/calendar",
    unsubscribeUrl: "https://app.example/email/unsubscribe#token=abc",
  });
  assert.ok(!payload.html.includes("<script>"));
  assert.match(payload.html, /&lt;script&gt;/);
  assert.match(payload.text, /And 1 more/);
  assert.match(payload.text, /Unsubscribe:/);
  assert.match(payload.headers["List-Unsubscribe"], /https:/);
});
test("Resend transport uses stable idempotency key, never logs or exposes errors, and classifies safe retries", async () => {
  const config = { apiKey: "test-only-secret" },
    payload = { to: ["x@example.test"] };
  let calls = 0;
  assert.equal(
    await sendEmail(payload, "daily:owner:2026-11-19", {
      config,
      fetcher: async (url, options) => {
        calls++;
        assert.equal(url, "https://api.resend.com/emails");
        assert.equal(
          options.headers["Idempotency-Key"],
          "daily:owner:2026-11-19",
        );
        assert.equal(options.headers.Authorization, "Bearer test-only-secret");
        assert.equal(options.body, JSON.stringify(payload));
        return Response.json({ id: "provider-id" });
      },
    }),
    "provider-id",
  );
  assert.equal(calls, 1);
  for (const [status, retryable] of [
    [400, false],
    [401, false],
    [422, false],
    [429, true],
    [503, true],
    [409, true],
  ]) {
    await assert.rejects(
      sendEmail(payload, "key", {
        config,
        fetcher: async () =>
          new Response("private provider response", { status }),
      }),
      (error) =>
        error instanceof EmailProviderError &&
        error.retryable === retryable &&
        !error.message.includes("private"),
    );
  }
  await assert.rejects(
    sendEmail(payload, "key", {
      config,
      fetcher: async () => {
        throw new Error("private details");
      },
    }),
    (e) => e.code === "network_or_timeout" && e.retryable,
  );
  await assert.rejects(
    sendEmail(payload, "key", {
      config,
      fetcher: async () => Response.json({}),
    }),
    (e) => e.code === "invalid_response",
  );
});

test(
  "email preferences and durable worker with isolated MongoDB and a mocked provider",
  { timeout: 180000 },
  async (t) => {
    const mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri();
    process.env.CLIENT_ORIGIN = "http://127.0.0.1:5173";
    process.env.EMAIL_APP_URL = process.env.CLIENT_ORIGIN;
    process.env.EMAIL_FROM = "StudyMomentum <reminders@example.test>";
    process.env.RESEND_API_KEY = "test-no-real-emails";
    process.env.EMAIL_TOKEN_SECRET = "isolated-test-secret-".repeat(3);
    process.env.EMAIL_REMINDERS_ENABLED = "true";
    let server;
    try {
      await connectDatabase();
      server = app.listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      const base = "http://127.0.0.1:" + server.address().port + "/api";
      const req = async (path, method = "GET", body, cookie, extra = {}) => {
        const response = await fetch(base + path, {
          method,
          headers: {
            Origin: process.env.CLIENT_ORIGIN,
            "X-ProdTrack-Request": "1",
            "Content-Type": "application/json",
            ...(cookie ? { Cookie: cookie } : {}),
            ...extra,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, data: await response.json() };
      };
      const fixture = async (
        label,
        zone = "Africa/Kampala",
        overrides = {},
      ) => {
        const user = await User.create({
          name: label,
          email: label + "@example.test",
          passwordHash: "not-used-in-this-test",
        });
        const token = newToken();
        await Session.create({
          user: user._id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 3600000),
        });
        await ProductivitySettings.create({ user: user._id, timeZone: zone });
        await NotificationSettings.create({
          user: user._id,
          enabled: true,
          verifiedEmail: user.email,
          verifiedAt: new Date(),
          ...overrides,
        });
        return { user, cookie: "prodtrack_session=" + token };
      };
      const task = (owner, title, props = {}) =>
        Task.create({ user: owner, title, dueDate: "2026-11-19", ...props });
      const now = new Date("2026-11-19T15:05:00Z");
      const sent = [],
        provider = async (payload, key) => {
          sent.push({ payload, key });
          return "mock-" + key;
        };
      let alice, bob, verification, aliceToken;
      await t.test(
        "opt-in defaults, owner-scoped settings, validation and unchanged CSRF",
        async () => {
          alice = await fixture("alice", "Africa/Kampala", {
            enabled: false,
            verifiedAt: null,
            verifiedEmail: null,
          });
          bob = await fixture("bob", "Africa/Kampala", {
            enabled: false,
            verifiedAt: null,
            verifiedEmail: null,
          });
          assert.equal((await req("/notifications/settings")).status, 401);
          const settings = await req(
            "/notifications/settings",
            "GET",
            undefined,
            alice.cookie,
          );
          assert.equal(settings.data.enabled, false);
          assert.equal(settings.data.emailVerified, false);
          assert.equal(settings.data.timeZone, "Africa/Kampala");
          assert.ok(!JSON.stringify(settings).includes("unsubscribeNonce"));
          for (const body of [
            { user: String(bob.user._id) },
            { reminderTime: "25:00" },
            { enabled: "true" },
            { verifiedAt: new Date() },
          ])
            assert.equal(
              (await req("/notifications/settings", "PUT", body, alice.cookie))
                .status,
              400,
            );
          assert.equal(
            (
              await req(
                "/notifications/settings",
                "PUT",
                { enabled: true },
                alice.cookie,
              )
            ).status,
            409,
          );
          assert.equal(
            (
              await req(
                "/notifications/settings",
                "PUT",
                { enabled: false },
                alice.cookie,
                { Origin: "https://invalid.example" },
              )
            ).status,
            403,
          );
          const fresh = await User.create({
            name: "Default",
            email: "default@example.test",
            passwordHash: "unused",
          });
          assert.equal((await notificationSettings(fresh._id)).enabled, false);
        },
      );
      await t.test(
        "explicit verification request is queued, hashed, throttled across concurrent requests and not automatically sent",
        async () => {
          const responses = await Promise.all(
            Array.from({ length: 4 }, () =>
              req("/notifications/verification", "POST", {}, alice.cookie),
            ),
          );
          assert.equal(responses.filter((r) => r.status === 202).length, 1);
          assert.equal(responses.filter((r) => r.status === 429).length, 3);
          verification = await EmailDelivery.findOne({
            user: alice.user._id,
            kind: "verification",
          }).select("+payload");
          aliceToken = verification.payload.text.match(
            /#verify=([a-f0-9]{64})/,
          )[1];
          const settings = await NotificationSettings.findOne({
            user: alice.user._id,
          }).select("+verificationHash");
          assert.equal(settings.verificationHash, hashToken(aliceToken));
          assert.equal(
            await EmailDelivery.countDocuments({ kind: "verification" }),
            1,
          );
          assert.equal(sent.length, 0);
          const stats = await runEmailWorker({ send: provider });
          assert.equal(stats.accepted, 1);
          assert.match(sent[0].payload.subject, /Verify/);
          assert.equal(
            (await EmailDelivery.findById(verification._id).select("+payload"))
              .payload,
            undefined,
          );
        },
      );
      await t.test(
        "verification requires the owning account, cannot be replayed, and never enables reminders automatically",
        async () => {
          assert.equal(
            (await req("/notifications/verify", "POST", { token: aliceToken }))
              .status,
            401,
          );
          assert.equal(
            (
              await req(
                "/notifications/verify",
                "POST",
                { token: aliceToken },
                bob.cookie,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await req(
                "/notifications/verify",
                "POST",
                { token: aliceToken },
                alice.cookie,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await req(
                "/notifications/verify",
                "POST",
                { token: aliceToken },
                alice.cookie,
              )
            ).status,
            400,
          );
          const value = (
            await req("/notifications/settings", "GET", undefined, alice.cookie)
          ).data;
          assert.equal(value.emailVerified, true);
          assert.equal(value.enabled, false);
          assert.equal(
            (
              await req(
                "/notifications/settings",
                "PUT",
                { enabled: true, reminderTime: "18:00" },
                alice.cookie,
              )
            ).status,
            200,
          );
        },
      );
      await t.test(
        "unfinished current-day tasks and incomplete recurring occurrences; no future, completed, skipped or other-user data",
        async () => {
          await task(alice.user._id, "Read today");
          await task(alice.user._id, "Planned today, due later", {
            scheduledDate: "2026-11-19",
            dueDate: "2026-11-25",
          });
          await task(alice.user._id, "Completed", {
            completed: true,
            completedAt: now,
          });
          await task(alice.user._id, "Future", { scheduledDate: "2026-11-20" });
          await task(alice.user._id, "Overdue unscheduled", {
            dueDate: "2026-11-18",
          });
          await task(bob.user._id, "Private Bob task");
          const series = [];
          for (const label of [
            "Repeat English",
            "Repeat completed",
            "Repeat skipped",
            "Repeat stopped",
            "Repeat deleted",
          ])
            series.push(
              await RecurringTask.create({
                user: alice.user._id,
                title: label,
                startDate: "2026-11-19",
                endDate: "2026-11-25",
                weekdays: [4],
                timeZone: "Africa/Kampala",
                createKey: label,
                createHash: "fixture",
              }),
            );
          await TaskOccurrence.create({
            user: alice.user._id,
            series: series[1]._id,
            date: "2026-11-19",
            completed: true,
            completedAt: now,
            title: "Repeat completed",
            priority: "Medium",
          });
          await TaskOccurrence.create({
            user: alice.user._id,
            series: series[2]._id,
            date: "2026-11-19",
            skipped: true,
            title: "Repeat skipped",
            priority: "Medium",
          });
          await RecurringTask.updateOne(
            { _id: series[3]._id },
            { $set: { stoppedAfter: "2026-11-18" } },
          );
          await RecurringTask.updateOne(
            { _id: series[4]._id },
            { $set: { deletedAt: now } },
          );
          const before = await Task.find({ user: alice.user._id }).lean();
          const stats = await runEmailWorker({ now, send: provider });
          assert.equal(stats.accepted, 1);
          const message = sent.at(-1).payload.text;
          for (const title of [
            "Read today",
            "Planned today, due later",
            "Repeat English",
          ])
            assert.ok(message.includes(title));
          for (const title of [
            "Completed",
            "Future",
            "Private Bob task",
            "Overdue",
            "Repeat completed",
            "Repeat skipped",
            "Repeat stopped",
            "Repeat deleted",
          ])
            assert.ok(!message.includes(title));
          assert.deepEqual(
            await Task.find({ user: alice.user._id }).lean(),
            before,
          );
        },
      );
      await t.test(
        "repeated runs and concurrent workers send one daily summary per user/date",
        async () => {
          const concurrent = await fixture("concurrent");
          await task(concurrent.user._id, "Concurrent");
          const initial = sent.length;
          await Promise.all(
            Array.from({ length: 5 }, () =>
              runEmailWorker({ now, send: provider }),
            ),
          );
          assert.equal(sent.length - initial, 1);
          assert.equal(
            await EmailDelivery.countDocuments({
              user: concurrent.user._id,
              kind: "daily",
            }),
            1,
          );
          await runEmailWorker({ now, send: provider });
          assert.equal(sent.length - initial, 1);
        },
      );
      await t.test(
        "disabled, unverified, changed email, empty and completed-only checklists never send",
        async () => {
          for (const [label, props, complete] of [
            ["disabled", { enabled: false }, false],
            ["unverified", { verifiedAt: null }, false],
            ["changed", { verifiedEmail: "old@example.test" }, false],
            ["complete", {}, true],
          ]) {
            const f = await fixture(label, "Africa/Kampala", props);
            await task(f.user._id, label, { completed: complete });
          }
          await fixture("empty");
          const initial = sent.length;
          await runEmailWorker({ now, send: provider });
          assert.equal(sent.length, initial);
        },
      );
      await t.test(
        "timezones determine the local date/time, and catch up only within today",
        async () => {
          const ny = await fixture("newyork", "America/New_York");
          await task(ny.user._id, "NY evening");
          const india = await fixture("india", "Asia/Kolkata");
          await task(india.user._id, "India evening");
          const initial = sent.length;
          await runEmailWorker({ now, send: provider });
          assert.equal(sent.length, initial + 1);
          assert.equal(sent.at(-1).payload.to[0], india.user.email);
          await runEmailWorker({
            now: new Date("2026-11-19T23:05:00Z"),
            send: provider,
          });
          assert.equal(sent.at(-1).payload.to[0], ny.user.email);
          assert.equal(
            await EmailDelivery.countDocuments({
              user: ny.user._id,
              localDate: "2026-11-19",
            }),
            1,
          );
        },
      );
      await t.test(
        "network ambiguity retries an identical payload/key even if tasks change; provider deduplicates acceptance",
        async () => {
          const f = await fixture("retry");
          await task(f.user._id, "Original title");
          const seen = new Map();
          let physical = 0,
            first = true;
          const mock = async (payload, key) => {
            if (!seen.has(key)) {
              seen.set(key, JSON.stringify(payload));
              physical++;
            } else assert.equal(JSON.stringify(payload), seen.get(key));
            if (first) {
              first = false;
              throw new EmailProviderError("network_or_timeout", true);
            }
            return "same-provider-id";
          };
          const result = await runEmailWorker({ now, send: mock });
          assert.equal(result.retry, 1);
          await Task.updateMany(
            { user: f.user._id },
            {
              $set: { title: "Changed after attempted send", completed: true },
            },
          );
          const again = await runEmailWorker({
            now: new Date(+now + 5 * 60000),
            send: mock,
          });
          assert.equal(again.accepted, 1);
          assert.equal(physical, 1);
          const row = await EmailDelivery.findOne({ user: f.user._id });
          assert.equal(row.attempts, 2);
          assert.equal(row.history.length, 4);
        },
      );
      await t.test(
        "DST fallback sends once, spring gap catches up, and midnight uses the saved local calendar date",
        async () => {
          const fold = await fixture("fold", "America/New_York", {
            reminderTime: "01:30",
          });
          await task(fold.user._id, "Fall checklist", {
            dueDate: "2026-11-01",
          });
          const initial = sent.length;
          await runEmailWorker({
            now: new Date("2026-11-01T05:35:00Z"),
            send: provider,
          });
          await runEmailWorker({
            now: new Date("2026-11-01T06:35:00Z"),
            send: provider,
          });
          assert.equal(sent.length, initial + 1);
          const gap = await fixture("gap", "America/New_York", {
            reminderTime: "02:30",
          });
          await task(gap.user._id, "Spring checklist", {
            dueDate: "2026-03-08",
          });
          await runEmailWorker({
            now: new Date("2026-03-08T06:55:00Z"),
            send: provider,
          });
          assert.equal(sent.length, initial + 1);
          await runEmailWorker({
            now: new Date("2026-03-08T07:00:00Z"),
            send: provider,
          });
          assert.equal(sent.length, initial + 2);
          const midnight = await fixture("midnight", "Africa/Kampala", {
            reminderTime: "00:00",
          });
          await task(midnight.user._id, "New local day", {
            dueDate: "2026-01-02",
          });
          await task(midnight.user._id, "Tomorrow excluded", {
            dueDate: "2026-01-03",
          });
          await runEmailWorker({
            now: new Date("2026-01-01T21:05:00Z"),
            send: provider,
          });
          assert.match(sent.at(-1).payload.text, /New local day/);
          assert.ok(!sent.at(-1).payload.text.includes("Tomorrow excluded"));
          assert.equal(
            (await EmailDelivery.findOne({ user: midnight.user._id }))
              .localDate,
            "2026-01-02",
          );
        },
      );
      await t.test(
        "queued jobs respect opt-out and completed checklists before the first send attempt",
        async () => {
          const opted = await fixture("queuedoptout"),
            complete = await fixture("queuedcomplete");
          await task(opted.user._id, "Do not send after opt out");
          await task(complete.user._id, "Already finished before dispatch");
          for (const f of [opted, complete])
            await EmailDelivery.create({
              user: f.user._id,
              dedupeKey: `daily:${f.user._id}:2026-11-19`,
              kind: "daily",
              localDate: "2026-11-19",
              recipient: f.user.email,
              payload: {
                from: "qa@example.test",
                to: [f.user.email],
                text: "queued checklist",
              },
              retryUntil: new Date(+now + 3600000),
              nextAttemptAt: now,
            });
          await NotificationSettings.updateOne(
            { user: opted.user._id },
            { $set: { enabled: false } },
          );
          await Task.updateMany(
            { user: complete.user._id },
            { $set: { completed: true } },
          );
          const count = sent.length;
          const result = await runEmailWorker({ now, send: provider });
          assert.equal(result.cancelled, 2);
          assert.equal(sent.length, count);
        },
      );
      await t.test(
        "expired leases recover with the same key, and retries stop before the provider deduplication window",
        async () => {
          const f = await fixture("crash");
          await task(f.user._id, "Recover me");
          await runEmailWorker({
            now,
            send: async () => {
              throw new EmailProviderError("network_or_timeout", true);
            },
          });
          const row = await EmailDelivery.findOne({ user: f.user._id });
          await EmailDelivery.updateOne(
            { _id: row._id },
            {
              $set: {
                status: "sending",
                leaseUntil: new Date(+now - 1),
                leaseToken: "dead-process",
              },
            },
          );
          const result = await runEmailWorker({
            now: new Date(+now + 60000),
            send: provider,
          });
          assert.equal(result.accepted, 1);
          assert.equal(sent.at(-1).key, row.dedupeKey);
          const late = await fixture("late");
          await task(late.user._id, "No late replay");
          await runEmailWorker({
            now,
            send: async () => {
              throw new EmailProviderError("http_503", true);
            },
          });
          await EmailDelivery.updateOne(
            { user: late.user._id },
            { $set: { retryUntil: new Date(+now - 1) } },
          );
          const before = sent.length;
          await runEmailWorker({ now, send: provider });
          assert.equal(sent.length, before);
          assert.equal(
            (await EmailDelivery.findOne({ user: late.user._id })).status,
            "uncertain",
          );
        },
      );
      await t.test(
        "permanent provider failures are recorded and never retried automatically",
        async () => {
          const f = await fixture("permanent");
          await task(f.user._id, "Rejected sender");
          const result = await runEmailWorker({
            now,
            send: async () => {
              throw new EmailProviderError("http_422", false);
            },
          });
          assert.equal(result.failed, 1);
          const row = await EmailDelivery.findOne({ user: f.user._id });
          assert.equal(row.status, "failed");
          assert.equal(row.lastFailure, "http_422");
          assert.equal(
            (await runEmailWorker({ now, send: provider })).accepted,
            0,
          );
        },
      );
      await t.test(
        "unsubscribe works without a session, is repeatable and scoped, and still works while sending is globally disabled",
        async () => {
          const settings = await NotificationSettings.findOne({
            user: alice.user._id,
          }).select("+unsubscribeNonce");
          const token = unsubscribeToken(
            settings,
            process.env.EMAIL_TOKEN_SECRET,
          );
          await NotificationSettings.updateOne(
            { user: bob.user._id },
            { $set: { enabled: true } },
          );
          assert.equal(
            (
              await req("/email-actions/unsubscribe", "POST", {
                token: token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"),
              })
            ).status,
            400,
          );
          process.env.EMAIL_REMINDERS_ENABLED = "false";
          assert.equal(
            (await req("/email-actions/unsubscribe", "POST", { token })).status,
            200,
          );
          assert.equal(
            (await req("/email-actions/unsubscribe", "POST", { token })).status,
            200,
          );
          assert.equal(
            (await NotificationSettings.findOne({ user: alice.user._id }))
              .enabled,
            false,
          );
          assert.equal(
            (await NotificationSettings.findOne({ user: bob.user._id }))
              .enabled,
            true,
          );
          assert.equal(
            (await req("/notifications/verification", "POST", {}, bob.cookie))
              .status,
            503,
          );
          assert.equal(emailConfig(), null);
          await assert.rejects(
            runEmailWorker({ now, send: provider }),
            /disabled or not configured/,
          );
          process.env.EMAIL_REMINDERS_ENABLED = "true";
        },
      );
      await t.test(
        "dry-run never sends or creates delivery records; settings and delivery history survive reconnection",
        async () => {
          const f = await fixture("dryrun");
          await task(f.user._id, "Preview");
          const before = await EmailDelivery.countDocuments();
          const stats = await runEmailWorker({
            now,
            dryRun: true,
            send: () => {
              throw new Error("must never send");
            },
          });
          assert.ok(stats.due > 0);
          assert.equal(await EmailDelivery.countDocuments(), before);
          await mongoose.disconnect();
          await mongoose.connect(mongo.getUri());
          assert.equal(await EmailDelivery.countDocuments(), before);
          assert.equal(
            (await NotificationSettings.findOne({ user: alice.user._id }))
              .enabled,
            false,
          );
        },
      );
      await t.test(
        "verification expiry, email binding and rolling daily limits cannot be bypassed",
        async () => {
          const f = await fixture("expiredverification", "Africa/Kampala", {
            enabled: false,
            verifiedAt: null,
            verifiedEmail: null,
          });
          const token = newToken();
          await NotificationSettings.updateOne(
            { user: f.user._id },
            {
              $set: {
                verificationHash: hashToken(token),
                verificationEmail: f.user.email,
                verificationExpiresAt: new Date(Date.now() - 1),
              },
            },
          );
          assert.equal(
            (await req("/notifications/verify", "POST", { token }, f.cookie))
              .status,
            400,
          );
          await NotificationSettings.updateOne(
            { user: f.user._id },
            {
              $set: {
                verificationEmail: "previous@example.test",
                verificationExpiresAt: new Date(Date.now() + 60000),
              },
            },
          );
          assert.equal(
            (await req("/notifications/verify", "POST", { token }, f.cookie))
              .status,
            400,
          );
          await NotificationSettings.updateOne(
            { user: f.user._id },
            {
              $set: {
                verificationRequests: [
                  new Date(Date.now() - 3600000),
                  new Date(Date.now() - 1800000),
                  new Date(Date.now() - 900000),
                ],
              },
            },
          );
          assert.equal(
            (await req("/notifications/verification", "POST", {}, f.cookie))
              .status,
            429,
          );
          await NotificationSettings.updateOne(
            { user: f.user._id },
            {
              $set: {
                verificationRequests: [
                  new Date(Date.now() - 25 * 3600000),
                  new Date(Date.now() - 1800000),
                  new Date(Date.now() - 900000),
                ],
              },
            },
          );
          assert.equal(
            (await req("/notifications/verification", "POST", {}, f.cookie))
              .status,
            202,
          );
        },
      );
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect();
      await mongo.stop();
    }
  },
);
