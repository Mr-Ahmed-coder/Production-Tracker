import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    series: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecurringTask",
      required: true,
    },
    date: { type: String, required: true },
    completed: { type: Boolean, default: false },
    skipped: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    lastCompletedAt: { type: Date, default: null },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    priority: { type: String, enum: ["High", "Medium", "Low"], required: true },
  },
  { timestamps: true, optimisticConcurrency: true },
);
schema.index({ user: 1, series: 1, date: 1 }, { unique: true });
schema.index({ user: 1, date: 1 });
schema.index({ user: 1, completed: 1, completedAt: 1 });
export default mongoose.model("TaskOccurrence", schema);
