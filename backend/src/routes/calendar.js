import { Router } from "express";
import Task from "../models/Task.js";
import Goal from "../models/Goal.js";
import Habit from "../models/Habit.js";
import Completion from "../models/HabitCompletion.js";
import FocusSession from "../models/FocusSession.js";
import { date } from "./records.js";
import { invalid } from "../security.js";
import { serializeTask } from "./tasks.js";
import { settingsFor } from "../domain/analytics.js";
import {
  dateInZone,
  shiftDate,
  isScheduled,
  goalProgress,
} from "../domain/calendar.js";
import { intervals, splitInterval } from "../domain/focus.js";

import { recurringRange } from "../domain/recurringTasks.js";
export const calendarRouter = Router();
export async function calendarActivity(user, from, to, now = new Date()) {
  const range = { $gte: from, $lte: to };
  const settings = await settingsFor(user);
  const timeZone = settings.timeZone,
    today = dateInZone(timeZone, now);
  const [tasks, habits, completions, goals, sessions, recurring] =
    await Promise.all([
      Task.find({ user, $or: [{ scheduledDate: range }, { dueDate: range }] })
        .select(
          "title priority completed completedAt dueDate scheduledDate category",
        )
        .sort({ dueDate: 1, _id: 1 })
        .lean(),
      Habit.find({
        user,
        startDate: { $lte: to },
        $or: [
          { archived: false },
          { pauses: { $elemMatch: { from: { $gt: from }, to: null } } },
        ],
      })
        .select("title timeZone startDate schedule pauses archived")
        .lean(),
      Completion.find({ user, date: range }).select("habit date").lean(),
      Goal.find({
        user,
        archived: false,
        $or: [{ targetDate: range }, { "milestones.targetDate": range }],
      })
        .select("title status milestones targetDate")
        .lean(),
      // Sessions can span at most 24 hours; allow another day for timezone offsets.
      FocusSession.find({
        user,
        state: { $ne: "discarded" },
        createdAt: {
          $gte: new Date(+new Date(from) - 48 * 3600000),
          $lt: new Date(+new Date(to) + 48 * 3600000),
        },
      })
        .select("segments state runningSince leaseUntil")
        .lean(),
      recurringRange(user, from, to),
    ]);
  const days = new Map();
  for (let day = from; day <= to; day = shiftDate(day, 1))
    days.set(day, {
      date: day,
      tasks: [],
      recurringTasks: [],
      deadlines: [],
      habits: [],
      goals: [],
      focusMs: 0,
    });
  for (const t of tasks) {
    const item = {
      ...serializeTask(t),
      completedAt: t.completedAt ?? null,
      overdue: !t.completed && t.dueDate < today,
    };
    const planned = t.scheduledDate ?? t.dueDate;
    days.get(planned)?.tasks.push(item);
    if (t.dueDate !== planned) days.get(t.dueDate)?.deadlines.push(item);
  }
  for (const item of recurring) days.get(item.date)?.recurringTasks.push(item);
  const done = new Set(completions.map((c) => String(c.habit) + ":" + c.date));
  for (const h of habits) {
    const habitToday = dateInZone(h.timeZone, now),
      id = String(h._id);
    for (const [day, bucket] of days) {
      if (!isScheduled(h, day)) continue;
      bucket.habits.push({
        id,
        title: h.title,
        timeZone: h.timeZone,
        completed: done.has(id + ":" + day),
        future: day > habitToday,
        editable: !h.archived && day <= habitToday,
      });
    }
  }
  for (const g of goals) {
    const goal = { id: String(g._id), title: g.title };
    days.get(g.targetDate)?.goals.push({
      ...goal,
      kind: "goal",
      progress: goalProgress(g),
      completed: g.status === "completed",
    });
    for (const m of g.milestones) {
      days.get(m.targetDate)?.goals.push({
        ...goal,
        id: String(m._id),
        goalTitle: g.title,
        title: m.title,
        kind: "milestone",
        progress: Math.round(100 * Math.min(1, m.current / m.target)),
        completed: m.current >= m.target,
      });
    }
  }
  for (const s of sessions)
    for (const interval of intervals(s, now))
      for (const part of splitInterval(
        interval.start,
        interval.end,
        timeZone,
      )) {
        const bucket = days.get(part.date);
        if (bucket) bucket.focusMs += part.milliseconds;
      }
  return { from, to, today, timeZone, days: [...days.values()] };
}
calendarRouter.get("/", async (req, res) => {
  const from = date(req.query.from, "Start date"),
    to = date(req.query.to, "End date");
  if (
    from > to ||
    (+new Date(to) - +new Date(from)) / 86400000 > 41 ||
    to > "9999-12-30"
  )
    throw invalid("Choose a date range of up to 42 days.");
  res.json(await calendarActivity(req.user._id, from, to));
});
