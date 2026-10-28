import { Router } from "express";
import FocusSession from "../models/FocusSession.js";
import { fields, references, owned } from "./records.js";
import { invalid, objectBody } from "../security.js";
import {
  LEASE_MS,
  SESSION_MS,
  closeInterval,
  expire,
  durationMs,
} from "../domain/focus.js";
export const focusRouter = Router();
export const focusView = (s, now = new Date()) => ({
  id: s.id,
  state: s.state === "running" && +s.leaseUntil <= +now ? "paused" : s.state,
  active: s.active,
  taskId: s.taskId ? String(s.taskId) : null,
  goalId: s.goalId ? String(s.goalId) : null,
  createdAt: s.createdAt,
  endedAt: s.endedAt,
  durationMs: durationMs(s, now),
  serverNow: now,
  leaseUntil: s.leaseUntil,
});
async function current(user) {
  const s = await FocusSession.findOne({ user, active: true });
  if (s && expire(s)) await s.save();
  return s;
}
focusRouter.get("/active", async (req, res) => {
  const s = await current(req.user._id);
  res.json({ item: s ? focusView(s) : null });
});
focusRouter.get("/", async (req, res) =>
  res.json({
    items: (
      await FocusSession.find({
        user: req.user._id,
        state: { $ne: "discarded" },
      })
        .sort({ createdAt: -1 })
        .limit(100)
    ).map((s) => focusView(s)),
  }),
);
focusRouter.post("/", async (req, res) => {
  objectBody(req.body);
  const data = Object.keys(req.body).length
    ? fields(req.body, ["taskId", "goalId"])
    : {};
  await references(data, req.user._id);
  if (await current(req.user._id))
    throw Object.assign(
      new Error("Finish or discard your existing session first."),
      { status: 409 },
    );
  const now = new Date();
  const s = await FocusSession.create({
    ...data,
    user: req.user._id,
    state: "running",
    runningSince: now,
    leaseUntil: new Date(+now + LEASE_MS),
  });
  res.status(201).json({ item: focusView(s, now) });
});
focusRouter.post("/:id/:action", async (req, res) => {
  if (
    !["pause", "resume", "heartbeat", "finish", "discard"].includes(
      req.params.action,
    )
  )
    throw invalid("Unknown focus action.");
  objectBody(req.body ?? {});
  if (req.body && Object.keys(req.body).length)
    throw invalid("Focus actions do not accept timing data.");
  const s = await owned(FocusSession, req.params.id, req.user._id),
    now = new Date(),
    action = req.params.action;
  expire(s, now);
  if (!s.active) {
    if (
      (action === "finish" && s.state === "finished") ||
      (action === "discard" && s.state === "discarded")
    )
      return res.json({ item: focusView(s, now) });
    throw Object.assign(new Error("This session has already ended."), {
      status: 409,
    });
  }
  if (action === "heartbeat" && s.state === "running")
    s.leaseUntil = new Date(
      Math.min(+now + LEASE_MS, +s.createdAt + SESSION_MS),
    );
  if (action === "pause" && s.state === "running") {
    closeInterval(s, now);
    s.state = "paused";
  }
  if (action === "resume" && s.state === "paused") {
    if (+now >= +s.createdAt + SESSION_MS)
      throw invalid(
        "Sessions can run for at most 24 hours. Finish this session and start another.",
      );
    s.state = "running";
    s.runningSince = now;
    s.leaseUntil = new Date(
      Math.min(+now + LEASE_MS, +s.createdAt + SESSION_MS),
    );
  }
  if (action === "finish" || action === "discard") {
    closeInterval(s, now);
    s.active = false;
    s.state = action === "finish" ? "finished" : "discarded";
    s.endedAt = now;
  }
  await s.save();
  res.json({ item: focusView(s, now) });
});
