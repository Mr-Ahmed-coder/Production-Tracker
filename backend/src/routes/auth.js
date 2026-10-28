import { Router } from "express";
import User from "../models/User.js";
import Session from "../models/Session.js";
import {
  hashPassword,
  verifyPassword,
  hashToken,
  newToken,
  invalid,
  objectBody,
} from "../security.js";
export const authRouter = Router();
const cookieName = () =>
  process.env.NODE_ENV === "production"
    ? "__Host-prodtrack_session"
    : "prodtrack_session";
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
});
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });
function tokenFrom(req) {
  const entry = (req.headers.cookie || "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${cookieName()}=`));
  const token = entry?.slice(cookieName().length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
const lifetime = 7 * 24 * 60 * 60 * 1000;
async function startSession(req, res, user) {
  const old = tokenFrom(req);
  if (old) await Session.deleteOne({ tokenHash: hashToken(old) });
  const token = newToken();
  await Session.create({
    user: user._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + lifetime),
  });
  res.cookie(cookieName(), token, { ...cookieOptions(), maxAge: lifetime });
}
export async function requireAuth(req, res, next) {
  const token = tokenFrom(req);
  if (!token)
    return res.status(401).json({ error: "Please sign in to continue." });
  const session = await Session.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  });
  const user = session && (await User.findById(session.user));
  if (!user) {
    res.clearCookie(cookieName(), cookieOptions());
    return res
      .status(401)
      .json({ error: "Your session has expired. Please sign in again." });
  }
  req.user = user;
  next();
}
// Bounded per-IP limiter. Use a shared store before scaling to multiple API processes.
const attempts = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  for (const [key, value] of attempts)
    if (value.until <= now) attempts.delete(key);
  const key = req.ip;
  const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  if (entry.count >= 30 || (!attempts.has(key) && attempts.size >= 10000)) {
    res.set(
      "Retry-After",
      String(Math.max(1, Math.ceil((entry.until - now) / 1000))),
    );
    return res.status(429).json({
      error: "Too many authentication attempts. Please try again later.",
    });
  }
  entry.count++;
  attempts.set(key, entry);
  next();
}
function credentials(body) {
  objectBody(body);
  if (
    typeof body.email !== "string" ||
    body.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
  )
    throw invalid("Enter a valid email address.");
  if (
    typeof body.password !== "string" ||
    body.password.length < 8 ||
    body.password.length > 128
  )
    throw invalid("Password must contain 8–128 characters.");
  return { email: body.email.trim().toLowerCase(), password: body.password };
}
authRouter.post("/register", rateLimit, async (req, res) => {
  const { email, password } = credentials(req.body);
  if (
    typeof req.body.name !== "string" ||
    !req.body.name.trim() ||
    req.body.name.trim().length > 60
  )
    throw invalid("Name must contain 1–60 characters.");
  const user = await User.create({
    name: req.body.name.trim(),
    email,
    passwordHash: await hashPassword(password),
  });
  await startSession(req, res, user);
  res.status(201).json({ user: publicUser(user) });
});
// A dummy hash makes unknown-email login work comparable to an incorrect password.
const dummyHash = hashPassword(newToken());
authRouter.post("/login", rateLimit, async (req, res) => {
  const { email, password } = credentials(req.body);
  const user = await User.findOne({ email }).select("+passwordHash");
  const valid = await verifyPassword(
    password,
    user?.passwordHash || (await dummyHash),
  );
  if (!user || !valid)
    return res.status(401).json({ error: "Email or password is incorrect." });
  await startSession(req, res, user);
  res.json({ user: publicUser(user) });
});
authRouter.get("/me", requireAuth, (req, res) =>
  res.json({ user: publicUser(req.user) }),
);
authRouter.post("/logout", async (req, res) => {
  const token = tokenFrom(req);
  if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
  res.clearCookie(cookieName(), cookieOptions());
  res.status(204).end();
});
