import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    timeZone: { type: String, default: "Africa/Kampala" },
    dailyTargetMinutes: { type: Number, default: 180, min: 1, max: 1440 },
  },
  { timestamps: true },
);
export default mongoose.model("ProductivitySettings", schema);
