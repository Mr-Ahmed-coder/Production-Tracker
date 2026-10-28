import { Router } from "express";
import Habit from "../models/Habit.js";
import Completion from "../models/HabitCompletion.js";
import { fields, text, date, bool, owned, base } from "./records.js";
import { invalid } from "../security.js";
import { habitTitleKey } from "../domain/habitIdentity.js";
import {
  validZone,
  dateInZone,
  shiftDate,
  isScheduled,
  habitMetrics,
  habitCalendar,
} from "../domain/calendar.js";
export const habitRouter = Router();
async function uniqueTitle(title, user, currentId) {
  const titleKey = habitTitleKey(title);
  const scope = { user, ...(currentId ? { _id: { $ne: currentId } } : {}) };
  const existing = await Habit.exists({ ...scope, titleKey });
  const legacy = await Habit.find({ ...scope, titleKey: { $exists: false } })
    .select("title")
    .lean();
  if (existing || legacy.some((h) => habitTitleKey(h.title) === titleKey))
    throw Object.assign(
      new Error(
        "A habit with this name already exists. Edit or restore the existing habit.",
      ),
      { status: 409 },
    );
  return titleKey;
}
function weekdays(value) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 7 ||
    value.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
    new Set(value).size !== value.length
  )
    throw invalid("Choose distinct weekdays (0–6).");
  return [...value].sort();
}
async function view(h) {
  const completions = (
    await Completion.find({ habit: h._id, user: h.user }).sort({ date: 1 })
  ).map((c) => c.date);
  const metrics = habitMetrics(h, completions);
  return {
    ...base(h),
    title: h.title,
    category: h.category,
    timeZone: h.timeZone,
    startDate: h.startDate,
    archived: h.archived,
    weekdays: h.schedule.at(-1).weekdays,
    schedule: h.schedule,
    pauses: h.pauses,
    completions,
    ...metrics,
  };
}
habitRouter.get("/", async (req, res) =>
  res.json({
    items: await Promise.all(
      (await Habit.find({ user: req.user._id }).sort({ createdAt: 1 })).map(
        view,
      ),
    ),
  }),
);
habitRouter.get("/:id/calendar", async (req, res) => {
  const h = await owned(Habit, req.params.id, req.user._id);
  const month = req.query.month || dateInZone(h.timeZone).slice(0, 7);
  let days;
  try {
    days = habitCalendar(
      h,
      (await Completion.find({ habit: h._id, user: req.user._id })).map(
        (c) => c.date,
      ),
      month,
    );
  } catch {
    throw invalid("Invalid calendar month.");
  }
  res.json({ days });
});
habitRouter.get("/:id", async (req, res) =>
  res.json({
    item: await view(await owned(Habit, req.params.id, req.user._id)),
  }),
);
habitRouter.post("/", async (req, res) => {
  const data = fields(req.body, [
    "title",
    "category",
    "timeZone",
    "startDate",
    "weekdays",
  ]);
  data.title = text(data.title, "Habit title", 120);
  data.titleKey = await uniqueTitle(data.title, req.user._id);
  if (!validZone(data.timeZone))
    throw invalid("Choose a valid IANA time zone.");
  if (data.category !== undefined)
    data.category = text(data.category, "Category", 60);
  const today = dateInZone(data.timeZone);
  data.startDate = data.startDate || today;
  date(data.startDate);
  if (
    data.startDate < shiftDate(today, -3660) ||
    data.startDate > shiftDate(today, 366)
  )
    throw invalid("Start date is outside the supported range.");
  const days = weekdays(data.weekdays);
  delete data.weekdays;
  res.status(201).json({
    item: await view(
      await Habit.create({
        ...data,
        user: req.user._id,
        schedule: [{ effectiveFrom: data.startDate, weekdays: days }],
      }),
    ),
  });
});
habitRouter.patch("/:id", async (req, res) => {
  const h = await owned(Habit, req.params.id, req.user._id);
  const data = fields(req.body, ["title", "category", "weekdays", "archived"]);
  if ("title" in data) {
    h.title = text(data.title, "Habit title", 120);
    h.titleKey = await uniqueTitle(h.title, req.user._id, h._id);
  }
  if ("category" in data) h.category = text(data.category, "Category", 60);
  const today = dateInZone(h.timeZone);
  if ("weekdays" in data) {
    const days = weekdays(data.weekdays);
    const from = h.startDate > today ? h.startDate : shiftDate(today, 1);
    if (h.schedule.at(-1).effectiveFrom === from)
      h.schedule.at(-1).weekdays = days;
    else {
      if (h.schedule.length >= 3660)
        throw invalid("Schedule history limit reached.");
      h.schedule.push({ effectiveFrom: from, weekdays: days });
    }
  }
  if ("archived" in data) {
    bool(data.archived);
    if (data.archived !== h.archived) {
      if (data.archived) h.pauses.push({ from: today, to: null });
      else {
        const pause = h.pauses.findLast((p) => !p.to);
        if (pause) pause.to = today;
      }
      h.archived = data.archived;
    }
  }
  await h.save();
  res.json({ item: await view(h) });
});
async function scheduled(req) {
  const h = await owned(Habit, req.params.id, req.user._id);
  date(req.params.date);
  if (h.archived)
    throw Object.assign(
      new Error("Restore this habit before changing its history."),
      { status: 409 },
    );
  if (
    req.params.date > dateInZone(h.timeZone) ||
    !isScheduled(h, req.params.date)
  )
    throw invalid("Only scheduled dates up to today can be changed.");
  return h;
}
habitRouter.put("/:id/completions/:date", async (req, res) => {
  const h = await scheduled(req);
  const filter = { user: req.user._id, habit: h._id, date: req.params.date };
  try {
    await Completion.updateOne(
      filter,
      { $setOnInsert: filter },
      { upsert: true, runValidators: true },
    );
  } catch (e) {
    if (e.code !== 11000) throw e;
  }
  res.json({ item: await view(h) });
});
habitRouter.delete("/:id/completions/:date", async (req, res) => {
  const h = await scheduled(req);
  await Completion.deleteOne({
    user: req.user._id,
    habit: h._id,
    date: req.params.date,
  });
  res.json({ item: await view(h) });
});
