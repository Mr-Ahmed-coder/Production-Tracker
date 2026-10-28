import Task from "../models/Task.js";
import Note from "../models/Note.js";
import Goal from "../models/Goal.js";
import Habit from "../models/Habit.js";
import Completion from "../models/HabitCompletion.js";
import FocusSession from "../models/FocusSession.js";
import DailyReview from "../models/DailyReview.js";
import ProductivitySettings from "../models/ProductivitySettings.js";
import User from "../models/User.js";
import { dateInZone } from "./calendar.js";
import { durationMs } from "./focus.js";

function escapeCsv(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toCsv(headers, rows) {
  const headerLine = headers.map(escapeCsv).join(",");
  const dataLines = rows.map((r) => r.map(escapeCsv).join(","));
  return [headerLine, ...dataLines].join("\r\n");
}

export async function exportUserData(userId, format = "json", entity = "all") {
  const [user, settings, tasks, notes, goals, habits, completions, sessions, reviews] =
    await Promise.all([
      User.findById(userId).select("name email createdAt"),
      ProductivitySettings.findOne({ user: userId }),
      Task.find({ user: userId }).sort({ createdAt: -1 }),
      Note.find({ user: userId }).sort({ pinned: -1, updatedAt: -1 }),
      Goal.find({ user: userId }).sort({ createdAt: -1 }),
      Habit.find({ user: userId }).sort({ createdAt: -1 }),
      Completion.find({ user: userId }).sort({ date: -1 }),
      FocusSession.find({ user: userId }).sort({ createdAt: -1 }),
      DailyReview.find({ user: userId }).sort({ date: -1 }),
    ]);

  const timeZone = settings?.timeZone || "Africa/Kampala";
  const today = dateInZone(timeZone);

  if (format === "csv") {
    switch (entity) {
      case "tasks": {
        const headers = ["ID", "Title", "Priority", "Category", "Due Date", "Completed", "Completed At", "Created At"];
        const rows = tasks.map((t) => [
          t.id,
          t.title,
          t.priority,
          t.category,
          t.dueDate,
          t.completed ? "Yes" : "No",
          t.completedAt ? t.completedAt.toISOString() : "",
          t.createdAt ? t.createdAt.toISOString() : "",
        ]);
        return { filename: `prodtrack-tasks-${today}.csv`, mime: "text/csv; charset=utf-8", content: toCsv(headers, rows) };
      }
      case "focus": {
        const headers = ["ID", "Created At", "State", "Active", "Task ID", "Goal ID", "Duration Minutes", "Segments Count"];
        const rows = sessions.map((s) => [
          s.id,
          s.createdAt ? s.createdAt.toISOString() : "",
          s.state,
          s.active ? "Yes" : "No",
          s.taskId ? String(s.taskId) : "",
          s.goalId ? String(s.goalId) : "",
          (durationMs(s) / 60000).toFixed(2),
          s.segments ? s.segments.length : 0,
        ]);
        return { filename: `prodtrack-focus-${today}.csv`, mime: "text/csv; charset=utf-8", content: toCsv(headers, rows) };
      }
      case "notes": {
        const headers = ["ID", "Title", "Category", "Pinned", "Journal Date", "Tags", "Updated At", "Content"];
        const rows = notes.map((n) => [
          n.id,
          n.title,
          n.category || "",
          n.pinned ? "Yes" : "No",
          n.journalDate || "",
          (n.tags || []).join("; "),
          n.updatedAt ? n.updatedAt.toISOString() : "",
          n.content || "",
        ]);
        return { filename: `prodtrack-notes-${today}.csv`, mime: "text/csv; charset=utf-8", content: toCsv(headers, rows) };
      }
      case "habits": {
        const headers = ["ID", "Title", "Timezone", "Start Date", "Archived", "Created At"];
        const rows = habits.map((h) => [
          h.id,
          h.title,
          h.timeZone,
          h.startDate,
          h.archived ? "Yes" : "No",
          h.createdAt ? h.createdAt.toISOString() : "",
        ]);
        return { filename: `prodtrack-habits-${today}.csv`, mime: "text/csv; charset=utf-8", content: toCsv(headers, rows) };
      }
      case "reviews": {
        const headers = ["Date", "Went Well", "Challenges", "Tomorrow Priority", "Updated At"];
        const rows = reviews.map((r) => [
          r.date,
          r.wentWell || "",
          r.challenges || "",
          r.tomorrow || "",
          r.updatedAt ? r.updatedAt.toISOString() : "",
        ]);
        return { filename: `prodtrack-reviews-${today}.csv`, mime: "text/csv; charset=utf-8", content: toCsv(headers, rows) };
      }
      case "goals": {
        const headers = ["ID", "Title", "Category", "Term", "Status", "Target Date", "Milestones Count", "Archived"];
        const rows = goals.map((g) => [
          g.id,
          g.title,
          g.category,
          g.term,
          g.status,
          g.targetDate,
          g.milestones ? g.milestones.length : 0,
          g.archived ? "Yes" : "No",
        ]);
        return { filename: `prodtrack-goals-${today}.csv`, mime: "text/csv; charset=utf-8", content: toCsv(headers, rows) };
      }
      default: {
        // Combined summary CSV containing tasks and focus summaries
        const headers = ["Entity", "ID", "Title / Date", "Status / State", "Detail", "Timestamp"];
        const rows = [
          ...tasks.map((t) => ["Task", t.id, t.title, t.completed ? "Completed" : "Pending", `Priority: ${t.priority}, Due: ${t.dueDate}`, t.createdAt ? t.createdAt.toISOString() : ""]),
          ...sessions.map((s) => ["Focus Session", s.id, s.createdAt ? s.createdAt.toISOString().slice(0, 10) : "", s.state, `${(durationMs(s) / 60000).toFixed(1)} mins`, s.createdAt ? s.createdAt.toISOString() : ""]),
          ...notes.map((n) => ["Note", n.id, n.title, n.journalDate ? "Journal" : "Note", n.category || "General", n.updatedAt ? n.updatedAt.toISOString() : ""]),
          ...habits.map((h) => ["Habit", h.id, h.title, h.archived ? "Archived" : "Active", `Timezone: ${h.timeZone}`, h.createdAt ? h.createdAt.toISOString() : ""]),
          ...reviews.map((r) => ["Daily Review", r.id, r.date, "Saved", r.wentWell ? r.wentWell.slice(0, 50) : "", r.updatedAt ? r.updatedAt.toISOString() : ""]),
          ...goals.map((g) => ["Goal", g.id, g.title, g.status, `Category: ${g.category}, Target: ${g.targetDate}`, g.createdAt ? g.createdAt.toISOString() : ""]),
        ];
        return { filename: `prodtrack-export-${today}.csv`, mime: "text/csv; charset=utf-8", content: toCsv(headers, rows) };
      }
    }
  }

  // JSON format
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    version: "1.0",
    user: {
      name: user?.name,
      email: user?.email,
      createdAt: user?.createdAt,
    },
    settings: {
      timeZone: settings?.timeZone || "Africa/Kampala",
      dailyTargetMinutes: settings?.dailyTargetMinutes || 180,
    },
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      category: t.category,
      dueDate: t.dueDate,
      completed: t.completed,
      completedAt: t.completedAt,
      createdAt: t.createdAt,
    })),
    notes: notes.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      category: n.category,
      tags: n.tags,
      pinned: n.pinned,
      journalDate: n.journalDate,
      goalId: n.goalId,
      taskId: n.taskId,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })),
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      category: g.category,
      term: g.term,
      targetDate: g.targetDate,
      status: g.status,
      archived: g.archived,
      milestones: (g.milestones || []).map((m) => ({
        id: m.id,
        title: m.title,
        target: m.target,
        current: m.current,
        unit: m.unit,
        targetDate: m.targetDate,
        achievedAt: m.achievedAt,
      })),
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    })),
    habits: habits.map((h) => ({
      id: h.id,
      title: h.title,
      timeZone: h.timeZone,
      startDate: h.startDate,
      schedule: h.schedule,
      pauses: h.pauses,
      archived: h.archived,
      createdAt: h.createdAt,
    })),
    habitCompletions: completions.map((c) => ({
      id: c.id,
      habitId: String(c.habit),
      date: c.date,
      createdAt: c.createdAt,
    })),
    focusSessions: sessions.map((s) => ({
      id: s.id,
      state: s.state,
      active: s.active,
      taskId: s.taskId,
      goalId: s.goalId,
      durationMs: durationMs(s),
      segments: s.segments,
      createdAt: s.createdAt,
      endedAt: s.endedAt,
    })),
    dailyReviews: reviews.map((r) => ({
      id: r.id,
      date: r.date,
      wentWell: r.wentWell,
      challenges: r.challenges,
      tomorrow: r.tomorrow,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  };

  return {
    filename: `prodtrack-export-${today}.json`,
    mime: "application/json",
    content: JSON.stringify(exportPayload, null, 2),
  };
}
