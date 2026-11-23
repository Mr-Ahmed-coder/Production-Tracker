import { Router } from "express";
import NotificationSettings from "../models/NotificationSettings.js";
import EmailDelivery from "../models/EmailDelivery.js";
import { fields } from "./records.js";
import { invalid, newToken, hashToken, objectBody } from "../security.js";
import { settingsFor } from "../domain/analytics.js";
import {
  notificationSettings,
  parseUnsubscribe,
} from "../email/preferences.js";
import { emailConfig } from "../email/provider.js";
import { verificationEmail } from "../email/content.js";
export const notificationRouter = Router(),
  emailActionRouter = Router();
async function view(user) {
  const s = await notificationSettings(user._id),
    { timeZone } = await settingsFor(user._id);
  return {
    enabled: s.enabled,
    reminderTime: s.reminderTime,
    email: user.email,
    emailVerified: Boolean(s.verifiedAt && s.verifiedEmail === user.email),
    timeZone,
    configured: Boolean(emailConfig()),
  };
}
notificationRouter.get("/settings", async (req, res) =>
  res.json(await view(req.user)),
);
notificationRouter.put("/settings", async (req, res) => {
  const data = fields(req.body, ["enabled", "reminderTime"]);
  if ("enabled" in data && typeof data.enabled !== "boolean")
    throw invalid("Choose whether email reminders are enabled.");
  if (
    "reminderTime" in data &&
    (typeof data.reminderTime !== "string" ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(data.reminderTime))
  )
    throw invalid("Choose a time in HH:mm format.");
  const settings = await notificationSettings(req.user._id);
  if (
    data.enabled &&
    (!settings.verifiedAt || settings.verifiedEmail !== req.user.email)
  )
    return res
      .status(409)
      .json({ error: "Verify your email address before enabling reminders." });
  if (data.enabled && !emailConfig())
    return res
      .status(503)
      .json({
        error:
          "Email reminders are not configured by the workspace operator yet.",
      });
  await NotificationSettings.updateOne(
    { _id: settings._id },
    { $set: data },
    { runValidators: true },
  );
  res.json(await view(req.user));
});
notificationRouter.post("/verification", async (req, res) => {
  objectBody(req.body);
  if (Object.keys(req.body).length) throw invalid("Unknown record field.");
  const config = emailConfig();
  if (!config)
    return res
      .status(503)
      .json({
        error:
          "Email reminders are not configured by the workspace operator yet.",
      });
  const settings = await notificationSettings(req.user._id);
  if (settings.verifiedAt && settings.verifiedEmail === req.user.email)
    return res.json({ message: "Your email is already verified." });
  const now = new Date(),
    token = newToken(),
    verificationHash = hashToken(token),
    expiry = new Date(+now + 86400000);
  // Shared database cooldown: ten minutes between requests, at most three in rolling 24h.
  const changed = await NotificationSettings.findOneAndUpdate(
    {
      _id: settings._id,
      $and: [
        {
          $or: [
            { "verificationRequests.0": { $exists: false } },
            {
              verificationRequests: {
                $not: { $elemMatch: { $gt: new Date(+now - 600000) } },
              },
            },
          ],
        },
        {
          $or: [
            { "verificationRequests.2": { $exists: false } },
            { "verificationRequests.0": { $lte: new Date(+now - 86400000) } },
          ],
        },
      ],
    },
    {
      $set: {
        verificationHash,
        verificationEmail: req.user.email,
        verificationExpiresAt: expiry,
        verifiedAt: null,
        verifiedEmail: null,
        enabled: false,
      },
      $push: { verificationRequests: { $each: [now], $slice: -3 } },
    },
    { new: true },
  );
  if (!changed)
    return res
      .status(429)
      .set("Retry-After", "600")
      .json({
        error:
          "Please wait before requesting another verification email. Limit: three per day.",
      });
  const payload = verificationEmail({
    from: config.from,
    to: req.user.email,
    url: config.appUrl + "/settings#verify=" + token,
  });
  await EmailDelivery.create({
    user: req.user._id,
    dedupeKey: `verify:${req.user._id}:${verificationHash}`,
    kind: "verification",
    verificationHash,
    recipient: req.user.email,
    payload,
    retryUntil: expiry,
    nextAttemptAt: now,
  });
  res
    .status(202)
    .json({
      message:
        "Verification email queued. The scheduled worker will send it shortly.",
    });
});
notificationRouter.post("/verify", async (req, res) => {
  const { token } = fields(req.body, ["token"]);
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw invalid("Invalid or expired verification link.");
  const changed = await NotificationSettings.findOneAndUpdate(
    {
      user: req.user._id,
      verificationEmail: req.user.email,
      verificationHash: hashToken(token),
      verificationExpiresAt: { $gt: new Date() },
    },
    {
      $set: {
        verifiedEmail: req.user.email,
        verifiedAt: new Date(),
        enabled: false,
        verificationHash: null,
        verificationEmail: null,
        verificationExpiresAt: null,
      },
    },
  );
  if (!changed)
    throw invalid(
      "Invalid or expired verification link. Request a new one in Settings.",
    );
  res.json({ message: "Email verified. You can now enable daily reminders." });
});
// Bearer-token scoped opt-out; existing Origin/custom-header CSRF checks still apply.
emailActionRouter.post("/unsubscribe", async (req, res) => {
  const { token } = fields(req.body, ["token"]),
    parsed = parseUnsubscribe(token);
  if (!parsed)
    throw invalid(
      "Invalid unsubscribe link. You can also turn reminders off in Settings.",
    );
  const settings = await NotificationSettings.findOneAndUpdate(
    { user: parsed.user, unsubscribeNonce: parsed.nonce },
    { $set: { enabled: false } },
  );
  if (!settings) throw invalid("Invalid unsubscribe link.");
  res.json({
    message:
      "Daily email reminders are off. You can enable them again in Settings.",
  });
});
