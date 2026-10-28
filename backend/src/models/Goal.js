import mongoose from "mongoose";
const milestone = new mongoose.Schema({
  achievedAt: { type: Date, default: null },
  title: { type: String, required: true, maxlength: 120 },
  target: { type: Number, required: true, min: 0.000001, max: 1e9 },
  current: { type: Number, default: 0, min: 0, max: 1e9 },
  unit: { type: String, default: "steps", maxlength: 32 },
  targetDate: { type: String, default: null },
});
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", maxlength: 5000 },
    category: { type: String, default: "Personal", maxlength: 60 },
    term: { type: String, enum: ["short", "long"], default: "short" },
    targetDate: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "paused", "completed"],
      default: "active",
    },
    archived: { type: Boolean, default: false },
    milestones: [milestone],
    taskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
  },
  { timestamps: true, optimisticConcurrency: true },
);
schema.index({ user: 1, archived: 1, targetDate: 1 });
export default mongoose.model("Goal", schema);
