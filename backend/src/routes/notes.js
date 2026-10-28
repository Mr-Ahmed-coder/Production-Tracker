import { Router } from "express";
import Note from "../models/Note.js";
import {
  fields,
  text,
  date,
  bool,
  references,
  owned,
  searchQuery,
  base,
} from "./records.js";
import { invalid } from "../security.js";
export const noteRouter = Router();
const view = (n) => ({
  ...base(n),
  title: n.title,
  content: n.content,
  category: n.category,
  tags: n.tags,
  pinned: n.pinned,
  journalDate: n.journalDate || null,
  goalId: n.goalId ? String(n.goalId) : null,
  taskId: n.taskId ? String(n.taskId) : null,
});
async function input(body, user, creating = false) {
  const data = fields(body, [
    "title",
    "content",
    "category",
    "tags",
    "pinned",
    "journalDate",
    "goalId",
    "taskId",
  ]);
  if (creating || "title" in data) data.title = text(data.title, "Title", 120);
  if ("content" in data)
    data.content = text(data.content, "Content", 20000, true);
  if ("category" in data) data.category = text(data.category, "Category", 60);
  if ("tags" in data) {
    if (!Array.isArray(data.tags) || data.tags.length > 10)
      throw invalid("Use at most 10 tags.");
    data.tags = [...new Set(data.tags.map((t) => text(t, "Tag", 32)))];
  }
  if ("pinned" in data) bool(data.pinned);
  if ("journalDate" in data) {
    if (data.journalDate === null) data.journalDate = undefined;
    else date(data.journalDate, "Journal date");
  }
  await references(data, user);
  return data;
}
noteRouter.get("/", async (req, res) => {
  const query = {
    user: req.user._id,
    ...searchQuery(req.query, ["title", "content", "tags"]),
  };
  if (req.query.kind !== undefined) {
    if (!["note", "journal"].includes(req.query.kind))
      throw invalid("Invalid note type.");
    query.journalDate = { $exists: req.query.kind === "journal" };
  }
  if (req.query.tag !== undefined) query.tags = text(req.query.tag, "Tag", 32);
  if (req.query.page !== undefined) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(
      1,
      Math.min(100, parseInt(req.query.limit, 10) || 20),
    );
    const [total, docs] = await Promise.all([
      Note.countDocuments(query),
      Note.find(query)
        .sort({ pinned: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);
    return res.json({
      items: docs.map(view),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  }
  res.json({
    items: (await Note.find(query).sort({ pinned: -1, updatedAt: -1 })).map(
      view,
    ),
  });
});
noteRouter.get("/:id", async (req, res) =>
  res.json({ item: view(await owned(Note, req.params.id, req.user._id)) }),
);
noteRouter.post("/", async (req, res) =>
  res.status(201).json({
    item: view(
      await Note.create({
        ...(await input(req.body, req.user._id, true)),
        user: req.user._id,
      }),
    ),
  }),
);
noteRouter.patch("/:id", async (req, res) => {
  const note = await owned(Note, req.params.id, req.user._id);
  Object.assign(note, await input(req.body, req.user._id));
  await note.save();
  res.json({ item: view(note) });
});
noteRouter.delete("/:id", async (req, res) => {
  const note = await owned(Note, req.params.id, req.user._id);
  await note.deleteOne();
  res.status(204).end();
});
