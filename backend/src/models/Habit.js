import mongoose from "mongoose";
const schedule = new mongoose.Schema(
  {
    effectiveFrom: { type: String, required: true },
    weekdays: [{ type: Number, min: 0, max: 6 }],
  },
  { _id: false },
);
const pause = new mongoose.Schema(
  {
    from: { type: String, required: true },
    to: { type: String, default: null },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    titleKey: { type: String, maxlength: 240 },
    category: { type: String, default: "Personal", maxlength: 60 },
    timeZone: { type: String, required: true },
    startDate: { type: String, required: true },
    schedule: [schedule],
    pauses: [pause],
    archived: { type: Boolean, default: false },
  },
  { timestamps: true, optimisticConcurrency: true },
);
schema.index({ user: 1, archived: 1, createdAt: 1 });
// Legacy habits are preserved; new/renamed habits receive an indexed identity.
schema.index(
  { user: 1, titleKey: 1 },
  {
    unique: true,
    partialFilterExpression: { titleKey: { $type: "string" } },
  },
);
export default mongoose.model("Habit", schema);
