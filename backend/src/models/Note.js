import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    content: { type: String, default: "", maxlength: 20000 },
    category: { type: String, default: "Personal", maxlength: 60 },
    tags: [{ type: String, maxlength: 32 }],
    pinned: { type: Boolean, default: false },
    journalDate: { type: String },
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Goal",
      default: null,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
  },
  { timestamps: true, optimisticConcurrency: true },
);
schema.index({ user: 1, pinned: -1, updatedAt: -1 });
schema.index(
  { user: 1, journalDate: 1 },
  {
    unique: true,
    partialFilterExpression: { journalDate: { $type: "string" } },
  },
);
export default mongoose.model("Note", schema);
