import { test } from "node:test";
import assert from "node:assert/strict";
import { habitTitleKey } from "../src/domain/habitIdentity.js";
import {
  validDate,
  validZone,
  dateInZone,
  shiftDate,
  isScheduled,
  habitMetrics,
  habitCalendar,
  goalProgress,
} from "../src/domain/calendar.js";
const daily = {
  timeZone: "UTC",
  startDate: "2026-10-19",
  schedule: [{ effectiveFrom: "2026-10-19", weekdays: [0, 1, 2, 3, 4, 5, 6] }],
  pauses: [],
};
test("calendar validation, user timezone midnight, leap dates and DST-safe calendar stepping", () => {
  assert.ok(validDate("2024-02-29"));
  assert.ok(!validDate("2026-02-29"));
  assert.ok(!validDate("2026-04-31"));
  assert.ok(!validZone("Not/AZone"));
  assert.equal(
    dateInZone("America/Los_Angeles", new Date("2026-10-22T00:30:00Z")),
    "2026-10-21",
  );
  assert.equal(
    dateInZone("Asia/Tokyo", new Date("2026-10-22T23:30:00Z")),
    "2026-10-23",
  );
  assert.equal(
    dateInZone("Africa/Kampala", new Date("2026-10-22T22:00:00Z")),
    "2026-10-23",
  );
  assert.equal(shiftDate("2026-03-08", 1), "2026-03-09");
  assert.equal(shiftDate("2024-02-28", 1), "2024-02-29");
  assert.equal(
    dateInZone("America/New_York", new Date("2026-03-08T06:59:00Z")),
    "2026-03-08",
  );
  assert.equal(
    dateInZone("America/New_York", new Date("2026-03-08T07:01:00Z")),
    "2026-03-08",
  );
});
test("daily streak has pending-today grace; missed past days break current streak", () => {
  const now = new Date("2026-10-22T12:00:00Z"),
    dates = ["2026-10-19", "2026-10-20", "2026-10-21"];
  let m = habitMetrics(daily, dates, now);
  assert.equal(m.currentStreak, 3);
  assert.equal(m.longestStreak, 3);
  assert.equal(m.consistency, 75);
  m = habitMetrics(daily, [...dates, "2026-10-22"], now);
  assert.equal(m.currentStreak, 4);
  assert.equal(m.consistency, 100);
  m = habitMetrics(daily, dates.slice(0, 2), now);
  assert.equal(m.currentStreak, 0);
  assert.equal(m.longestStreak, 2);
});
test("selected weekdays exclude unscheduled and future days from streak and consistency", () => {
  const h = {
      ...daily,
      schedule: [{ effectiveFrom: daily.startDate, weekdays: [1, 3, 5] }],
    },
    now = new Date("2026-10-23T12:00:00Z");
  const m = habitMetrics(
    h,
    ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-26"],
    now,
  );
  assert.equal(m.currentStreak, 2);
  assert.equal(m.completedCount, 2);
  assert.equal(m.scheduledCount, 3);
  assert.equal(m.consistency, 67);
  assert.equal(isScheduled(h, "2026-10-20"), false);
  assert.equal(
    habitMetrics({ ...h, startDate: "2026-10-26" }, [], now).scheduledCount,
    0,
  );
});
test("schedule versions preserve history and archive intervals are not missed", () => {
  const h = {
    ...daily,
    schedule: [
      ...daily.schedule,
      { effectiveFrom: "2026-10-22", weekdays: [5] },
    ],
  };
  assert.equal(isScheduled(h, "2026-10-20"), true);
  assert.equal(isScheduled(h, "2026-10-22"), false);
  const paused = {
    ...daily,
    pauses: [{ from: "2026-10-20", to: "2026-10-22" }],
  };
  const m = habitMetrics(
    paused,
    ["2026-10-19", "2026-10-22"],
    new Date("2026-10-22T12:00:00Z"),
  );
  assert.equal(m.currentStreak, 2);
  assert.equal(m.consistency, 100);
  const days = habitCalendar(
    daily,
    [],
    "2026-10",
    new Date("2026-10-22T12:00:00Z"),
  );
  assert.equal(days.length, 31);
  assert.equal(days.find((d) => d.date === "2026-10-23").future, true);
  assert.throws(() => habitCalendar(daily, [], "2026-13"));
});
test("goal progress averages milestone ratios independently of tasks", () => {
  assert.equal(
    goalProgress({
      milestones: [
        { target: 10, current: 5 },
        { target: 2, current: 2 },
      ],
      status: "active",
    }),
    75,
  );
  assert.equal(goalProgress({ milestones: [], status: "active" }), 0);
  assert.equal(goalProgress({ milestones: [], status: "completed" }), 100);
});

test("weekly progress uses only elapsed scheduled days and saved completions", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  const history = habitMetrics(
    daily,
    ["2026-10-19", "2026-10-21", "2026-10-23"],
    now,
  ).weekHistory;
  assert.equal(history.length, 8);
  assert.deepEqual(history.at(-1), {
    start: "2026-10-19",
    end: "2026-10-25",
    scheduled: 4,
    completed: 2,
  });
  assert.ok(
    history.slice(0, -1).every((w) => w.scheduled === 0 && w.completed === 0),
  );
  const selective = {
    ...daily,
    schedule: [{ effectiveFrom: "2026-10-19", weekdays: [1, 3, 5] }],
    pauses: [{ from: "2026-10-21", to: "2026-10-22" }],
  };
  assert.deepEqual(
    habitMetrics(selective, ["2026-10-19", "2026-10-21"], now).weekHistory.at(
      -1,
    ),
    { start: "2026-10-19", end: "2026-10-25", scheduled: 1, completed: 1 },
  );
  const local = habitMetrics(
    { ...daily, timeZone: "America/Los_Angeles" },
    ["2026-10-22"],
    new Date("2026-10-22T00:30:00Z"),
  ).weekHistory.at(-1);
  assert.equal(local.scheduled, 3);
  assert.equal(local.completed, 0);
});

test("habit names normalize case, whitespace and canonical Unicode", () => {
  assert.equal(habitTitleKey(" READ  \n pages "), "read pages");
  assert.equal(habitTitleKey("Cafe\u0301"), habitTitleKey("Café"));
});
