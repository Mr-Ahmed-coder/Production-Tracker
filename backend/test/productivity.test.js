import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { app } from "../src/app.js";
import { connectDatabase } from "../src/config/database.js";
import FocusSession from "../src/models/FocusSession.js";
import Task from "../src/models/Task.js";
import Goal from "../src/models/Goal.js";
import User from "../src/models/User.js";
import Habit from "../src/models/Habit.js";
import Completion from "../src/models/HabitCompletion.js";
import {
  durationMs,
  splitInterval,
  expire,
  LEASE_MS,
} from "../src/domain/focus.js";
import { activity } from "../src/domain/analytics.js";
import { dateInZone, shiftDate } from "../src/domain/calendar.js";

test("focus intervals exclude pauses, future and negative intervals", () => {
  const s = {
    state: "running",
    segments: [
      { start: new Date(1000), end: new Date(5000) },
      { start: new Date(6000), end: new Date(5000) },
    ],
    runningSince: new Date(10000),
    leaseUntil: new Date(20000),
  };
  assert.equal(durationMs(s, new Date(15000)), 9000);
  assert.equal(durationMs(s, new Date(99000)), 14000);
  s.segments = s.segments.slice(0, 1);
  assert.equal(expire(s, new Date(30000)), true);
  assert.equal(s.state, "paused");
  assert.equal(durationMs(s, new Date(99999)), 14000);
  assert.equal(expire(s), false);
});
test("focus splits local midnight, DST 23/25-hour days and non-hour offsets", () => {
  assert.deepEqual(
    splitInterval(
      "2026-10-20T20:30:00Z",
      "2026-10-20T21:30:00Z",
      "Africa/Kampala",
    ),
    [
      { date: "2026-10-20", milliseconds: 1800000 },
      { date: "2026-10-21", milliseconds: 1800000 },
    ],
  );
  assert.deepEqual(
    splitInterval(
      "2026-03-08T05:00:00Z",
      "2026-03-09T04:00:00Z",
      "America/New_York",
    ),
    [{ date: "2026-03-08", milliseconds: 23 * 3600000 }],
  );
  assert.deepEqual(
    splitInterval(
      "2026-11-01T04:00:00Z",
      "2026-11-02T05:00:00Z",
      "America/New_York",
    ),
    [{ date: "2026-11-01", milliseconds: 25 * 3600000 }],
  );
  assert.deepEqual(
    splitInterval(
      "2026-10-20T18:00:00Z",
      "2026-10-20T19:00:00Z",
      "Asia/Kathmandu",
    ),
    [
      { date: "2026-10-20", milliseconds: 900000 },
      { date: "2026-10-21", milliseconds: 2700000 },
    ],
  );
  assert.deepEqual(splitInterval("invalid", "invalid", "UTC"), []);
});

