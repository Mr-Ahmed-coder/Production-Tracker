import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    priority: {
      type: String,
      enum: ["High", "Medium", "Low"],
      default: "Medium",
    },
    completedAt: { type: Date, default: null },
    completed: { type: Boolean, default: false },
    dueDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    category: { type: String, trim: true, maxlength: 60, default: "Personal" },
    importKey: { type: String },
  },
  { timestamps: true, optimisticConcurrency: true },
);
schema.index({ user: 1, dueDate: 1, createdAt: 1 });
schema.index(
  { user: 1, importKey: 1 },
  { unique: true, partialFilterExpression: { importKey: { $type: "string" } } },
);
export default mongoose.model("Task", schema);
