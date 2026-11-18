import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import { app } from "../src/app.js";
import { connectDatabase } from "../src/config/database.js";
import RecurringTask from "../src/models/RecurringTask.js";
import TaskOccurrence from "../src/models/TaskOccurrence.js";
import Task from "../src/models/Task.js";
import { recurringRange } from "../src/domain/recurringTasks.js";
import { calendarActivity } from "../src/routes/calendar.js";
import { activity } from "../src/domain/analytics.js";
import { dateInZone, shiftDate, weekday } from "../src/domain/calendar.js";
import { exportUserData } from "../src/domain/export.js";

test(
  "Repeating tasks keep independent dated records in isolated MongoDB",
  { timeout: 180000 },
  async (t) => {
    const mongo = await MongoMemoryServer.create();
    let server;
    process.env.MONGODB_URI = mongo.getUri();
    process.env.CLIENT_ORIGIN = "http://127.0.0.1:5173";
    try {
      await connectDatabase();
      server = app.listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      const base = "http://127.0.0.1:" + server.address().port + "/api";
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
      const register = async (email) =>
        req("/auth/register", "POST", {
          name: "Repeating QA",
          email,
          password: "Isolated repeating task test!",
        });
      const alice = (await register("repeats@example.test")).cookie,
        bob = (await register("other-repeats@example.test")).cookie;
      const owner = (
        await mongoose.model("User").findOne({ email: "repeats@example.test" })
      )._id;
      const today = dateInZone("Africa/Kampala");
      const payload = (overrides = {}) => ({
        title: "Practice English",
        startDate: "2026-11-18",
        endDate: "2026-12-17",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        createKey: randomUUID(),
        ...overrides,
      });
      let series;
      await t.test(
        "requires authentication and rejects invalid ranges, fields and weekday schedules",
        async () => {
          assert.equal((await req("/recurring-tasks")).status, 401);
          for (const data of [
            payload({ endDate: "2026-12-18" }),
            payload({ endDate: "2026-11-17" }),
            payload({ startDate: "2026-02-30" }),
            payload({ weekdays: [] }),
            payload({ weekdays: [1, 1] }),
            payload({ weekdays: [7] }),
            payload({ weekdays: ["1"] }),
            payload({ user: String(owner) }),
            payload({ timeZone: "UTC" }),
            payload({ completedAt: today }),
            payload({
              startDate: "2026-11-18",
              endDate: "2026-11-18",
              weekdays: [0],
            }),
          ])
            assert.equal(
              (await req("/recurring-tasks", "POST", data, alice)).status,
              400,
            );
        },
      );
      await t.test(
        "November 18 to December 17 is exactly 30 virtual occurrences, not 30 tasks",
        async () => {
          const r = await req("/recurring-tasks", "POST", payload(), alice);
          assert.equal(r.status, 201);
          series = r.data.item;
          assert.equal(series.timeZone, "Africa/Kampala");
          assert.equal(
            (await recurringRange(owner, "2026-11-18", "2026-12-17")).length,
            30,
          );
          assert.equal(await Task.countDocuments({ user: owner }), 0);
          assert.equal(await TaskOccurrence.countDocuments({ user: owner }), 0);
          assert.equal(
            (
              await calendarActivity(owner, "2026-11-18", "2026-12-17")
            ).days.filter((d) => d.recurringTasks.length === 1).length,
            30,
          );
        },
      );
      await t.test(
        "retry-safe concurrent creation and mismatched request keys",
        async () => {
          const data = payload({ title: "Retry safe" });
          const results = await Promise.all([
            req("/recurring-tasks", "POST", data, alice),
            req("/recurring-tasks", "POST", data, alice),
          ]);
          assert.ok(results.every((r) => [200, 201].includes(r.status)));
          assert.equal(results[0].data.item.id, results[1].data.item.id);
          assert.equal(
            await RecurringTask.countDocuments({
              user: owner,
              createKey: data.createKey,
            }),
            1,
          );
          assert.equal(
            (
              await req(
                "/recurring-tasks",
                "POST",
                { ...data, title: "Different" },
                alice,
              )
            ).status,
            409,
          );
          assert.equal(
            (
              await req(
                "/recurring-tasks",
                "POST",
                {
                  createKey: data.createKey,
                  weekdays: data.weekdays,
                  endDate: data.endDate,
                  startDate: data.startDate,
                  title: data.title,
                },
                alice,
              )
            ).status,
            200,
          );
        },
      );
      await t.test(
        "weekday dates, leap days and DST use calendar dates",
        async () => {
          for (const [startDate, endDate, count] of [
            ["2028-02-28", "2028-03-01", 3],
            ["2026-03-07", "2026-03-09", 3],
            ["2026-10-31", "2026-11-02", 3],
          ]) {
            const r = await req(
              "/recurring-tasks",
              "POST",
              payload({ startDate, endDate, title: startDate }),
              alice,
            );
            const rows = (
              await recurringRange(owner, startDate, endDate)
            ).filter((v) => v.seriesId === r.data.item.id);
            assert.equal(rows.length, count);
          }
          const r = await req(
            "/recurring-tasks",
            "POST",
            payload({ title: "Weekdays", weekdays: [1, 2, 3, 4, 5] }),
            alice,
          );
          const rows = (
            await recurringRange(owner, "2026-11-18", "2026-12-17")
          ).filter((v) => v.seriesId === r.data.item.id);
          assert.equal(rows.length, 22);
          assert.ok(
            rows.every((r) => weekday(r.date) >= 1 && weekday(r.date) <= 5),
          );
        },
      );
      await t.test(
        "each date toggles independently, has a unique record and uses actual server time",
        async () => {
          const path =
              "/recurring-tasks/" + series.id + "/occurrences/2026-11-18",
            before = Date.now();
          const results = await Promise.all([
            req(path, "PUT", { completed: true }, alice),
            req(path, "PUT", { completed: true }, alice),
          ]);
          assert.ok(results.some((r) => r.status === 200));
          assert.ok(results.every((r) => [200, 409].includes(r.status)));
          let record = await TaskOccurrence.findOne({
            series: series.id,
            date: "2026-11-18",
          });
          assert.equal(
            await TaskOccurrence.countDocuments({
              series: series.id,
              date: "2026-11-18",
            }),
            1,
          );
          assert.ok(
            +record.completedAt >= before && +record.completedAt <= Date.now(),
          );
          const timestamp = +record.completedAt;
          await req(path, "PUT", { completed: true }, alice);
          assert.equal(
            +(await TaskOccurrence.findById(record._id)).completedAt,
            timestamp,
          );
          const rows = (
            await recurringRange(owner, "2026-11-18", "2026-12-17")
          ).filter((r) => r.seriesId === series.id);
          assert.equal(rows.filter((r) => r.completed).length, 1);
          await req(path, "PUT", { completed: false }, alice);
          record = await TaskOccurrence.findById(record._id);
          assert.equal(record.completed, false);
          assert.equal(record.completedAt, null);
          assert.equal(+record.lastCompletedAt, timestamp);
          await req(path, "PUT", { completed: true }, alice);
          assert.equal(
            (await req(path, "PUT", { completedAt: "2000-01-01" }, alice))
              .status,
            400,
          );
        },
      );
      await t.test(
        "user isolation applies to series, dated checkboxes and mutations",
        async () => {
          assert.equal(
            (await req("/recurring-tasks", "GET", undefined, bob)).data.items
              .length,
            0,
          );
          for (const [path, method, body] of [
            ["/recurring-tasks/" + series.id, "GET", undefined],
            [
              "/recurring-tasks/" + series.id,
              "PATCH",
              { title: "Hacked", version: 0 },
            ],
            ["/recurring-tasks/" + series.id, "DELETE", { confirm: true }],
            [
              "/recurring-tasks/" + series.id + "/stop",
              "POST",
              { confirm: true },
            ],
            [
              "/recurring-tasks/" + series.id + "/occurrences/2026-11-18",
              "PUT",
              { completed: true },
            ],
          ])
            assert.equal((await req(path, method, body, bob)).status, 404);
          assert.equal(
            (
              await req(
                "/calendar?from=2026-11-18&to=2026-12-17",
                "GET",
                undefined,
                bob,
              )
            ).data.days.flatMap((d) => d.recurringTasks).length,
            0,
          );
        },
      );
      await t.test(
        "editing schedules preserves completed dated history and rejects stale versions",
        async () => {
          const path = "/recurring-tasks/" + series.id;
          const old = (await req(path, "GET", undefined, alice)).data.item;
          assert.equal(
            (
              await req(
                path,
                "PATCH",
                {
                  title: "Updated practice",
                  startDate: "2026-12-01",
                  endDate: "2026-12-07",
                  weekdays: [1, 3, 5],
                  version: old.version,
                },
                alice,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await req(
                path,
                "PATCH",
                { title: "Stale", version: old.version },
                alice,
              )
            ).status,
            409,
          );
          const history = (
            await recurringRange(owner, "2026-11-18", "2026-11-18")
          ).find((r) => r.seriesId === series.id);
          assert.equal(history.completed, true);
          assert.equal(history.title, "Practice English");
          assert.equal(history.retained, true);
          const upcoming = (
            await recurringRange(owner, "2026-12-01", "2026-12-07")
          ).filter((r) => r.seriesId === series.id);
          assert.equal(upcoming.length, 3);
          assert.ok(upcoming.every((r) => r.title === "Updated practice"));
        },
      );
      await t.test(
        "skip and restore target only one date; completed dates require unchecking first",
        async () => {
          const r = await req(
              "/recurring-tasks",
              "POST",
              payload({ title: "Skip one" }),
              alice,
            ),
            id = r.data.item.id,
            path = "/recurring-tasks/" + id + "/occurrences/2026-11-19";
          assert.equal(
            (await req(path, "PUT", { skipped: true }, alice)).status,
            200,
          );
          assert.equal(
            (await recurringRange(owner, "2026-11-18", "2026-12-17")).filter(
              (r) => r.seriesId === id,
            ).length,
            29,
          );
          assert.equal(
            (await req("/recurring-tasks/" + id, "GET", undefined, alice)).data
              .skippedDates[0],
            "2026-11-19",
          );
          assert.equal(
            (await req(path, "PUT", { completed: true }, alice)).status,
            409,
          );
          assert.equal(
            (await req(path, "PUT", { skipped: false }, alice)).status,
            200,
          );
          await req(path, "PUT", { completed: true }, alice);
          assert.equal(
            (await req(path, "PUT", { skipped: true }, alice)).status,
            409,
          );
        },
      );
      await t.test(
        "stop and soft removal require confirmation and retain completed history",
        async () => {
          const r = await req(
              "/recurring-tasks",
              "POST",
              payload({
                title: "Stop run",
                startDate: today,
                endDate: shiftDate(today, 6),
              }),
              alice,
            ),
            id = r.data.item.id;
          await req(
            "/recurring-tasks/" + id + "/occurrences/" + shiftDate(today, 1),
            "PUT",
            { completed: true },
            alice,
          );
          assert.equal(
            (
              await req(
                "/recurring-tasks/" + id + "/stop",
                "POST",
                { confirm: false },
                alice,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await req(
                "/recurring-tasks/" + id + "/stop",
                "POST",
                { confirm: true },
                alice,
              )
            ).status,
            200,
          );
          let rows = (
            await recurringRange(owner, today, shiftDate(today, 6))
          ).filter((r) => r.seriesId === id);
          assert.equal(rows.length, 2);
          assert.ok(rows.some((r) => r.date === today));
          assert.ok(rows.some((r) => r.completed && r.retained));
          assert.equal(
            (
              await req(
                "/recurring-tasks/" + id,
                "DELETE",
                { confirm: false },
                alice,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await req(
                "/recurring-tasks/" + id,
                "DELETE",
                { confirm: true },
                alice,
              )
            ).status,
            204,
          );
          rows = (
            await recurringRange(owner, today, shiftDate(today, 6))
          ).filter((r) => r.seriesId === id);
          assert.equal(rows.length, 1);
          assert.equal(rows[0].editable, false);
          assert.equal(rows[0].completed, true);
          assert.ok(await RecurringTask.exists({ _id: id }));
        },
      );
      await t.test(
        "series capture the saved timezone; stopping uses that timezone even after preferences change",
        async () => {
          await req(
            "/productivity/settings",
            "PUT",
            { timeZone: "America/Adak" },
            alice,
          );
          const localToday = dateInZone("America/Adak");
          const r = await req(
            "/recurring-tasks",
            "POST",
            payload({
              title: "Timezone run",
              startDate: localToday,
              endDate: shiftDate(localToday, 6),
            }),
            alice,
          );
          assert.equal(r.data.item.timeZone, "America/Adak");
          await req(
            "/productivity/settings",
            "PUT",
            { timeZone: "Africa/Kampala" },
            alice,
          );
          const stopped = await req(
            "/recurring-tasks/" + r.data.item.id + "/stop",
            "POST",
            { confirm: true },
            alice,
          );
          assert.equal(stopped.data.item.stoppedAfter, localToday);
          assert.equal(stopped.data.item.timeZone, "America/Adak");
        },
      );
      await t.test(
        "analytics, JSON export and reconnect retain source accuracy",
        async () => {
          const data = await activity(owner, today, today);
          assert.ok(data.days[0].tasksCompleted >= 1);
          assert.ok(
            data.completedTasks.some((r) => r.id === series.id + ":2026-11-18"),
          );
          const exported = JSON.parse((await exportUserData(owner)).content);
          assert.ok(exported.recurringTasks.length > 0);
          assert.ok(exported.taskOccurrences.length > 0);
          assert.ok(!JSON.stringify(exported).includes("createHash"));
          await mongoose.disconnect();
          await mongoose.connect(mongo.getUri());
          assert.equal(
            (
              await req(
                "/recurring-tasks/" + series.id,
                "GET",
                undefined,
                alice,
              )
            ).status,
            200,
          );
          assert.ok(
            (await recurringRange(owner, "2026-11-18", "2026-11-18")).some(
              (r) => r.seriesId === series.id && r.completed,
            ),
          );
        },
      );
    } finally {
      if (server) await new Promise((r) => server.close(r));
      await mongoose.disconnect();
      await mongo.stop();
    }
  },
);
