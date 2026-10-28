import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    habit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Habit",
      required: true,
    },
    date: { type: String, required: true },
  },
  { timestamps: true },
);
schema.index({ habit: 1, date: 1 }, { unique: true });
schema.index({ user: 1, date: 1 });
export default mongoose.model("HabitCompletion", schema);
