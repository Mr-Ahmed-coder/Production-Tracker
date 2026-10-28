import dns from "node:dns";
import mongoose from "mongoose";
import User from "../models/User.js";
import Task from "../models/Task.js";
import Session from "../models/Session.js";
import Note from "../models/Note.js";
import Goal from "../models/Goal.js";
import Habit from "../models/Habit.js";
import Completion from "../models/HabitCompletion.js";
import FocusSession from "../models/FocusSession.js";
import ProductivitySettings from "../models/ProductivitySettings.js";
import DailyReview from "../models/DailyReview.js";
mongoose.set("bufferCommands", false);
export async function connectDatabase() {
  if (!process.env.MONGODB_URI)
    throw new Error("MONGODB_URI is required. See backend/.env.example.");
  if (process.env.MONGODB_URI.startsWith("mongodb+srv://")) {
    try {
      const servers = dns
        .getServers()
        .filter((s) => s !== "127.0.0.1" && s !== "::1");
      if (servers.length === 0) {
        dns.setServers(["8.8.8.8", "1.1.1.1"]);
      } else {
        dns.setServers([...servers, "8.8.8.8", "1.1.1.1"]);
      }
    } catch {
      // Continue with default DNS if setServers is unavailable
    }
  }
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  await Promise.all([
    FocusSession.init(),
    ProductivitySettings.init(),
    DailyReview.init(),
    User.init(),
    Task.init(),
    Session.init(),
    Note.init(),
    Goal.init(),
    Habit.init(),
    Completion.init(),
  ]);
  console.info("MongoDB connected.");
}
