import Task from "../models/Task.js";
import Goal from "../models/Goal.js";
import Habit from "../models/Habit.js";
import Completion from "../models/HabitCompletion.js";
import FocusSession from "../models/FocusSession.js";
import ProductivitySettings from "../models/ProductivitySettings.js";
import {
  shiftDate,
  dateInZone,
  isScheduled,
  goalProgress,
} from "./calendar.js";
import { intervals, splitInterval } from "./focus.js";
export async function settingsFor(user) {
  return (
    (await ProductivitySettings.findOne({ user })) || {
      timeZone: "Africa/Kampala",
      dailyTargetMinutes: 180,
    }
  );
}
export async function activity(user, from, to, now = new Date()) {
  const settings = await settingsFor(user),
    timeZone = settings.timeZone;
  const [tasks, goals, habits, completions, sessions] = await Promise.all([
    Task.find({ user }),
    Goal.find({ user }),
    Habit.find({ user }),
    Completion.find({ user, date: { $gte: from, $lte: to } }),
    FocusSession.find({
      user,
      state: { $ne: "discarded" },
      createdAt: {
        $gte: new Date(+new Date(from + "T00:00:00Z") - 48 * 3600000),
        $lt: new Date(+new Date(to + "T00:00:00Z") + 48 * 3600000),
      },
    }),
  ]);
  const days = [];
  for (let d = from; d <= to; d = shiftDate(d, 1))
    days.push({
      date: d,
      focusMs: 0,
      planned: 0,
      plannedCompleted: 0,
      tasksCompleted: 0,
      habitsScheduled: 0,
      habitsCompleted: 0,
      milestonesAchieved: 0,
    });
  const map = new Map(days.map((d) => [d.date, d]));
  for (const s of sessions)
    for (const interval of intervals(s, now))
      for (const part of splitInterval(
        interval.start,
        interval.end,
        timeZone,
      )) {
        const day = map.get(part.date);
        if (day) day.focusMs += part.milliseconds;
      }
  for (const task of tasks) {
    const planned = map.get(task.dueDate);
    if (planned) {
      planned.planned++;
      if (task.completed) planned.plannedCompleted++;
    }
    if (task.completed && task.completedAt) {
      const day = map.get(dateInZone(timeZone, task.completedAt));
      if (day) day.tasksCompleted++;
    }
  }
  for (const h of habits) {
    const done = new Set(
      completions
        .filter((c) => String(c.habit) === String(h._id))
        .map((c) => c.date),
    );
    const today = dateInZone(h.timeZone, now);
    for (const day of days)
      if (day.date <= today && isScheduled(h, day.date)) {
        day.habitsScheduled++;
        if (done.has(day.date)) day.habitsCompleted++;
      }
  }
  const achieved = [];
  for (const g of goals)
    for (const m of g.milestones)
      if (m.current >= m.target && m.achievedAt) {
        const date = dateInZone(timeZone, m.achievedAt),
          day = map.get(date);
        if (day) {
          day.milestonesAchieved++;
          achieved.push({ date, title: m.title, goal: g.title });
        }
      }
  return {
    timeZone,
    dailyTargetMinutes: settings.dailyTargetMinutes,
    today: dateInZone(timeZone, now),
    days: days.map((d) => ({
      ...d,
      focusHours: Number((d.focusMs / 3600000).toFixed(4)),
      targetPercent: Math.min(
        100,
        Math.round(d.focusMs / (settings.dailyTargetMinutes * 600)),
      ),
      habitConsistency: d.habitsScheduled
        ? Math.round((d.habitsCompleted / d.habitsScheduled) * 100)
        : null,
    })),
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      archived: g.archived,
      status: g.status,
      progress: goalProgress(g),
      milestonesCompleted: g.milestones.filter((m) => m.current >= m.target)
        .length,
      milestonesTotal: g.milestones.length,
    })),
    achieved,
    tasks: tasks
      .filter((t) => t.dueDate >= from && t.dueDate <= to)
      .map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        completed: t.completed,
      })),
    completedTasks: tasks
      .filter(
        (t) =>
          t.completed &&
          t.completedAt &&
          map.has(dateInZone(timeZone, t.completedAt)),
      )
      .map((t) => ({
        id: t.id,
        title: t.title,
        date: dateInZone(timeZone, t.completedAt),
      })),
    completedHabits: habits.flatMap((h) =>
      completions
        .filter(
          (c) =>
            String(c.habit) === String(h._id) &&
            c.date <= dateInZone(h.timeZone, now) &&
            isScheduled(h, c.date),
        )
        .map((c) => ({ title: h.title, date: c.date, timeZone: h.timeZone })),
    ),
    legacyCompletedTasks: tasks.filter((t) => t.completed && !t.completedAt)
      .length,
  };
}
