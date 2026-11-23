import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
const schema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    enabled: { type: Boolean, default: false },
    reminderTime: {
      type: String,
      default: "18:00",
      match: /^(?:[01]\d|2[0-3]):[0-5]\d$/,
    },
    verifiedEmail: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
    verificationHash: { type: String, default: null, select: false },
    verificationEmail: { type: String, default: null, select: false },
    verificationExpiresAt: { type: Date, default: null },
    verificationRequests: { type: [Date], default: [] },
    unsubscribeNonce: {
      type: String,
      default: () => randomBytes(16).toString("hex"),
      select: false,
    },
  },
  { timestamps: true },
);
schema.index({ enabled: 1, verifiedAt: 1 });
export default mongoose.model("NotificationSettings", schema);
