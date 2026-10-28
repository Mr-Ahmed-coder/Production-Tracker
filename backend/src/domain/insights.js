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
  habitMetrics,
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

export async function getInsights(user, now = new Date()) {
  const settings = await settingsFor(user);
  const timeZone = settings.timeZone;
  const today = dateInZone(timeZone, now);
  const dailyTargetMinutes = settings.dailyTargetMinutes;

  // Monday-based current week: Monday through today
  const dayOfWeek = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7; // 0=Mon, 6=Sun
  const thisWeekStart = shiftDate(today, -dayOfWeek);
  const thisWeekEnd = today;

  // Last week: previous Monday to previous Sunday (7 days)
  const lastWeekStart = shiftDate(thisWeekStart, -7);
  const lastWeekEnd = shiftDate(thisWeekStart, -1);

  // Past 30 days window
  const past30Start = shiftDate(today, -29);

  // Fetch all user records
  const [tasks, goals, habits, completions, sessions] = await Promise.all([
    Task.find({ user }),
    Goal.find({ user }),
    Habit.find({ user }),
    Completion.find({ user, date: { $gte: shiftDate(today, -60), $lte: today } }),
    FocusSession.find({ user, state: { $ne: "discarded" } }),
  ]);

  // Map focus by local calendar date
  const focusByDate = new Map();
  const focusByDayOfWeek = [0, 0, 0, 0, 0, 0, 0]; // 0=Mon..6=Sun
  const focusDaysCountByDayOfWeek = [0, 0, 0, 0, 0, 0, 0];

  for (const s of sessions) {
    for (const interval of intervals(s, now)) {
      for (const part of splitInterval(interval.start, interval.end, timeZone)) {
        focusByDate.set(part.date, (focusByDate.get(part.date) || 0) + part.milliseconds);
      }
    }
  }

  // Calculate day-of-week averages over past 60 days
  for (let d = shiftDate(today, -59); d <= today; d = shiftDate(d, 1)) {
    const dow = (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7;
    const ms = focusByDate.get(d) || 0;
    if (ms > 0) {
      focusByDayOfWeek[dow] += ms;
      focusDaysCountByDayOfWeek[dow]++;
    }
  }

  // Weekly focus comparison
  let thisWeekFocusMs = 0;
  for (let d = thisWeekStart; d <= thisWeekEnd; d = shiftDate(d, 1)) {
    thisWeekFocusMs += focusByDate.get(d) || 0;
  }
  let lastWeekFocusMs = 0;
  for (let d = lastWeekStart; d <= lastWeekEnd; d = shiftDate(d, 1)) {
    lastWeekFocusMs += focusByDate.get(d) || 0;
  }

  // Weekly tasks comparison
  const tasksCompletedThisWeek = tasks.filter(
    (t) =>
      t.completed &&
      t.completedAt &&
      dateInZone(timeZone, t.completedAt) >= thisWeekStart &&
      dateInZone(timeZone, t.completedAt) <= thisWeekEnd,
  ).length;

  const tasksCompletedLastWeek = tasks.filter(
    (t) =>
      t.completed &&
      t.completedAt &&
      dateInZone(timeZone, t.completedAt) >= lastWeekStart &&
      dateInZone(timeZone, t.completedAt) <= lastWeekEnd,
  ).length;

  // Weekly habit consistency comparison
  let thisWeekHabitsScheduled = 0,
    thisWeekHabitsCompleted = 0;
  let lastWeekHabitsScheduled = 0,
    lastWeekHabitsCompleted = 0;

  for (const h of habits) {
    const done = new Set(
      completions.filter((c) => String(c.habit) === String(h._id)).map((c) => c.date),
    );
    const hToday = dateInZone(h.timeZone, now);
    for (let d = thisWeekStart; d <= thisWeekEnd; d = shiftDate(d, 1)) {
      if (d <= hToday && isScheduled(h, d)) {
        thisWeekHabitsScheduled++;
        if (done.has(d)) thisWeekHabitsCompleted++;
      }
    }
    for (let d = lastWeekStart; d <= lastWeekEnd; d = shiftDate(d, 1)) {
      if (d <= hToday && isScheduled(h, d)) {
        lastWeekHabitsScheduled++;
        if (done.has(d)) lastWeekHabitsCompleted++;
      }
    }
  }

  const thisWeekHabitConsistency = thisWeekHabitsScheduled
    ? Math.round((thisWeekHabitsCompleted / thisWeekHabitsScheduled) * 100)
    : null;
  const lastWeekHabitConsistency = lastWeekHabitsScheduled
    ? Math.round((lastWeekHabitsCompleted / lastWeekHabitsScheduled) * 100)
    : null;

  // Peak productivity day of week
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  let bestDayIndex = -1;
  let maxAvgFocusMs = 0;
  for (let i = 0; i < 7; i++) {
    const count = focusDaysCountByDayOfWeek[i];
    if (count > 0) {
      const avg = focusByDayOfWeek[i] / count;
      if (avg > maxAvgFocusMs) {
        maxAvgFocusMs = avg;
        bestDayIndex = i;
      }
    }
  }

  // Focus consistency & target streaks
  let currentTargetStreak = 0;
  let longestTargetStreak = 0;
  let tempStreak = 0;
  const targetMs = dailyTargetMinutes * 60000;
  let daysMetTargetLast14 = 0;
  let daysMetTargetLast30 = 0;
  let weekdayFocusMs = 0,
    weekendFocusMs = 0;

  for (let d = past30Start; d <= today; d = shiftDate(d, 1)) {
    const dow = (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7;
    const ms = focusByDate.get(d) || 0;
    if (dow < 5) weekdayFocusMs += ms;
    else weekendFocusMs += ms;

    const met = ms >= targetMs;
    if (d >= shiftDate(today, -13) && met) daysMetTargetLast14++;
    if (met) {
      daysMetTargetLast30++;
      tempStreak++;
      if (tempStreak > longestTargetStreak) longestTargetStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }

  // Active target streak counting back from today or yesterday
  let checkDate = today;
  if ((focusByDate.get(checkDate) || 0) < targetMs) {
    checkDate = shiftDate(today, -1);
  }
  while (checkDate >= past30Start && (focusByDate.get(checkDate) || 0) >= targetMs) {
    currentTargetStreak++;
    checkDate = shiftDate(checkDate, -1);
  }

  // Task completion patterns
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const pendingTasks = totalTasks - completedTasks;
  const overdueTasks = tasks
    .filter((t) => !t.completed && t.dueDate < today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const highPriorityPending = tasks.filter(
    (t) => !t.completed && t.priority === "High" && t.dueDate <= shiftDate(today, 3),
  );

  const priorityStats = {
    High: {
      total: tasks.filter((t) => t.priority === "High").length,
      completed: tasks.filter((t) => t.priority === "High" && t.completed).length,
    },
    Medium: {
      total: tasks.filter((t) => t.priority === "Medium").length,
      completed: tasks.filter((t) => t.priority === "Medium" && t.completed).length,
    },
    Low: {
      total: tasks.filter((t) => t.priority === "Low").length,
      completed: tasks.filter((t) => t.priority === "Low" && t.completed).length,
    },
  };

  let completedOnTime = 0,
    completedLate = 0;
  for (const t of tasks) {
    if (t.completed && t.completedAt) {
      const compDate = dateInZone(timeZone, t.completedAt);
      if (compDate <= t.dueDate) completedOnTime++;
      else completedLate++;
    }
  }

  // Habit adherence
  const habitDetails = habits.map((h) => {
    const hCompletions = completions
      .filter((c) => String(c.habit) === String(h._id))
      .map((c) => c.date);
    const metrics = habitMetrics(h, hCompletions, now);
    return {
      id: h.id,
      title: h.title,
      archived: h.archived,
      currentStreak: metrics.currentStreak,
      longestStreak: metrics.longestStreak,
      consistency: metrics.consistency,
      completedCount: metrics.completedCount,
      scheduledCount: metrics.scheduledCount,
    };
  });

  const activeHabits = habitDetails.filter((h) => !h.archived);
  const mostConsistentHabit = activeHabits.length
    ? [...activeHabits].sort(
        (a, b) => b.consistency - a.consistency || b.currentStreak - a.currentStreak,
      )[0]
    : null;

  const yesterday = shiftDate(today, -1);
  const missedHabitsYesterday = habits
    .filter((h) => {
      if (h.archived) return false;
      if (!isScheduled(h, yesterday)) return false;
      const isDone = completions.some(
        (c) => String(c.habit) === String(h._id) && c.date === yesterday,
      );
      return !isDone;
    })
    .map((h) => ({ id: h.id, title: h.title }));

  // Goals & milestones
  const totalGoals = goals.length;
  const activeGoals = goals.filter((g) => !g.archived && g.status !== "completed");
  const completedGoals = goals.filter((g) => g.status === "completed");
  const allMilestones = goals.flatMap((g) =>
    (g.milestones || []).map((m) => ({
      id: String(m._id || m.id),
      title: m.title,
      target: m.target,
      current: m.current,
      unit: m.unit,
      targetDate: m.targetDate,
      achievedAt: m.achievedAt,
      goalTitle: g.title,
      goalId: g.id,
    })),
  );
  const achievedMilestones = allMilestones.filter((m) => m.current >= m.target);
  const upcomingMilestones = allMilestones
    .filter((m) => m.current < m.target && m.targetDate)
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
    .slice(0, 5);

  const nearCompletionGoals = activeGoals
    .map((g) => ({
      id: g.id,
      title: g.title,
      progress: goalProgress(g),
    }))
    .filter((g) => g.progress >= 50 && g.progress < 100)
    .sort((a, b) => b.progress - a.progress);

  // Data sufficiency assessment
  const activeDaysSet = new Set();
  for (const [d, ms] of focusByDate.entries()) {
    if (ms > 0) activeDaysSet.add(d);
  }
  for (const t of tasks) {
    if (t.completed && t.completedAt) activeDaysSet.add(dateInZone(timeZone, t.completedAt));
  }
  for (const c of completions) {
    activeDaysSet.add(c.date);
  }

  const sufficientData =
    activeDaysSet.size >= 3 || (totalTasks >= 5 && activeHabits.length >= 1);

  // Deterministic, rule-based suggestions
  const suggestions = [];

  if (overdueTasks.length > 0) {
    suggestions.push({
      type: "tasks_overdue",
      title: "Resolve Overdue Tasks",
      message: `You have ${overdueTasks.length} overdue task(s). Prioritize resolving or rescheduling "${overdueTasks[0].title}" to keep your backlog clean.`,
      actionTo: "/tasks",
      actionLabel: "View Overdue Tasks",
    });
  }

  if (highPriorityPending.length > 0) {
    suggestions.push({
      type: "high_priority",
      title: "Upcoming High Priority",
      message: `"${highPriorityPending[0].title}" is marked High Priority and due ${
        highPriorityPending[0].dueDate === today
          ? "today"
          : "soon (" + highPriorityPending[0].dueDate + ")"
      }.`,
      actionTo: "/tasks",
      actionLabel: "Focus on Priority",
    });
  }

  if (missedHabitsYesterday.length > 0) {
    suggestions.push({
      type: "habit_streak_risk",
      title: "Rebuild Habit Momentum",
      message: `"${missedHabitsYesterday[0].title}" was scheduled yesterday but not completed. Complete it today to protect your routine!`,
      actionTo: "/habits",
      actionLabel: "View Habits",
    });
  }

  if (nearCompletionGoals.length > 0) {
    suggestions.push({
      type: "goal_near_completion",
      title: "Goal within Reach",
      message: `Your goal "${nearCompletionGoals[0].title}" is at ${nearCompletionGoals[0].progress}%. A focused push can cross the finish line!`,
      actionTo: "/goals",
      actionLabel: "View Goal",
    });
  }

  if (bestDayIndex >= 0 && maxAvgFocusMs >= 1800000) {
    const hrs = (maxAvgFocusMs / 3600000).toFixed(1);
    suggestions.push({
      type: "best_day",
      title: "Peak Focus Day",
      message: `${dayNames[bestDayIndex]} is historically your most productive focus day, averaging ${hrs} hours. Consider scheduling demanding tasks on ${dayNames[bestDayIndex]}s.`,
      actionTo: "/focus",
      actionLabel: "Start Focus Timer",
    });
  }

  if (thisWeekFocusMs > 0 && lastWeekFocusMs > 0) {
    const changePct = Math.round(
      ((thisWeekFocusMs - lastWeekFocusMs) / lastWeekFocusMs) * 100,
    );
    if (changePct >= 20) {
      suggestions.push({
        type: "positive_trend",
        title: "Strong Focus Velocity",
        message: `Your focus time is up +${changePct}% compared to last week. Keep up the consistent cadence!`,
        actionTo: "/analytics",
        actionLabel: "Review Analytics",
      });
    }
  }

  const totalFocusPast30 = weekdayFocusMs + weekendFocusMs;

  return {
    timeZone,
    today,
    dailyTargetMinutes,
    sufficientData,
    sufficiencyNotice: sufficientData
      ? null
      : "Record at least 3 active days with focus sessions, completed tasks, or habits to unlock deeper multi-week performance comparisons.",
    activeDaysCount: activeDaysSet.size,
    weeklyComparison: {
      thisWeek: {
        focusHours: Number((thisWeekFocusMs / 3600000).toFixed(2)),
        tasksCompleted: tasksCompletedThisWeek,
        habitConsistency: thisWeekHabitConsistency,
      },
      lastWeek: {
        focusHours: Number((lastWeekFocusMs / 3600000).toFixed(2)),
        tasksCompleted: tasksCompletedLastWeek,
        habitConsistency: lastWeekHabitConsistency,
      },
      focusChangeHours: Number(
        ((thisWeekFocusMs - lastWeekFocusMs) / 3600000).toFixed(2),
      ),
      tasksChange: tasksCompletedThisWeek - tasksCompletedLastWeek,
      habitConsistencyChange:
        thisWeekHabitConsistency !== null && lastWeekHabitConsistency !== null
          ? thisWeekHabitConsistency - lastWeekHabitConsistency
          : null,
      bestDay:
        bestDayIndex >= 0
          ? {
              day: dayNames[bestDayIndex],
              averageHours: Number((maxAvgFocusMs / 3600000).toFixed(2)),
            }
          : null,
    },
    focusConsistency: {
      currentTargetStreak,
      longestTargetStreak,
      daysMetTargetLast14,
      daysMetTargetLast30,
      totalFocusPast30Hours: Number((totalFocusPast30 / 3600000).toFixed(2)),
      weekdayPercent:
        totalFocusPast30 > 0 ? Math.round((weekdayFocusMs / totalFocusPast30) * 100) : 0,
      weekendPercent:
        totalFocusPast30 > 0 ? Math.round((weekendFocusMs / totalFocusPast30) * 100) : 0,
    },
    taskPatterns: {
      total: totalTasks,
      completed: completedTasks,
      pending: pendingTasks,
      completionRate:
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      overdueCount: overdueTasks.length,
      overdueTasks: overdueTasks.slice(0, 5).map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        priority: t.priority,
      })),
      highPriorityPending: highPriorityPending.slice(0, 5).map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
      })),
      priorityBreakdown: priorityStats,
      completedOnTime,
      completedLate,
    },
    habitAdherence: {
      activeCount: activeHabits.length,
      overallConsistency: activeHabits.length
        ? Math.round(
            activeHabits.reduce((acc, h) => acc + h.consistency, 0) /
              activeHabits.length,
          )
        : 0,
      mostConsistentHabit: mostConsistentHabit
        ? {
            title: mostConsistentHabit.title,
            streak: mostConsistentHabit.currentStreak,
            consistency: mostConsistentHabit.consistency,
          }
        : null,
      missedYesterdayCount: missedHabitsYesterday.length,
      missedYesterday: missedHabitsYesterday,
    },
    goalProgress: {
      total: totalGoals,
      active: activeGoals.length,
      completed: completedGoals.length,
      totalMilestones: allMilestones.length,
      achievedMilestones: achievedMilestones.length,
      upcomingMilestones: upcomingMilestones.map((m) => ({
        title: m.title,
        goalTitle: m.goalTitle,
        targetDate: m.targetDate,
      })),
      nearCompletion: nearCompletionGoals.slice(0, 3).map((g) => ({
        id: g.id,
        title: g.title,
        progress: g.progress,
      })),
    },
    suggestions,
    explanations: {
      weeklyComparison:
        "Compares current week (Monday through today) with the prior complete Monday-to-Sunday week.",
      bestDay:
        "Identifies the day of the week with the highest average focus hours over the last 60 days.",
      focusConsistency:
        "Evaluates consecutive days where focus time met or exceeded the daily focus target.",
      taskPatterns:
        "Separates tasks by priority and compares completion timing against scheduled due dates.",
      habitAdherence:
        "Measures completed vs scheduled days for active habits within their respective timezones.",
      suggestions:
        "Rule-based recommendations derived strictly from overdue tasks, upcoming priorities, and streak risks.",
    },
  };
}
