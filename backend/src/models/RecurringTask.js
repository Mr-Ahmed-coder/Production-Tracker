import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, default: "", maxlength: 5000 },
    priority: {
      type: String,
      enum: ["High", "Medium", "Low"],
      default: "Medium",
    },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    weekdays: { type: [Number], required: true },
    timeZone: { type: String, required: true },
    stoppedAfter: { type: String, default: null },
    deletedAt: { type: Date, default: null },
    createKey: { type: String, required: true },
    createHash: { type: String, required: true },
  },
  { timestamps: true, optimisticConcurrency: true },
);
schema.index({ user: 1, createKey: 1 }, { unique: true });
schema.index({ user: 1, startDate: 1, endDate: 1 });
export default mongoose.model("RecurringTask", schema);
