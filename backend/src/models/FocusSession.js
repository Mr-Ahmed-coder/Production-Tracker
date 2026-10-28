import mongoose from "mongoose";
const segment = new mongoose.Schema(
  {
    start: { type: Date, required: true },
    end: { type: Date, required: true },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    active: { type: Boolean, default: true },
    state: {
      type: String,
      enum: ["running", "paused", "finished", "discarded"],
      required: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Goal",
      default: null,
    },
    segments: [segment],
    runningSince: { type: Date, default: null },
    leaseUntil: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);
schema.index(
  { user: 1, active: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
schema.index({ user: 1, createdAt: -1 });
export default mongoose.model("FocusSession", schema);
