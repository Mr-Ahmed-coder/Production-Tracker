import { Router } from "express";
import ProductivitySettings from "../models/ProductivitySettings.js";
import DailyReview from "../models/DailyReview.js";
import { fields, text, date } from "./records.js";
import { validZone, dateInZone, shiftDate } from "../domain/calendar.js";
import { invalid } from "../security.js";
import { activity, settingsFor } from "../domain/analytics.js";
import { getInsights } from "../domain/insights.js";
import { exportUserData } from "../domain/export.js";
export const productivityRouter = Router();
productivityRouter.get("/settings", async (req, res) => {
  const s = await settingsFor(req.user._id);
  res.json({ timeZone: s.timeZone, dailyTargetMinutes: s.dailyTargetMinutes });
});
productivityRouter.put("/settings", async (req, res) => {
  const data = fields(req.body, ["timeZone", "dailyTargetMinutes"]);
  if ("timeZone" in data && !validZone(data.timeZone))
    throw invalid("Choose a valid IANA timezone.");
  if (
    "dailyTargetMinutes" in data &&
    (!Number.isInteger(data.dailyTargetMinutes) ||
      data.dailyTargetMinutes < 1 ||
      data.dailyTargetMinutes > 1440)
  )
    throw invalid("Daily target must be 1–1440 whole minutes.");
  const s = await ProductivitySettings.findOneAndUpdate(
    { user: req.user._id },
    { $set: data },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  res.json({ timeZone: s.timeZone, dailyTargetMinutes: s.dailyTargetMinutes });
});
productivityRouter.get("/analytics", async (req, res) => {
  const s = await settingsFor(req.user._id),
    today = dateInZone(s.timeZone);
  const to = req.query.to === undefined ? today : date(req.query.to),
    from =
      req.query.from === undefined ? shiftDate(to, -29) : date(req.query.from);
  if (
    to > today ||
    from > to ||
    (+new Date(to) - +new Date(from)) / 86400000 > 91
  )
    throw invalid("Choose an elapsed date range of at most 92 days.");
  res.json(await activity(req.user._id, from, to));
});
productivityRouter.get("/insights", async (req, res) => {
  res.json(await getInsights(req.user._id));
});
productivityRouter.get("/export", async (req, res) => {
  const format = req.query.format === "csv" ? "csv" : "json";
  const entity = typeof req.query.entity === "string" ? req.query.entity : "all";
  const { filename, mime, content } = await exportUserData(
    req.user._id,
    format,
    entity,
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", mime);
  res.send(content);
});
const view = (r) => ({
  id: r.id,
  date: r.date,
  wentWell: r.wentWell,
  challenges: r.challenges,
  tomorrow: r.tomorrow,
  updatedAt: r.updatedAt,
  version: r.__v,
});
productivityRouter.get("/reviews", async (req, res) =>
  res.json({
    items: (
      await DailyReview.find({ user: req.user._id }).sort({ date: -1 })
    ).map(view),
  }),
);
productivityRouter.get("/reviews/:date", async (req, res) => {
  const day = date(req.params.date),
    s = await settingsFor(req.user._id);
  if (day > dateInZone(s.timeZone))
    throw invalid("Reviews cannot be in the future.");
  const review = await DailyReview.findOne({ user: req.user._id, date: day });
  res.json({
    item: review ? view(review) : null,
    summary: await activity(req.user._id, day, day),
  });
});
productivityRouter.put("/reviews/:date", async (req, res) => {
  const day = date(req.params.date),
    s = await settingsFor(req.user._id);
  if (day > dateInZone(s.timeZone))
    throw invalid("Reviews cannot be in the future.");
  const data = fields(req.body, [
    "wentWell",
    "challenges",
    "tomorrow",
    "version",
  ]);
  for (const key of ["wentWell", "challenges", "tomorrow"])
    data[key] = text(data[key], key, key === "tomorrow" ? 2000 : 5000, true);
  const old = await DailyReview.findOne({ user: req.user._id, date: day });
  if (old) {
    if (!Number.isInteger(data.version) || data.version !== old.__v)
      throw Object.assign(
        new Error("This review changed. Reopen it before saving."),
        { status: 409 },
      );
    for (const key of ["wentWell", "challenges", "tomorrow"])
      old[key] = data[key];
    await old.save();
    res.json({ item: view(old) });
  } else {
    if (data.version !== null)
      throw Object.assign(
        new Error("Review no longer exists. Reopen before saving."),
        { status: 409 },
      );
    delete data.version;
    res
      .status(201)
      .json({
        item: view(
          await DailyReview.create({ ...data, user: req.user._id, date: day }),
        ),
      });
  }
});
productivityRouter.delete("/reviews/:date", async (req, res) => {
  const day = date(req.params.date);
  const r = await DailyReview.findOneAndDelete({
    user: req.user._id,
    date: day,
  });
  if (!r) return res.status(404).json({ error: "Review not found." });
  res.status(204).end();
});
