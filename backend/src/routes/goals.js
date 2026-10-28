import { Router } from "express";
import Goal from "../models/Goal.js";
import {
  fields,
  text,
  date,
  bool,
  choice,
  references,
  owned,
  searchQuery,
  base,
  id,
} from "./records.js";
import { invalid } from "../security.js";
import { goalProgress } from "../domain/calendar.js";
export const goalRouter = Router();
export const goalView = (g) => ({
  ...base(g),
  title: g.title,
  description: g.description,
  category: g.category,
  term: g.term,
  targetDate: g.targetDate,
  status: g.status,
  archived: g.archived,
  taskIds: g.taskIds.map(String),
  milestones: g.milestones.map((m) => ({
    id: String(m._id),
    title: m.title,
    target: m.target,
    current: m.current,
    unit: m.unit,
    targetDate: m.targetDate,
  })),
  progress: goalProgress(g),
});
function milestone(body, old) {
  const m = fields(body, [
    "id",
    "title",
    "target",
    "current",
    "unit",
    "targetDate",
  ]);
  m.title = text(m.title, "Milestone title", 120);
  for (const key of ["target", "current"])
    if (
      typeof m[key] !== "number" ||
      !Number.isFinite(m[key]) ||
      m[key] < (key === "target" ? 0.000001 : 0) ||
      m[key] > 1e9
    )
      throw invalid(
        "Milestone amounts must be finite and nonnegative; target must be positive.",
      );
  if (m.current > m.target)
    throw invalid("Milestone progress cannot exceed its target.");
  m.unit = text(m.unit || "steps", "Unit", 32);
  if (m.targetDate !== null && m.targetDate !== undefined) date(m.targetDate);
  if (m.id) {
    id(m.id);
    if (!old?.milestones.some((v) => String(v._id) === m.id))
      throw invalid("Milestone does not belong to this goal.");
    m._id = m.id;
    delete m.id;
  }
  const previous = old?.milestones.find((v) => String(v._id) === String(m._id));
  m.achievedAt =
    m.current >= m.target
      ? previous?.current >= previous?.target
        ? previous.achievedAt
        : new Date()
      : null;
  return m;
}
async function input(body, user, old) {
  const data = fields(body, [
    "title",
    "description",
    "category",
    "term",
    "targetDate",
    "status",
    "archived",
    "taskIds",
    "milestones",
  ]);
  if (!old || "title" in data) data.title = text(data.title, "Title", 120);
  if (!old || "targetDate" in data) date(data.targetDate, "Target date");
  if ("description" in data)
    data.description = text(data.description, "Description", 5000, true);
  if ("category" in data) data.category = text(data.category, "Category", 60);
  if ("term" in data) choice(data.term, ["short", "long"]);
  if ("status" in data) choice(data.status, ["active", "paused", "completed"]);
  if ("archived" in data) bool(data.archived);
  if ("milestones" in data) {
    if (!Array.isArray(data.milestones) || data.milestones.length > 30)
      throw invalid("Use at most 30 milestones.");
    data.milestones.forEach((m) =>
      fields(m, ["id", "title", "target", "current", "unit", "targetDate"]),
    );
    const ids = data.milestones.map((m) => m.id).filter(Boolean);
    if (new Set(ids).size !== ids.length)
      throw invalid("Duplicate milestone IDs.");
    data.milestones = data.milestones.map((m) => milestone(m, old));
  }
  await references(data, user);
  return data;
}
goalRouter.get("/", async (req, res) => {
  const query = {
    user: req.user._id,
    ...searchQuery(req.query, ["title", "description"]),
  };
  if (req.query.archived !== undefined) {
    choice(req.query.archived, ["true", "false"]);
    query.archived = req.query.archived === "true";
  }
  res.json({
    items: (await Goal.find(query).sort({ targetDate: 1 })).map(goalView),
  });
});
goalRouter.get("/:id", async (req, res) =>
  res.json({ item: goalView(await owned(Goal, req.params.id, req.user._id)) }),
);
goalRouter.post("/", async (req, res) =>
  res.status(201).json({
    item: goalView(
      await Goal.create({
        ...(await input(req.body, req.user._id)),
        user: req.user._id,
      }),
    ),
  }),
);
goalRouter.patch("/:id", async (req, res) => {
  const goal = await owned(Goal, req.params.id, req.user._id);
  Object.assign(goal, await input(req.body, req.user._id, goal));
  await goal.save();
  res.json({ item: goalView(goal) });
});
goalRouter.delete("/:id", async (req, res) => {
  const goal = await owned(Goal, req.params.id, req.user._id);
  await goal.deleteOne();
  res.status(204).end();
});
