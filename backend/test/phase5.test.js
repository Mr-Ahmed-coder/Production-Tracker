import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { app } from "../src/app.js";
import { connectDatabase } from "../src/config/database.js";
import User from "../src/models/User.js";
import Task from "../src/models/Task.js";
import Note from "../src/models/Note.js";
import Goal from "../src/models/Goal.js";
import Habit from "../src/models/Habit.js";
import Completion from "../src/models/HabitCompletion.js";
import FocusSession from "../src/models/FocusSession.js";
import DailyReview from "../src/models/DailyReview.js";
import { dateInZone, shiftDate } from "../src/domain/calendar.js";

test(
  "Phase 5 personal insights, data exports and pagination with isolated MongoDB",
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
        const isJson = r.headers.get("content-type")?.includes("application/json");
        return {
          status: r.status,
          data: r.status === 204 ? null : isJson ? await r.json() : await r.text(),
          headers: r.headers,
          cookie: r.headers.get("set-cookie")?.split(";")[0],
        };
      }

      const account = {
        name: "Phase Five User",
        email: "phase5@example.test",
        password: "Phase five testing password!",
      };
      const alice = (await req("/auth/register", "POST", account)).cookie;
      const bob = (
        await req("/auth/register", "POST", {
          name: "Other User",
          email: "other5@example.test",
          password: "Phase five other password!",
        })
      ).cookie;

      const userAlice = await User.findOne({ email: account.email });
      const userBob = await User.findOne({ email: "other5@example.test" });
      const today = dateInZone("Africa/Kampala");

      await t.test("insights and export require authentication", async () => {
        assert.equal((await req("/productivity/insights")).status, 401);
        assert.equal((await req("/productivity/export")).status, 401);
      });

      await t.test("sparse new account reports lack of sufficient data", async () => {
        const res = await req("/productivity/insights", "GET", undefined, alice);
        assert.equal(res.status, 200);
        assert.equal(res.data.sufficientData, false);
        assert.ok(typeof res.data.sufficiencyNotice === "string");
        assert.equal(res.data.weeklyComparison.thisWeek.focusHours, 0);
        assert.equal(res.data.taskPatterns.total, 0);
      });

      await t.test("populate records and verify insights calculation", async () => {
        // Create 3 tasks: 1 overdue, 1 high priority due today, 1 completed
        await Task.create([
          {
            user: userAlice._id,
            title: "Overdue Task",
            priority: "Medium",
            dueDate: shiftDate(today, -2),
            completed: false,
          },
          {
            user: userAlice._id,
            title: "Urgent Priority",
            priority: "High",
            dueDate: today,
            completed: false,
          },
          {
            user: userAlice._id,
            title: "Done Task",
            priority: "High",
            dueDate: today,
            completed: true,
            completedAt: new Date(),
          },
        ]);

        // Create focus session with 45 minutes of focus
        const pastStart = new Date(Date.now() - 45 * 60 * 1000);
        const pastEnd = new Date();
        await FocusSession.create({
          user: userAlice._id,
          active: false,
          state: "finished",
          segments: [{ start: pastStart, end: pastEnd }],
          endedAt: pastEnd,
        });

        // Create habit with completions
        const habit = await Habit.create({
          user: userAlice._id,
          title: "Morning Reading",
          timeZone: "Africa/Kampala",
          startDate: shiftDate(today, -10),
          schedule: [{ weekdays: [0, 1, 2, 3, 4, 5, 6], effectiveFrom: shiftDate(today, -10) }],
        });
        await Completion.create([
          { user: userAlice._id, habit: habit._id, date: today },
          { user: userAlice._id, habit: habit._id, date: shiftDate(today, -1) },
          { user: userAlice._id, habit: habit._id, date: shiftDate(today, -2) },
        ]);

        // Create goal with milestone
        await Goal.create({
          user: userAlice._id,
          title: "Complete Q4 Milestone",
          targetDate: shiftDate(today, 30),
          milestones: [
            {
              title: "Part 1",
              target: 10,
              current: 8,
              unit: "chapters",
              targetDate: shiftDate(today, 10),
            },
          ],
        });

        // Bob's task to check isolation
        await Task.create({
          user: userBob._id,
          title: "Bob's Private Task",
          priority: "High",
          dueDate: today,
          completed: false,
        });

        const res = await req("/productivity/insights", "GET", undefined, alice);
        assert.equal(res.status, 200);
        assert.equal(res.data.taskPatterns.total, 3);
        assert.equal(res.data.taskPatterns.completed, 1);
        assert.equal(res.data.taskPatterns.overdueCount, 1);
        assert.equal(res.data.taskPatterns.overdueTasks[0].title, "Overdue Task");
        assert.equal(res.data.taskPatterns.highPriorityPending[0].title, "Urgent Priority");
        assert.equal(res.data.habitAdherence.activeCount, 1);
        assert.equal(res.data.habitAdherence.mostConsistentHabit.title, "Morning Reading");
        assert.ok(res.data.suggestions.some((s) => s.type === "tasks_overdue"));
        assert.ok(res.data.suggestions.some((s) => s.type === "high_priority"));
        assert.ok(res.data.explanations.weeklyComparison);
        assert.ok(res.data.explanations.taskPatterns);
      });

      await t.test("data export JSON contains all entities and no secrets", async () => {
        const res = await req("/productivity/export?format=json", "GET", undefined, alice);
        assert.equal(res.status, 200);
        assert.ok(res.headers.get("content-type")?.includes("application/json"));
        assert.ok(res.headers.get("content-disposition")?.includes("prodtrack-export-"));
        const data = res.data;
        assert.equal(data.user.email, "phase5@example.test");
        assert.equal(data.user.passwordHash, undefined);
        assert.equal(data.user.tokenHash, undefined);
        assert.equal(data.tasks.length, 3);
        assert.equal(data.habits.length, 1);
        assert.equal(data.focusSessions.length, 1);
        assert.equal(data.goals.length, 1);
        // Ensure Bob's task is excluded
        assert.ok(!data.tasks.some((t) => t.title === "Bob's Private Task"));
      });

      await t.test("data export CSV produces valid CSV with headers", async () => {
        // Export tasks as CSV
        const resTasks = await req("/productivity/export?format=csv&entity=tasks", "GET", undefined, alice);
        assert.equal(resTasks.status, 200);
        assert.ok(resTasks.headers.get("content-type")?.includes("text/csv"));
        assert.ok(resTasks.data.includes("ID,Title,Priority,Category"));
        assert.ok(resTasks.data.includes("Overdue Task"));
        assert.ok(!resTasks.data.includes("Bob's Private Task"));

        // Export focus sessions as CSV
        const resFocus = await req("/productivity/export?format=csv&entity=focus", "GET", undefined, alice);
        assert.equal(resFocus.status, 200);
        assert.ok(resFocus.data.includes("Duration Minutes"));

        // Export habits as CSV
        const resHabits = await req("/productivity/export?format=csv&entity=habits", "GET", undefined, alice);
        assert.equal(resHabits.status, 200);
        assert.ok(resHabits.data.includes("Morning Reading"));
      });

      await t.test("tasks and notes pagination", async () => {
        // Create 5 notes for Alice
        for (let i = 1; i <= 5; i++) {
          await Note.create({
            user: userAlice._id,
            title: `Note ${i}`,
            content: `Content for note ${i}`,
          });
        }

        // Paginated tasks
        const paginatedTasks = await req("/tasks?page=1&limit=2", "GET", undefined, alice);
        assert.equal(paginatedTasks.status, 200);
        assert.equal(paginatedTasks.data.tasks.length, 2);
        assert.equal(paginatedTasks.data.total, 3);
        assert.equal(paginatedTasks.data.page, 1);
        assert.equal(paginatedTasks.data.limit, 2);
        assert.equal(paginatedTasks.data.totalPages, 2);

        // Second page of tasks
        const page2Tasks = await req("/tasks?page=2&limit=2", "GET", undefined, alice);
        assert.equal(page2Tasks.data.tasks.length, 1);

        // Non-paginated tasks backward compatibility
        const standardTasks = await req("/tasks", "GET", undefined, alice);
        assert.equal(standardTasks.data.tasks.length, 3);
        assert.equal(standardTasks.data.total, undefined);

        // Paginated notes
        const paginatedNotes = await req("/notes?page=1&limit=3", "GET", undefined, alice);
        assert.equal(paginatedNotes.status, 200);
        assert.equal(paginatedNotes.data.items.length, 3);
        assert.equal(paginatedNotes.data.total, 5);
        assert.equal(paginatedNotes.data.totalPages, 2);

        // Non-paginated notes backward compatibility
        const standardNotes = await req("/notes", "GET", undefined, alice);
        assert.equal(standardNotes.data.items.length, 5);
        assert.equal(standardNotes.data.total, undefined);
      });
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect();
      await mongo.stop();
    }
  },
);