test(
  "Phase 4 authenticated persistence, focus and analytics with isolated MongoDB",
  { timeout: 300000 },
  async (t) => {
    const mongo = await MongoMemoryServer.create();
    let server;
    process.env.MONGODB_URI = mongo.getUri();
    process.env.CLIENT_ORIGIN = "http://127.0.0.1:5173";
    try {
      await connectDatabase();
      server = app.listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      let base = "http://127.0.0.1:" + server.address().port + "/api";
      async function req(path, method = "GET", body, cookie) {
        const r = await fetch(base + path, {
          method,
          headers: {
            Origin: process.env.CLIENT_ORIGIN,
            "Content-Type": "application/json",
            "X-ProdTrack-Request": "1",
            ...(cookie ? { Cookie: cookie } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return {
          status: r.status,
          data: r.status === 204 ? null : await r.json(),
          cookie: r.headers.get("set-cookie")?.split(";")[0],
        };
      }
      const account = {
        name: "Phase Four",
        email: "phase4@example.test",
        password: "Phase four testing password!",
      };
      const alice = (await req("/auth/register", "POST", account)).cookie,
        bob = (
          await req("/auth/register", "POST", {
            ...account,
            email: "other4@example.test",
          })
        ).cookie;
      const user = await User.findOne({ email: account.email }),
        other = await User.findOne({ email: "other4@example.test" }),
        today = dateInZone("Africa/Kampala");
      let sessionId, task, goal;
      await t.test(
        "all new endpoints require authentication and reject invalid fields/settings",
        async () => {
          for (const path of [
            "/focus",
            "/focus/active",
            "/productivity/analytics",
            "/productivity/settings",
            "/productivity/reviews",
          ])
            assert.equal((await req(path)).status, 401);
          assert.equal(
            (await req("/focus", "POST", { user: String(other._id) }, alice))
              .status,
            400,
          );
          for (const data of [
            { timeZone: "No/such_zone" },
            { dailyTargetMinutes: -2 },
            { dailyTargetMinutes: 3.5 },
            { dailyTargetMinutes: 1441 },
            { owner: "forged" },
          ])
            assert.equal(
              (await req("/productivity/settings", "PUT", data, alice)).status,
              400,
            );
          assert.equal(
            (
              await req(
                "/productivity/analytics?from=bad",
                "GET",
                undefined,
                alice,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await req(
                "/productivity/analytics?from=2020-01-01&to=" + today,
                "GET",
                undefined,
                alice,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await req(
                "/productivity/analytics?to=" + shiftDate(today, 1),
                "GET",
                undefined,
                alice,
              )
            ).status,
            400,
          );
        },
      );
      await t.test(
        "save preferences, owner-checked task/goal links, one active focus session",
        async () => {
          assert.equal(
            (
              await req(
                "/productivity/settings",
                "PUT",
                { timeZone: "Africa/Kampala", dailyTargetMinutes: 60 },
                alice,
              )
            ).status,
            200,
          );
          assert.equal(
            (await req("/productivity/settings", "GET", undefined, bob)).data
              .dailyTargetMinutes,
            180,
          );
          task = (
            await req(
              "/tasks",
              "POST",
              { title: "Plan chapter", dueDate: today },
              alice,
            )
          ).data.task;
          goal = (
            await req(
              "/goals",
              "POST",
              {
                title: "Write a book",
                targetDate: today,
                milestones: [
                  { title: "Chapter", target: 2, current: 0, unit: "drafts" },
                ],
              },
              alice,
            )
          ).data.item;
          assert.equal(
            (await req("/focus", "POST", { taskId: task.id }, bob)).status,
            400,
          );
          assert.equal(
            (await req("/focus", "POST", { goalId: goal.id }, bob)).status,
            400,
          );
          const results = await Promise.all([
            req("/focus", "POST", { taskId: task.id, goalId: goal.id }, alice),
            req("/focus", "POST", { taskId: task.id }, alice),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
          sessionId = results.find((r) => r.status === 201).data.item.id;
          assert.equal(
            await FocusSession.countDocuments({ user: user._id, active: true }),
            1,
          );
          assert.equal(
            (await req("/focus/" + sessionId + "/pause", "POST", {}, bob))
              .status,
            404,
          );
        },
      );
      await t.test(
        "start, pause, idempotent pause, resume, heartbeat and finish use server durations",
        async () => {
          const now = Date.now();
          await FocusSession.updateOne(
            { _id: sessionId },
            {
              $set: {
                runningSince: new Date(now - 10000),
                leaseUntil: new Date(now + LEASE_MS),
              },
            },
          );
          let r = await req(
            "/focus/" + sessionId + "/pause",
            "POST",
            {},
            alice,
          );
          assert.equal(r.status, 200);
          assert.equal(r.data.item.state, "paused");
          assert.ok(
            r.data.item.durationMs >= 10000 && r.data.item.durationMs < 15000,
          );
          const paused = r.data.item.durationMs;
          r = await req("/focus/" + sessionId + "/pause", "POST", {}, alice);
          assert.equal(r.data.item.durationMs, paused);
          assert.equal(
            (
              await req(
                "/focus/" + sessionId + "/resume",
                "POST",
                { durationMs: 999999 },
                alice,
              )
            ).status,
            400,
          );
          r = await req("/focus/" + sessionId + "/resume", "POST", {}, alice);
          assert.equal(r.data.item.state, "running");
          const before = await FocusSession.findById(sessionId);
          assert.equal(before.segments.length, 1);
          assert.equal(
            (await req("/focus/" + sessionId + "/heartbeat", "POST", {}, alice))
              .status,
            200,
          );
          r = await req("/focus/" + sessionId + "/finish", "POST", {}, alice);
          assert.equal(r.data.item.state, "finished");
          assert.equal(r.data.item.active, false);
          assert.ok(r.data.item.durationMs >= paused);
          const duration = r.data.item.durationMs;
          assert.equal(
            (await req("/focus/" + sessionId + "/finish", "POST", {}, alice))
              .data.item.durationMs,
            duration,
          );
          assert.equal(
            (await req("/focus/" + sessionId + "/resume", "POST", {}, alice))
              .status,
            409,
          );
        },
      );
      await t.test(
        "expired lease pauses on reconnect and cannot count offline time",
        async () => {
          const s = (await req("/focus", "POST", { taskId: null }, alice)).data
              .item,
            now = Date.now();
          await FocusSession.updateOne(
            { _id: s.id },
            {
              $set: {
                runningSince: new Date(now - 120000),
                leaseUntil: new Date(now - 75000),
              },
            },
          );
          let r = await req("/focus/active", "GET", undefined, alice);
          assert.equal(r.data.item.state, "paused");
          assert.equal(r.data.item.durationMs, 45000);
          r = await req("/focus/" + s.id + "/heartbeat", "POST", {}, alice);
          assert.equal(r.data.item.state, "paused");
          assert.equal(r.data.item.durationMs, 45000);
          assert.equal(
            (await req("/focus/" + s.id + "/resume", "POST", {}, alice)).data
              .item.state,
            "running",
          );
          await req("/focus/" + s.id + "/discard", "POST", {}, alice);
          assert.equal(
            (await req("/focus", "GET", undefined, alice)).data.items.some(
              (i) => i.id === s.id,
            ),
            false,
          );
        },
      );
      await t.test(
        "concurrent actions never duplicate intervals; old sessions cannot resume",
        async () => {
          const s = (await req("/focus", "POST", { taskId: null }, alice)).data
            .item;
          const results = await Promise.all([
            req("/focus/" + s.id + "/pause", "POST", {}, alice),
            req("/focus/" + s.id + "/pause", "POST", {}, alice),
          ]);
          assert.ok(results.every((r) => [200, 409].includes(r.status)));
          let doc = await FocusSession.findById(s.id);
          assert.equal(doc.segments.length, 1);
          await FocusSession.collection.updateOne(
            { _id: new mongoose.Types.ObjectId(s.id) },
            { $set: { createdAt: new Date(Date.now() - 25 * 3600000) } },
          );
          assert.equal(
            (await req("/focus/" + s.id + "/resume", "POST", {}, alice)).status,
            400,
          );
          await req("/focus/" + s.id + "/discard", "POST", {}, alice);
        },
      );
      await t.test(
        "task completion dates survive title edits and clear on reopen; no invented legacy timestamps",
        async () => {
          let r = await req(
            "/tasks/" + task.id,
            "PATCH",
            { completed: true },
            alice,
          );
          assert.equal(r.status, 200);
          const first = (await Task.findById(task.id)).completedAt;
          assert.ok(first instanceof Date);
          await req(
            "/tasks/" + task.id,
            "PATCH",
            { title: "Updated chapter" },
            alice,
          );
          assert.equal(+(await Task.findById(task.id)).completedAt, +first);
          await req("/tasks/" + task.id, "PATCH", { completed: false }, alice);
          assert.equal((await Task.findById(task.id)).completedAt, null);
          await Task.create({
            user: user._id,
            title: "Legacy completed",
            dueDate: today,
            completed: true,
          });
          const data = (
            await req(
              "/productivity/analytics?from=" + today + "&to=" + today,
              "GET",
              undefined,
              alice,
            )
          ).data;
          assert.equal(data.legacyCompletedTasks, 1);
          assert.equal(data.days[0].tasksCompleted, 0);
          await req("/tasks/" + task.id, "PATCH", { completed: true }, alice);
        },
      );
      await t.test(
        "milestone completion timestamps preserve, reset and recalculate accurately",
        async () => {
          let m = goal.milestones[0];
          const payload = (current) => ({
            milestones: [
              {
                id: m.id,
                title: m.title,
                target: m.target,
                current,
                unit: m.unit,
                targetDate: null,
              },
            ],
          });
          await req("/goals/" + goal.id, "PATCH", payload(2), alice);
          let saved = await Goal.findById(goal.id);
          const timestamp = saved.milestones[0].achievedAt;
          assert.ok(timestamp instanceof Date);
          await req("/goals/" + goal.id, "PATCH", payload(2), alice);
          saved = await Goal.findById(goal.id);
          assert.equal(+saved.milestones[0].achievedAt, +timestamp);
          await req("/goals/" + goal.id, "PATCH", payload(1), alice);
          assert.equal(
            (await Goal.findById(goal.id)).milestones[0].achievedAt,
            null,
          );
          await req("/goals/" + goal.id, "PATCH", payload(2), alice);
        },
      );
      await t.test(
        "analytics uses actual focus intervals split by timezone and excludes discarded/other user data",
        async () => {
          const day = shiftDate(today, -3),
            next = shiftDate(day, 1);
          await FocusSession.create({
            user: user._id,
            state: "finished",
            active: false,
            segments: [
              {
                start: new Date(day + "T20:30:00Z"),
                end: new Date(day + "T21:30:00Z"),
              },
            ],
            createdAt: new Date(day + "T20:30:00Z"),
          });
          await FocusSession.create({
            user: user._id,
            state: "discarded",
            active: false,
            segments: [
              {
                start: new Date(day + "T10:00:00Z"),
                end: new Date(day + "T20:00:00Z"),
              },
            ],
          });
          await FocusSession.create({
            user: other._id,
            state: "finished",
            active: false,
            segments: [
              {
                start: new Date(day + "T10:00:00Z"),
                end: new Date(day + "T20:00:00Z"),
              },
            ],
          });
          const h = await Habit.create({
            user: user._id,
            title: "Test analytics habit",
            timeZone: "Africa/Kampala",
            startDate: day,
            schedule: [{ effectiveFrom: day, weekdays: [0, 1, 2, 3, 4, 5, 6] }],
            pauses: [],
          });
          await Completion.create({ user: user._id, habit: h._id, date: day });
          const data = await activity(user._id, day, today);
          assert.equal(data.days[0].focusMs, 1800000);
          assert.equal(data.days[1].date, next);
          assert.equal(data.days[1].focusMs, 1800000);
          assert.equal(data.days[0].targetPercent, 50);
          assert.equal(data.days[0].habitsCompleted, 1);
          assert.equal(data.days[0].habitConsistency, 100);
          assert.equal(data.days.at(-1).tasksCompleted, 1);
          assert.equal(data.days.at(-1).milestonesAchieved, 1);
          assert.equal(data.goals[0].progress, 100);
          assert.equal(
            (
              await req(
                "/productivity/analytics?from=" + day + "&to=" + today,
                "GET",
                undefined,
                bob,
              )
            ).data.goals.length,
            0,
          );
        },
      );
      await t.test(
        "daily review create/read/edit, version conflict, duplicate prevention and isolation",
        async () => {
          const path = "/productivity/reviews/" + today,
            body = {
              wentWell: "Made space for reading",
              challenges: "Distractions",
              tomorrow: "Finish chapter",
              version: null,
            };
          let r = await req(path, "PUT", body, alice);
          assert.equal(r.status, 201);
          const version = r.data.item.version;
          assert.equal((await req(path, "PUT", body, alice)).status, 409);
          r = await req(path, "GET", undefined, alice);
          assert.equal(r.data.item.wentWell, body.wentWell);
          assert.equal(r.data.summary.days[0].tasksCompleted, 1);
          assert.equal(
            (await req(path, "GET", undefined, bob)).data.item,
            null,
          );
          assert.equal((await req(path, "DELETE", undefined, bob)).status, 404);
          r = await req(
            path,
            "PUT",
            { ...body, version, wentWell: "Edited reflection" },
            alice,
          );
          assert.equal(r.status, 200);
          assert.equal(
            (await req(path, "PUT", { ...body, version }, alice)).status,
            409,
          );
          assert.equal(
            (await req("/productivity/reviews", "GET", undefined, alice)).data
              .items.length,
            1,
          );
          assert.equal(
            (
              await req(
                "/productivity/reviews/" + shiftDate(today, 1),
                "PUT",
                body,
                alice,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await req(
                path,
                "PUT",
                { ...body, version: r.data.item.version, wentWell: 17 },
                alice,
              )
            ).status,
            400,
          );
        },
      );
      await t.test(
        "review deletion keeps source activity, and concurrent recreation stays unique",
        async () => {
          const path = "/productivity/reviews/" + today;
          const before = await FocusSession.countDocuments({ user: user._id });
          assert.equal(
            (await req(path, "DELETE", undefined, alice)).status,
            204,
          );
          assert.equal(
            (await req(path, "GET", undefined, alice)).data.item,
            null,
          );
          assert.equal(
            await FocusSession.countDocuments({ user: user._id }),
            before,
          );
          const body = {
            wentWell: "Edited reflection",
            challenges: "",
            tomorrow: "Read",
            version: null,
          };
          const results = await Promise.all([
            req(path, "PUT", body, alice),
            req(path, "PUT", body, alice),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
          assert.equal(
            await mongoose
              .model("DailyReview")
              .countDocuments({ user: user._id, date: today }),
            1,
          );
          await req(
            "/tasks/" + task.id,
            "PATCH",
            { dueDate: shiftDate(today, 1) },
            alice,
          );
          const changed = await activity(user._id, today, today);
          assert.equal(changed.days[0].tasksCompleted, 1);
          assert.equal(changed.days[0].planned, 1);
          await req("/tasks/" + task.id, "PATCH", { dueDate: today }, alice);
        },
      );
      await t.test(
        "saved focus and review survive API restart; deleted tasks disappear from live analytics",
        async () => {
          await new Promise((resolve) => server.close(resolve));
          server = app.listen(0, "127.0.0.1");
          await new Promise((resolve) => server.once("listening", resolve));
          base = "http://127.0.0.1:" + server.address().port + "/api";
          await mongoose.disconnect();
          await mongoose.connect(mongo.getUri());
          assert.ok(
            (await req("/focus", "GET", undefined, alice)).data.items.some(
              (s) => s.id === sessionId,
            ),
          );
          assert.equal(
            (
              await req(
                "/productivity/reviews/" + today,
                "GET",
                undefined,
                alice,
              )
            ).data.item.wentWell,
            "Edited reflection",
          );
          // Direct model reads additionally verify persisted storage.
          assert.ok(
            await FocusSession.exists({ _id: sessionId, state: "finished" }),
          );
          assert.equal(
            (
              await mongoose
                .model("DailyReview")
                .findOne({ user: user._id, date: today })
            ).wentWell,
            "Edited reflection",
          );
          const before = await activity(user._id, today, today);
          assert.equal(before.days[0].tasksCompleted, 1);
          assert.equal(
            (await req("/tasks/" + task.id, "DELETE", undefined, alice)).status,
            204,
          );
          const after = await activity(user._id, today, today);
          assert.equal(after.days[0].tasksCompleted, 0);
          assert.equal(after.completedTasks.length, 0);
        },
      );
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect();
      await mongo.stop();
    }
  },
);
