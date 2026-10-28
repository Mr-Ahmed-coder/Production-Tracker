import { Router } from "express";
import mongoose from "mongoose";
import Task from "../models/Task.js";
import { hashToken, invalid, objectBody } from "../security.js";
export const taskRouter = Router();
const fields = ["title", "priority", "dueDate", "completed", "category"];
function taskInput(body, partial = false) {
  objectBody(body);
  if (Object.keys(body).some((k) => !fields.includes(k)))
    throw invalid("Unknown task field.");
  const data = {};
  for (const key of fields) if (Object.hasOwn(body, key)) data[key] = body[key];
  if (!partial || Object.hasOwn(data, "title")) {
    if (
      typeof data.title !== "string" ||
      !data.title.trim() ||
      data.title.trim().length > 120
    )
      throw invalid("Title must contain 1–120 characters.");
    data.title = data.title.trim();
  }
  if (!partial || Object.hasOwn(data, "dueDate")) {
    if (
      typeof data.dueDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate) ||
      Number.isNaN(Date.parse(data.dueDate)) ||
      new Date(data.dueDate).toISOString().slice(0, 10) !== data.dueDate
    )
      throw invalid("Enter a valid due date.");
  }
  if ("priority" in data && !["High", "Medium", "Low"].includes(data.priority))
    throw invalid("Invalid priority.");
  if ("completed" in data && typeof data.completed !== "boolean")
    throw invalid("Completed must be true or false.");
  if (
    "category" in data &&
    (typeof data.category !== "string" || data.category.trim().length > 60)
  )
    throw invalid("Category must be at most 60 characters.");
  if (partial && !Object.keys(data).length)
    throw invalid("No changes supplied.");
  return data;
}
const serialize = (t) => ({
  id: String(t._id),
  title: t.title,
  priority: t.priority,
  completed: t.completed,
  dueDate: t.dueDate,
  category: t.category,
});
taskRouter.get("/", async (req, res) => {
  const query = { user: req.user._id };
  const { search, status, priority, dueDate } = req.query;
  if (search !== undefined) {
    if (typeof search !== "string" || search.length > 120)
      throw invalid("Invalid search.");
    query.title = {
      $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  }
  if (status !== undefined) {
    if (!["completed", "incomplete"].includes(status))
      throw invalid("Invalid status.");
    query.completed = status === "completed";
  }
  if (priority !== undefined) {
    if (!["High", "Medium", "Low"].includes(priority))
      throw invalid("Invalid priority.");
    query.priority = priority;
  }
  if (dueDate !== undefined) {
    taskInput({ dueDate }, true);
    query.dueDate = dueDate;
  }
  if (req.query.page !== undefined) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(
      1,
      Math.min(100, parseInt(req.query.limit, 10) || 20),
    );
    const [total, docs] = await Promise.all([
      Task.countDocuments(query),
      Task.find(query)
        .sort({ dueDate: 1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);
    return res.json({
      tasks: docs.map(serialize),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  }
  res.json({
    tasks: (await Task.find(query).sort({ dueDate: 1, createdAt: 1 })).map(
      serialize,
    ),
  });
});
taskRouter.post("/", async (req, res) => {
  const task = await Task.create({
    ...taskInput(req.body),
    user: req.user._id,
    completedAt: req.body.completed === true ? new Date() : null,
  });
  res.status(201).json({ task: serialize(task) });
});
// Validate the entire batch first. Stable per-user import keys make retries idempotent.
taskRouter.post("/import", async (req, res) => {
  objectBody(req.body);
  const { tasks } = req.body;
  if (!Array.isArray(tasks) || !tasks.length || tasks.length > 100)
    throw invalid("Import 1–100 tasks at a time.");
  const entries = tasks.map((t) => {
    objectBody(t);
    const { id, ...body } = t;
    if (typeof id !== "string" || !id || id.length > 200)
      throw invalid("Every imported task needs its original ID.");
    return { data: taskInput(body), key: hashToken(id) };
  });
  await Task.bulkWrite(
    entries.map(({ data, key }) => ({
      updateOne: {
        filter: { user: req.user._id, importKey: key },
        update: {
          $setOnInsert: { ...data, user: req.user._id, importKey: key },
        },
        upsert: true,
      },
    })),
  );
  res.json({
    message: "Import complete. Existing imported tasks were preserved.",
  });
});
taskRouter.param("id", (req, res, next, id) =>
  mongoose.isObjectIdOrHexString(id)
    ? next()
    : res.status(400).json({ error: "Invalid task ID." }),
);
taskRouter.patch("/:id", async (req, res) => {
  const data = taskInput(req.body, true);
  const task = await Task.findOne({ _id: req.params.id, user: req.user._id });
  if (!task) return res.status(404).json({ error: "Task not found." });
  if ("completed" in data && data.completed !== task.completed)
    task.completedAt = data.completed ? new Date() : null;
  Object.assign(task, data);
  await task.save();
  res.json({ task: serialize(task) });
});
taskRouter.delete("/:id", async (req, res) => {
  const task = await Task.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id,
  });
  if (!task) return res.status(404).json({ error: "Task not found." });
  res.status(204).end();
});
