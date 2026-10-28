import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    wentWell: { type: String, default: "", maxlength: 5000 },
    challenges: { type: String, default: "", maxlength: 5000 },
    tomorrow: { type: String, default: "", maxlength: 2000 },
  },
  { timestamps: true, optimisticConcurrency: true },
);
schema.index({ user: 1, date: 1 }, { unique: true });
export default mongoose.model("DailyReview", schema);
