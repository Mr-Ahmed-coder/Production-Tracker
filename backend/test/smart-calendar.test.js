import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { app } from "../src/app.js";
import { connectDatabase } from "../src/config/database.js";
import { calendarActivity } from "../src/routes/calendar.js";
import { activity } from "../src/domain/analytics.js";
import Task from "../src/models/Task.js";
import Goal from "../src/models/Goal.js";
import Habit from "../src/models/Habit.js";
import FocusSession from "../src/models/FocusSession.js";
import ProductivitySettings from "../src/models/ProductivitySettings.js";

test("Calendar against isolated MongoDB", { timeout: 120000 }, async (t) => {
  const mongo = await MongoMemoryServer.create();
  let server;
  process.env.MONGODB_URI = mongo.getUri();
  process.env.CLIENT_ORIGIN = "http://127.0.0.1:5173";
  try {
    await connectDatabase();
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = "http://127.0.0.1:" + server.address().port + "/api";
    async function request(path, method = "GET", body, cookie) {
      const r = await fetch(base + path, {
        method,
        headers: {
          Origin: process.env.CLIENT_ORIGIN,
          "X-ProdTrack-Request": "1",
          "Content-Type": "application/json",
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
    const register = async (name) =>
      request("/auth/register", "POST", {
        name,
        email: name + "@example.test",
        password: "Local test calendar passphrase!",
      });
    const alice = await register("CalendarOwner"),
      bob = await register("CalendarOther");
    assert.equal(alice.status, 201);
    assert.equal(bob.status, 201);
    const owner = (
      await mongoose
        .model("User")
        .findOne({ email: "calendarowner@example.test" })
    )._id;
    const other = (
      await mongoose
        .model("User")
        .findOne({ email: "calendarother@example.test" })
    )._id;
    const from = "2026-03-07",
      to = "2026-03-10",
      path = "/calendar?from=" + from + "&to=" + to;
    const now = new Date("2026-03-10T03:59:00Z");
    await ProductivitySettings.create({
      user: owner,
      timeZone: "America/New_York",
    });
    await t.test(
      "rejects unauthenticated, invalid, reversed and oversized ranges",
      async () => {
        assert.equal((await request(path)).status, 401);
        for (const q of [
          "",
          "?from=2026-02-30&to=2026-03-01",
          "?from=2026-03-20&to=2026-03-02",
          "?from=2026-03-01&to=2026-04-12",
          "?from=2026-03-01&from=2026-03-02&to=2026-03-10",
        ])
          assert.equal(
            (await request("/calendar" + q, "GET", undefined, alice.cookie))
              .status,
            400,
          );
        assert.equal(
          (
            await request(
              "/calendar?from=2026-03-01&to=2026-04-11",
              "GET",
              undefined,
              alice.cookie,
            )
          ).data.days.length,
          42,
        );
      },
    );
    await t.test(
      "planned dates and deadlines do not duplicate tasks or alter completion timestamps",
      async () => {
        const r = await request(
          "/tasks",
          "POST",
          {
            title: "Planned task",
            dueDate: to,
            scheduledDate: "2026-03-08",
            priority: "High",
          },
          alice.cookie,
        );
        assert.equal(r.status, 201);
        const id = r.data.task.id;
        assert.equal(
          (
            await request(
              "/tasks",
              "POST",
              { title: "Bad plan", dueDate: to, scheduledDate: "2026-02-30" },
              alice.cookie,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request(
              "/tasks/" + id,
              "PATCH",
              { scheduledDate: from },
              bob.cookie,
            )
          ).status,
          404,
        );
        await Task.create({ user: owner, title: "Legacy due", dueDate: from });
        await Task.create({
          user: owner,
          title: "Outside range",
          dueDate: "2026-02-01",
        });
        await Task.create({ user: other, title: "Other task", dueDate: from });
        let data = await calendarActivity(owner, from, to, now);
        assert.equal(data.today, "2026-03-09");
        assert.equal(data.days[0].tasks[0].title, "Legacy due");
        assert.equal(data.days[0].tasks[0].overdue, true);
        assert.equal(data.days[1].tasks[0].id, id);
        assert.equal(data.days[3].deadlines[0].id, id);
        assert.equal(data.days.flatMap((d) => d.tasks).length, 2);
        await request(
          "/tasks/" + id,
          "PATCH",
          { completed: true },
          alice.cookie,
        );
        const timestamp = +(await Task.findById(id)).completedAt;
        const edit = await request(
          "/tasks/" + id,
          "PATCH",
          { scheduledDate: from, completed: true },
          alice.cookie,
        );
        assert.equal(edit.status, 200);
        assert.equal(edit.data.task.dueDate, to);
        assert.equal(+(await Task.findById(id)).completedAt, timestamp);
        assert.equal(
          (
            await request("/tasks", "GET", undefined, alice.cookie)
          ).data.tasks.find((t) => t.id === id).completed,
          true,
        );
        data = (await request(path, "GET", undefined, alice.cookie)).data;
        assert.equal(
          data.days[0].tasks.find((t) => t.id === id).completed,
          true,
        );
        assert.equal(data.days[3].deadlines[0].id, id);
        assert.equal(
          (await activity(owner, from, to, now)).days[3].plannedCompleted,
          1,
        );
        await request(
          "/tasks/" + id,
          "PATCH",
          { completed: false, scheduledDate: null },
          alice.cookie,
        );
        assert.equal((await Task.findById(id)).completedAt, null);
        data = (await request(path, "GET", undefined, alice.cookie)).data;
        assert.equal(data.days[3].tasks[0].id, id);
        assert.equal(data.days[3].deadlines.length, 0);
        assert.equal(
          (await request(path, "GET", undefined, bob.cookie)).data.days.flatMap(
            (d) => d.tasks,
          ).length,
          1,
        );
      },
    );
    await t.test(
      "weekday versions, archive periods, habit timezone and unique completions",
      async () => {
        const h = await Habit.create({
          user: owner,
          title: "Journal",
          timeZone: "America/New_York",
          startDate: from,
          schedule: [
            { effectiveFrom: from, weekdays: [0, 1, 2, 6] },
            { effectiveFrom: "2026-03-09", weekdays: [1, 2] },
          ],
          pauses: [{ from: "2026-03-09", to: "2026-03-10" }],
        });
        const path2 = "/habits/" + h.id + "/completions/2026-03-08";
        const responses = await Promise.all([
          request(path2, "PUT", undefined, alice.cookie),
          request(path2, "PUT", undefined, alice.cookie),
        ]);
        assert.ok(responses.every((r) => r.status === 200));
        assert.equal(
          await mongoose
            .model("HabitCompletion")
            .countDocuments({ user: owner, habit: h._id }),
          1,
        );
        assert.equal(
          (await request(path2, "PUT", undefined, bob.cookie)).status,
          404,
        );
        assert.equal(
          (
            await request(
              "/habits/" + h.id + "/completions/2026-03-09",
              "PUT",
              undefined,
              alice.cookie,
            )
          ).status,
          400,
        );
        const data = await calendarActivity(owner, from, to, now);
        assert.equal(data.days[1].habits[0].completed, true);
        assert.equal(data.days[2].habits.length, 0);
        assert.equal(data.days[3].habits[0].future, true);
        assert.equal(data.days[3].habits[0].editable, false);
        assert.equal(
          (
            await request("/habits", "GET", undefined, alice.cookie)
          ).data.items[0].completions.includes("2026-03-08"),
          true,
        );
        await request(path2, "DELETE", undefined, alice.cookie);
        assert.equal(
          (await calendarActivity(owner, from, to, now)).days[1].habits[0]
            .completed,
          false,
        );
      },
    );
    await t.test(
      "range-scoped goals and focus split correctly at DST midnight",
      async () => {
        const segment = {
          start: new Date("2026-03-08T04:30:00Z"),
          end: new Date("2026-03-09T04:30:00Z"),
        };
        for (const [user, state] of [
          [owner, "finished"],
          [owner, "discarded"],
          [other, "finished"],
        ])
          await FocusSession.create({
            user,
            state,
            active: false,
            segments: [segment],
            createdAt: segment.start,
          });
        await Goal.create({
          user: owner,
          title: "Goal",
          targetDate: to,
          milestones: [
            {
              title: "Inside milestone",
              target: 4,
              current: 1,
              targetDate: from,
            },
            {
              title: "Outside milestone",
              target: 3,
              current: 2,
              targetDate: "2026-04-01",
            },
          ],
        });
        await Goal.create({
          user: other,
          title: "Private goal",
          targetDate: from,
        });
        const data = await calendarActivity(owner, from, to, now);
        assert.deepEqual(
          data.days.map((d) => d.focusMs),
          [1800000, 23 * 3600000, 1800000, 0],
        );
        assert.deepEqual(
          data.days.flatMap((d) => d.goals.map((g) => g.title)),
          ["Inside milestone", "Goal"],
        );
        assert.equal(data.days[0].goals[0].progress, 25);
      },
    );
    await t.test(
      "historical planner checks use actual completion time; edits and deletion stay scoped",
      async () => {
        const created = await request(
          "/tasks",
          "POST",
          {
            title: "Historical checklist task",
            dueDate: "2000-01-03",
            scheduledDate: "2000-01-01",
          },
          alice.cookie,
        );
        assert.equal(created.status, 201);
        const id = created.data.task.id;
        const before = Date.now();
        assert.equal(
          (
            await request(
              "/tasks/" + id,
              "PATCH",
              { completed: true },
              alice.cookie,
            )
          ).status,
          200,
        );
        const stored = await Task.findById(id),
          timestamp = +stored.completedAt;
        assert.ok(timestamp >= before && timestamp <= Date.now());
        assert.equal(stored.scheduledDate, "2000-01-01");
        assert.equal(stored.dueDate, "2000-01-03");
        assert.equal(
          (
            await request(
              "/tasks/" + id,
              "PATCH",
              { completedAt: "2000-01-01T00:00:00Z" },
              alice.cookie,
            )
          ).status,
          400,
        );
        await request(
          "/tasks/" + id,
          "PATCH",
          { title: "Edited historic task" },
          alice.cookie,
        );
        assert.equal(+(await Task.findById(id)).completedAt, timestamp);
        const bucket = await calendarActivity(
          owner,
          "2000-01-01",
          "2000-01-03",
        );
        assert.equal(bucket.days[0].tasks[0].completed, true);
        assert.equal(bucket.days[2].deadlines[0].id, id);
        assert.equal(
          (await request("/tasks/" + id, "DELETE", undefined, bob.cookie))
            .status,
          404,
        );
        assert.ok(await Task.exists({ _id: id, user: owner }));
        const goals = await Goal.countDocuments({ user: owner });
        assert.equal(
          (await request("/tasks/" + id, "DELETE", undefined, alice.cookie))
            .status,
          204,
        );
        const after = await calendarActivity(owner, "2000-01-01", "2000-01-03");
        assert.equal(
          after.days
            .flatMap((d) => [...d.tasks, ...d.deadlines])
            .some((t) => t.id === id),
          false,
        );
        assert.equal(await Goal.countDocuments({ user: owner }), goals);
      },
    );
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
  }
});
