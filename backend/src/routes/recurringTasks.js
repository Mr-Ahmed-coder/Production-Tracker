import { Router } from "express";
import RecurringTask from "../models/RecurringTask.js";
import TaskOccurrence from "../models/TaskOccurrence.js";
import { fields, text, date, choice, bool, owned } from "./records.js";
import { invalid, hashToken } from "../security.js";
import { dateInZone, shiftDate, weekday } from "../domain/calendar.js";
import { settingsFor } from "../domain/analytics.js";
import { scheduled, occurrenceView } from "../domain/recurringTasks.js";
export const recurringTaskRouter = Router();
const conflict = (message) =>
  Object.assign(new Error(message), { status: 409 });
function input(body, old) {
  const d = fields(
    body,
    old
      ? [
          "title",
          "description",
          "priority",
          "startDate",
          "endDate",
          "weekdays",
          "version",
        ]
      : [
          "title",
          "description",
          "priority",
          "startDate",
          "endDate",
          "weekdays",
          "createKey",
        ],
  );
  const result = {
    ...(old
      ? {
          title: old.title,
          description: old.description,
          priority: old.priority,
          startDate: old.startDate,
          endDate: old.endDate,
          weekdays: [...old.weekdays],
        }
      : { description: "", priority: "Medium" }),
    ...d,
  };
  result.title = text(result.title, "Title", 120);
  result.description = text(result.description, "Description", 5000, true);
  choice(result.priority, ["High", "Medium", "Low"]);
  date(result.startDate);
  date(result.endDate);
  if (
    result.endDate < result.startDate ||
    (+new Date(result.endDate) - +new Date(result.startDate)) / 86400000 > 29 ||
    result.endDate > "9999-12-30"
  )
    throw invalid(
      "Use 1–30 calendar days, including both start and end dates.",
    );
  if (
    !Array.isArray(result.weekdays) ||
    !result.weekdays.length ||
    result.weekdays.length > 7 ||
    result.weekdays.some((n) => !Number.isInteger(n) || n < 0 || n > 6) ||
    new Set(result.weekdays).size !== result.weekdays.length
  )
    throw invalid("Choose distinct weekdays (0–6).");
  result.weekdays.sort();
  let count = 0;
  for (
    let day = result.startDate;
    day <= result.endDate;
    day = shiftDate(day, 1)
  )
    if (result.weekdays.includes(weekday(day))) count++;
  if (!count) throw invalid("No selected weekdays fall in this date range.");
  return result;
}
const view = (s) => ({
  id: s.id,
  title: s.title,
  description: s.description,
  priority: s.priority,
  startDate: s.startDate,
  endDate: s.endDate,
  weekdays: s.weekdays,
  timeZone: s.timeZone,
  stoppedAfter: s.stoppedAfter,
  deletedAt: s.deletedAt,
  version: s.__v,
});
recurringTaskRouter.get("/", async (req, res) => {
  const page = Number(req.query.page ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 100000)
    throw invalid("Invalid page.");
  const query = { user: req.user._id, deletedAt: null };
  const [total, docs] = await Promise.all([
    RecurringTask.countDocuments(query),
    RecurringTask.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * 20)
      .limit(20),
  ]);
  res.json({
    items: docs.map(view),
    page,
    totalPages: Math.max(1, Math.ceil(total / 20)),
  });
});
recurringTaskRouter.get("/:id", async (req, res) => {
  const s = await owned(RecurringTask, req.params.id, req.user._id);
  res.json({
    item: view(s),
    skippedDates: (
      await TaskOccurrence.find({
        user: req.user._id,
        series: s._id,
        skipped: true,
      })
        .select("date")
        .sort({ date: 1 })
    ).map((r) => r.date),
  });
});
recurringTaskRouter.post("/", async (req, res) => {
  const d = input(req.body),
    key = text(d.createKey, "Create request key", 100);
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(key))
    throw invalid("Invalid create request key.");
  delete d.createKey;
  const fingerprint = hashToken(
    JSON.stringify({
      title: d.title,
      description: d.description,
      priority: d.priority,
      startDate: d.startDate,
      endDate: d.endDate,
      weekdays: d.weekdays,
    }),
  );
  const old = await RecurringTask.findOne({
    user: req.user._id,
    createKey: key,
  });
  if (old) {
    if (old.createHash !== fingerprint)
      throw conflict("This request key was used for another series.");
    return res.json({ item: view(old) });
  }
  const prefs = await settingsFor(req.user._id);
  let s;
  try {
    s = await RecurringTask.create({
      ...d,
      createKey: key,
      createHash: fingerprint,
      user: req.user._id,
      timeZone: prefs.timeZone,
    });
  } catch (e) {
    if (e.code !== 11000) throw e;
    s = await RecurringTask.findOne({ user: req.user._id, createKey: key });
    if (!s || s.createHash !== fingerprint)
      throw conflict("This request key was used for another series.");
  }
  res.status(201).json({ item: view(s) });
});
recurringTaskRouter.patch("/:id", async (req, res) => {
  const s = await owned(RecurringTask, req.params.id, req.user._id);
  if (s.deletedAt)
    throw conflict(
      "This series was removed; its completed history is retained.",
    );
  const d = input(req.body, s);
  if (!Number.isInteger(d.version) || d.version !== s.__v)
    throw conflict("Series changed. Reopen it before saving.");
  delete d.version;
  Object.assign(s, d);
  await s.save();
  res.json({ item: view(s) });
});
recurringTaskRouter.post("/:id/stop", async (req, res) => {
  fields(req.body, ["confirm"]);
  if (req.body.confirm !== true)
    throw invalid("Confirm stopping future repetitions.");
  const s = await owned(RecurringTask, req.params.id, req.user._id);
  if (s.deletedAt) throw conflict("This series was removed.");
  const today = dateInZone(s.timeZone);
  s.stoppedAfter =
    s.stoppedAfter && s.stoppedAfter < today ? s.stoppedAfter : today;
  await s.save();
  res.json({ item: view(s) });
});
recurringTaskRouter.delete("/:id", async (req, res) => {
  fields(req.body, ["confirm"]);
  if (req.body.confirm !== true) throw invalid("Confirm removing this series.");
  const s = await owned(RecurringTask, req.params.id, req.user._id);
  if (!s.deletedAt) {
    s.deletedAt = new Date();
    await s.save();
  }
  res.status(204).end();
});
recurringTaskRouter.put("/:id/occurrences/:date", async (req, res) => {
  const s = await owned(RecurringTask, req.params.id, req.user._id),
    day = date(req.params.date),
    data = fields(req.body, ["completed", "skipped"]);
  if (s.deletedAt)
    throw conflict("This series is read-only; completed history is retained.");
  if (Object.keys(data).length !== 1)
    throw invalid("Change completion or skip status separately.");
  for (const key of Object.keys(data)) bool(data[key]);
  let state = await TaskOccurrence.findOne({
    user: req.user._id,
    series: s._id,
    date: day,
  });
  if (
    !scheduled(s, day) &&
    !state?.completed &&
    !(data.skipped === false && state?.skipped)
  )
    throw invalid("This occurrence is not scheduled.");
  if (data.skipped && state?.completed)
    throw conflict("Uncheck this occurrence before skipping it.");
  if (data.completed === true && state?.skipped)
    throw conflict("Restore this skipped occurrence first.");
  const now = new Date();
  if (!state)
    state = new TaskOccurrence({
      user: req.user._id,
      series: s._id,
      date: day,
      title: s.title,
      description: s.description,
      priority: s.priority,
    });
  if ("completed" in data) {
    if (data.completed && !state.completed) {
      state.completedAt = now;
      state.lastCompletedAt = now;
      state.title = s.title;
      state.description = s.description;
      state.priority = s.priority;
    }
    if (!data.completed) state.completedAt = null;
    state.completed = data.completed;
  }
  if ("skipped" in data) state.skipped = data.skipped;
  try {
    await state.save();
  } catch (e) {
    if (e.code === 11000)
      throw conflict(
        "Occurrence changed in another request. Refresh and try again.",
      );
    throw e;
  }
  res.json({ item: occurrenceView(s, state, day) });
});
