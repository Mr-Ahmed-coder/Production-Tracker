import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter, requireAuth } from "./routes/auth.js";
import { taskRouter } from "./routes/tasks.js";
import { noteRouter } from "./routes/notes.js";
import { goalRouter } from "./routes/goals.js";
import { habitRouter } from "./routes/habits.js";
import { focusRouter } from "./routes/focus.js";
import { productivityRouter } from "./routes/productivity.js";
export const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
  next();
});
export function getAllowedOrigins() {
  const configured = (process.env.CLIENT_ORIGIN || "http://127.0.0.1:5173")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

  const origins = new Set(configured);

  if (process.env.RENDER_EXTERNAL_URL) {
    origins.add(process.env.RENDER_EXTERNAL_URL.replace(/\/$/, ""));
  }

  // In non-production environments, also permit localhost/127.0.0.1 loopback equivalents
  // so accessing via http://localhost:5173 or http://127.0.0.1:5173 both work seamlessly.
  if (process.env.NODE_ENV !== "production") {
    for (const origin of configured) {
      try {
        const url = new URL(origin);
        if (url.hostname === "127.0.0.1") {
          origins.add(
            `${url.protocol}//localhost${url.port ? `:${url.port}` : ""}`,
          );
        } else if (url.hostname === "localhost") {
          origins.add(
            `${url.protocol}//127.0.0.1${url.port ? `:${url.port}` : ""}`,
          );
        }
      } catch {
        // ignore invalid URL
      }
    }
    origins.add("http://localhost:5173");
    origins.add("http://127.0.0.1:5173");
  }

  return Array.from(origins);
}

function matchesOrigin(allowedList, candidateOrigin) {
  if (!candidateOrigin) return false;
  return allowedList.some((allowed) => {
    if (allowed === candidateOrigin) return true;
    if (allowed.includes("*")) {
      const pattern = new RegExp(
        `^${allowed.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
      );
      return pattern.test(candidateOrigin);
    }
    return false;
  });
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = getAllowedOrigins();
      if (matchesOrigin(allowed, origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "100kb" }));
// Non-simple custom header and allowed Origin validation protect all mutations against CSRF.
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const allowed = getAllowedOrigins();
    let reqOrigin = req.get("Origin");
    if (!reqOrigin && req.get("Referer")) {
      try {
        reqOrigin = new URL(req.get("Referer")).origin;
      } catch {
        reqOrigin = null;
      }
    }

    const selfOrigin = req.get("host")
      ? `${req.protocol}://${req.get("host")}`
      : null;

    const isAllowed =
      reqOrigin &&
      (matchesOrigin(allowed, reqOrigin) || reqOrigin === selfOrigin);

    if (
      req.get("X-ProdTrack-Request") !== "1" ||
      !isAllowed
    ) {
      return res
        .status(403)
        .json({ error: "Request origin could not be verified." });
    }
  }
  next();
});
app.get("/api/health", (_req, res) =>
  res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({
    status: mongoose.connection.readyState === 1 ? "ok" : "unavailable",
    service: "prodtrack-api",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  }),
);
app.use("/api", (_req, res, next) =>
  mongoose.connection.readyState === 1
    ? next()
    : res
        .status(503)
        .json({ error: "Database unavailable. Please try again shortly." }),
);
app.use("/api/auth", authRouter);
app.use("/api/tasks", requireAuth, taskRouter);
app.use("/api/notes", requireAuth, noteRouter);
app.use("/api/goals", requireAuth, goalRouter);
app.use("/api/habits", requireAuth, habitRouter);
app.use("/api/focus", requireAuth, focusRouter);
app.use("/api/productivity", requireAuth, productivityRouter);
app.use("/api", (_req, res) => res.status(404).json({ error: "Route not found" }));

const distPath = fileURLToPath(new URL("../../frontend/dist", import.meta.url));
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(distPath, "index.html"));
  });
}
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, _req, res, _next) => {
  if (err.name === "VersionError")
    return res.status(409).json({
      error: "This record changed in another request. Refresh and try again.",
    });
  if (err.code === 11000)
    return res.status(409).json({
      error: err.keyPattern?.active
        ? "Finish or discard your existing focus session first."
        : err.keyPattern?.date
          ? "A review for this date already exists. Reopen it before saving."
          : err.keyPattern?.titleKey
            ? "A habit with this name already exists. Edit or restore the existing habit."
            : err.keyPattern?.journalDate
              ? "A journal entry for that date already exists. Open the saved entry in Notes."
              : "A record with that identifier already exists.",
    });
  if (err.status === 413)
    return res.status(413).json({ error: "Request is too large." });
  if (
    err instanceof SyntaxError ||
    err.name === "ValidationError" ||
    err.name === "CastError"
  )
    return res.status(400).json({ error: "Invalid request data." });
  if (err.status && err.status < 500)
    return res.status(err.status).json({ error: err.message });
  console.error("API request failed:", err.name);
  res.status(503).json({ error: "Service unavailable. Please try again." });
});
