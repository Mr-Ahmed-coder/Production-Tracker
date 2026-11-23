import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    dedupeKey: { type: String, required: true, unique: true },
    kind: { type: String, enum: ["daily", "verification"], required: true },
    localDate: String,
    timeZone: String,
    recipient: { type: String, required: true, select: false },
    verificationHash: { type: String, select: false },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      select: false,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "sending",
        "retry",
        "accepted",
        "failed",
        "cancelled",
        "uncertain",
      ],
      default: "pending",
    },
    attempts: { type: Number, default: 0 },
    firstAttemptAt: { type: Date, default: null },
    retryUntil: { type: Date, required: true },
    nextAttemptAt: { type: Date, required: true },
    leaseUntil: { type: Date, default: null },
    leaseToken: { type: String, default: null },
    providerId: { type: String, default: null },
    acceptedAt: { type: Date, default: null },
    lastFailure: { type: String, default: null },
    history: {
      type: [{ at: Date, outcome: String, code: String }],
      default: [],
    },
  },
  { timestamps: true },
);
schema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });
schema.index({ user: 1, kind: 1, localDate: 1 });
export default mongoose.model("EmailDelivery", schema);
