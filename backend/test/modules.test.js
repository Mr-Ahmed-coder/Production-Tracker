import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { app } from "../src/app.js";
import { connectDatabase } from "../src/config/database.js";
import Note from "../src/models/Note.js";
import Goal from "../src/models/Goal.js";
import Task from "../src/models/Task.js";
import Completion from "../src/models/HabitCompletion.js";
import Habit from "../src/models/Habit.js";
import { dateInZone, shiftDate, weekday } from "../src/domain/calendar.js";
test(
  "Phase 3 private modules with isolated MongoDB",
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
      const base = "http://127.0.0.1:" + server.address().port + "/api";
      async function req(path, method = "GET", body, cookie) {
        const response = await fetch(base + path, {
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
          status: response.status,
          data: response.status === 204 ? null : await response.json(),
          cookie: response.headers.get("set-cookie")?.split(";")[0],
        };
      }
      const account = {
        name: "Phase Three",
        email: "phase3@example.test",
        password: "Safe Phase Three password!",
      };
      const alice = (await req("/auth/register", "POST", account)).cookie,
        bob = (
          await req("/auth/register", "POST", {
            ...account,
            email: "other3@example.test",
          })
        ).cookie;
      let task, goal, note, habit;
      const today = dateInZone("Africa/Kampala"),
        prior = shiftDate(today, -7),
        weekdays = [weekday(today)];
      await t.test(
        "new modules reject unauthenticated requests and forged owner fields",
        async () => {
          for (const path of ["/notes", "/goals", "/habits"]) {
            assert.equal((await req(path)).status, 401);
            assert.equal(
              (await req(path, "POST", { user: "forged" }, alice)).status,
              400,
            );
          }
        },
      );
      await t.test(
        "create a task and measurable goal; task records remain compatible",
        async () => {
          task = (
            await req(
              "/tasks",
              "POST",
              {
                title: "Existing task",
                priority: "Medium",
                dueDate: today,
                category: "Personal",
              },
              alice,
            )
          ).data.task;
          const result = await req(
            "/goals",
            "POST",
            {
              title: "Read more",
              targetDate: today,
              term: "long",
              taskIds: [task.id],
              milestones: [
                { title: "Books", target: 10, current: 5, unit: "books" },
                { title: "Reviews", target: 2, current: 2, unit: "reviews" },
              ],
            },
            alice,
          );
          assert.equal(result.status, 201);
          goal = result.data.item;
          assert.equal(goal.progress, 75);
          assert.equal(goal.taskIds[0], task.id);
          assert.equal(
            (await req("/tasks", "GET", undefined, alice)).data.tasks[0].id,
            task.id,
          );
        },
      );
      await t.test(
        "goals validate milestone amounts, IDs, references and owner isolation",
        async () => {
          const invalid = [
            { milestones: [null] },
            { milestones: [{ title: "Bad", target: 0, current: 0 }] },
            { milestones: [{ title: "Bad", target: 2, current: 3 }] },
            {
              milestones: [
                {
                  id: new mongoose.Types.ObjectId().toString(),
                  title: "Forged",
                  target: 2,
                  current: 1,
                },
              ],
            },
            { taskIds: [new mongoose.Types.ObjectId().toString()] },
            { targetDate: "2026-02-30" },
          ];
          for (const body of invalid)
            assert.equal(
              (await req("/goals/" + goal.id, "PATCH", body, alice)).status,
              400,
            );
          assert.equal(
            (await req("/goals/" + goal.id, "GET", undefined, bob)).status,
            404,
          );
          assert.equal(
            (await req("/goals/" + goal.id, "PATCH", { title: "Hijack" }, bob))
              .status,
            404,
          );
          assert.equal(
            (await req("/goals/" + goal.id, "DELETE", undefined, bob)).status,
            404,
          );
          assert.equal(
            (
              await req(
                "/goals",
                "POST",
                { title: "Bad link", targetDate: today, taskIds: [task.id] },
                bob,
              )
            ).status,
            400,
          );
        },
      );
      await t.test(
        "milestone progress updates without tasks; archive and restore",
        async () => {
          goal = (
            await req(
              "/goals/" + goal.id,
              "PATCH",
              {
                taskIds: [],
                milestones: goal.milestones.map((m) => ({
                  ...m,
                  current: m.target,
                })),
              },
              alice,
            )
          ).data.item;
          assert.equal(goal.progress, 100);
          assert.equal(
            (await req("/goals/" + goal.id, "PATCH", { archived: true }, alice))
              .data.item.archived,
            true,
          );
          assert.equal(
            (await req("/goals?archived=true", "GET", undefined, alice)).data
              .items.length,
            1,
          );
          assert.equal(
            (
              await req(
                "/goals/" + goal.id,
                "PATCH",
                { archived: false, status: "completed" },
                alice,
              )
            ).data.item.archived,
            false,
          );
        },
      );
      await t.test(
        "notes CRUD, pinning, tags, search, journal uniqueness and references",
        async () => {
          const result = await req(
            "/notes",
            "POST",
            {
              title: "Reflection",
              content: "A private thought with [brackets]",
              category: "Growth",
              tags: ["reading", "reading"],
              goalId: goal.id,
              taskId: task.id,
            },
            alice,
          );
          assert.equal(result.status, 201);
          note = result.data.item;
          assert.deepEqual(note.tags, ["reading"]);
          assert.ok(note.createdAt);
          assert.equal(
            (
              await req(
                "/notes/" + note.id,
                "PATCH",
                { pinned: true, content: "Edited private thought" },
                alice,
              )
            ).data.item.pinned,
            true,
          );
          assert.equal(
            (
              await req(
                "/notes?search=Edited&category=Growth&tag=reading",
                "GET",
                undefined,
                alice,
              )
            ).data.items.length,
            1,
          );
          assert.equal(
            (await req("/notes/" + note.id, "GET", undefined, alice)).data.item
              .content,
            "Edited private thought",
          );
          assert.equal(
            (
              await req(
                "/notes",
                "POST",
                { title: "Daily journal", journalDate: today },
                alice,
              )
            ).status,
            201,
          );
          assert.equal(
            (
              await req(
                "/notes",
                "POST",
                { title: "Duplicate journal", journalDate: today },
                alice,
              )
            ).status,
            409,
          );
          assert.equal(
            (
              await req(
                "/notes",
                "POST",
                { title: "Other journal", journalDate: today },
                bob,
              )
            ).status,
            201,
          );
          assert.equal(
            (await req("/notes?kind=journal", "GET", undefined, alice)).data
              .items.length,
            1,
          );
        },
      );
      await t.test(
        "notes cannot be read, changed, deleted or linked across accounts",
        async () => {
          for (const method of ["GET", "PATCH", "DELETE"])
            assert.equal(
              (
                await req(
                  "/notes/" + note.id,
                  method,
                  method === "PATCH" ? { title: "Stolen" } : undefined,
                  bob,
                )
              ).status,
              404,
            );
          assert.equal(
            (
              await req(
                "/notes",
                "POST",
                { title: "Wrong links", goalId: goal.id },
                bob,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await req(
                "/notes",
                "POST",
                { title: "Wrong links", taskId: task.id },
                bob,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await req(
                "/notes",
                "POST",
                { title: "Bad tags", tags: ["x".repeat(33)] },
                alice,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await req(
                "/notes/" + note.id,
                "PATCH",
                { journalDate: "2026-02-30" },
                alice,
              )
            ).status,
            400,
          );
          assert.equal(
            (await req("/notes?search=%5B", "GET", undefined, alice)).status,
            200,
          );
        },
      );
      await t.test(
        "create selected-weekday habits with valid saved timezone",
        async () => {
          for (const body of [
            { weekdays: [] },
            { weekdays: [1, 1] },
            { weekdays: [7] },
            { timeZone: "Not/AZone" },
            { startDate: "2026-02-30" },
          ])
            assert.equal(
              (
                await req(
                  "/habits",
                  "POST",
                  {
                    title: "Read daily",
                    timeZone: "Africa/Kampala",
                    startDate: prior,
                    weekdays,
                    ...body,
                  },
                  alice,
                )
              ).status,
              400,
            );
          const result = await req(
            "/habits",
            "POST",
            {
              title: "Read daily",
              timeZone: "Africa/Kampala",
              startDate: prior,
              weekdays,
            },
            alice,
          );
          assert.equal(result.status, 201);
          habit = result.data.item;
          assert.equal(habit.scheduledCount, 2);
          assert.equal(habit.today, today);
        },
      );
      await t.test(
        "duplicate concurrent completions are idempotent; streaks exclude non-scheduled days",
        async () => {
          await req(
            "/habits/" + habit.id + "/completions/" + prior,
            "PUT",
            undefined,
            alice,
          );
          const results = await Promise.all(
            Array.from({ length: 8 }, () =>
              req(
                "/habits/" + habit.id + "/completions/" + today,
                "PUT",
                undefined,
                alice,
              ),
            ),
          );
          assert.ok(results.every((r) => r.status === 200));
          assert.equal(
            await Completion.countDocuments({ habit: habit.id, date: today }),
            1,
          );
          habit = (await req("/habits/" + habit.id, "GET", undefined, alice))
            .data.item;
          assert.equal(habit.currentStreak, 2);
          assert.equal(habit.longestStreak, 2);
          assert.equal(habit.consistency, 100);
          assert.equal(
            (
              await req(
                "/habits/" + habit.id + "/completions/" + shiftDate(today, -1),
                "PUT",
                undefined,
                alice,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await req(
                "/habits/" + habit.id + "/completions/" + shiftDate(today, 7),
                "PUT",
                undefined,
                alice,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await req(
                "/habits/" + habit.id + "/completions/" + today,
                "DELETE",
                undefined,
                alice,
              )
            ).data.item.currentStreak,
            1,
          );
          assert.equal(
            await Completion.countDocuments({ habit: habit.id, date: today }),
            0,
          );
        },
      );
      await t.test(
        "habits enforce owner isolation on history, calendar, archive and completion",
        async () => {
          assert.equal(
            (await req("/habits", "GET", undefined, bob)).data.items.length,
            0,
          );
          for (const path of [
            "/habits/" + habit.id,
            "/habits/" + habit.id + "/calendar",
          ])
            assert.equal((await req(path, "GET", undefined, bob)).status, 404);
          assert.equal(
            (await req("/habits/" + habit.id, "PATCH", { archived: true }, bob))
              .status,
            404,
          );
          for (const method of ["PUT", "DELETE"])
            assert.equal(
              (
                await req(
                  "/habits/" + habit.id + "/completions/" + prior,
                  method,
                  undefined,
                  bob,
                )
              ).status,
              404,
            );
        },
      );
      await t.test(
        "weekday edits preserve prior schedule; archive/restore retains completions",
        async () => {
          const next = (weekday(today) + 1) % 7;
          habit = (
            await req(
              "/habits/" + habit.id,
              "PATCH",
              { weekdays: [next] },
              alice,
            )
          ).data.item;
          assert.ok(habit.week.find((d) => d.date === today).scheduled);
          assert.equal(
            (
              await req(
                "/habits/" + habit.id,
                "PATCH",
                { timeZone: "UTC" },
                alice,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await req(
                "/habits/" + habit.id,
                "PATCH",
                { archived: true },
                alice,
              )
            ).data.item.archived,
            true,
          );
          assert.equal(
            (
              await req(
                "/habits/" + habit.id + "/completions/" + prior,
                "DELETE",
                undefined,
                alice,
              )
            ).status,
            409,
          );
          assert.equal(
            await Completion.countDocuments({ habit: habit.id, date: prior }),
            1,
          );
          assert.equal(
            (
              await req(
                "/habits/" + habit.id,
                "PATCH",
                { archived: false },
                alice,
              )
            ).data.item.archived,
            false,
          );
          const result = await req(
            "/habits/" + habit.id + "/calendar?month=" + today.slice(0, 7),
            "GET",
            undefined,
            alice,
          );
          assert.equal(result.status, 200);
          assert.ok(result.data.days.some((d) => d.date === today));
          assert.equal(
            (
              await req(
                "/habits/" + habit.id + "/calendar?month=2026-13",
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
        "deleting notes or goals never cascades into unrelated records",
        async () => {
          await req("/goals/" + goal.id, "DELETE", undefined, alice);
          assert.equal(await Goal.findById(goal.id), null);
          assert.ok(await Note.findById(note.id));
          assert.ok(await Task.findById(task.id));
          await req("/notes/" + note.id, "DELETE", undefined, alice);
          assert.equal(await Note.findById(note.id), null);
          assert.ok(await Task.findById(task.id));
          assert.equal(
            (await req("/notes/bad-id", "GET", undefined, alice)).status,
            400,
          );
        },
      );
      await t.test(
        "habit definitions reject duplicate names, including concurrent creates and archived names",
        async () => {
          const body = {
            title: "Read daily",
            timeZone: "Africa/Kampala",
            startDate: today,
            weekdays,
          };
          assert.equal(
            (
              await req(
                "/habits",
                "POST",
                { ...body, title: " READ   DAILY " },
                alice,
              )
            ).status,
            409,
          );
          const otherOwner = await req("/habits", "POST", body, bob);
          assert.equal(otherOwner.status, 201);
          const other = await req(
            "/habits",
            "POST",
            { ...body, title: "Another promise" },
            alice,
          );
          assert.equal(other.status, 201);
          try {
            assert.equal(
              (
                await req(
                  "/habits/" + other.data.item.id,
                  "PATCH",
                  { title: "read daily" },
                  alice,
                )
              ).status,
              409,
            );
            assert.equal(
              (
                await req(
                  "/habits/" + habit.id,
                  "PATCH",
                  { title: "Read daily" },
                  alice,
                )
              ).status,
              200,
            );
            await req(
              "/habits/" + habit.id,
              "PATCH",
              { archived: true },
              alice,
            );
            assert.equal(
              (await req("/habits", "POST", body, alice)).status,
              409,
            );
            await req(
              "/habits/" + habit.id,
              "PATCH",
              { archived: false },
              alice,
            );
            const results = await Promise.all(
              Array.from({ length: 4 }, () =>
                req(
                  "/habits",
                  "POST",
                  { ...body, title: "Concurrent promise" },
                  alice,
                ),
              ),
            );
            assert.equal(results.filter((r) => r.status === 201).length, 1);
            assert.equal(results.filter((r) => r.status === 409).length, 3);
            const created = results.find((r) => r.status === 201);
            await Habit.deleteOne({ _id: created.data.item.id });
          } finally {
            await Habit.deleteMany({
              _id: { $in: [other.data.item.id, otherOwner.data.item.id] },
            });
          }
        },
      );
      await t.test(
        "legacy habit records remain intact while duplicate new names are rejected",
        async () => {
          const owner = (await Habit.findById(habit.id)).user;
          const legacy = await Habit.create({
            user: owner,
            title: "Legacy habit",
            timeZone: "Africa/Kampala",
            startDate: today,
            schedule: [{ effectiveFrom: today, weekdays }],
          });
          try {
            assert.equal(
              (
                await req(
                  "/habits",
                  "POST",
                  {
                    title: " LEGACY  HABIT ",
                    timeZone: "Africa/Kampala",
                    startDate: today,
                    weekdays,
                  },
                  alice,
                )
              ).status,
              409,
            );
            assert.ok(await Habit.findById(legacy.id));
            assert.equal((await Habit.findById(legacy.id)).titleKey, undefined);
          } finally {
            await Habit.deleteOne({ _id: legacy.id });
          }
        },
      );

      await t.test("module records survive database reconnection", async () => {
        const uri = mongo.getUri();
        await mongoose.disconnect();
        await mongoose.connect(uri);
        assert.equal(
          (await req("/habits", "GET", undefined, alice)).data.items.length,
          1,
        );
        assert.equal(
          (await req("/notes?kind=journal", "GET", undefined, alice)).data.items
            .length,
          1,
        );
      });
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect();
      await mongo.stop();
    }
  },
);
