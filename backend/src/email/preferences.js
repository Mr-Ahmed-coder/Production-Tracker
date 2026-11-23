import { createHmac, timingSafeEqual } from "node:crypto";
import NotificationSettings from "../models/NotificationSettings.js";
export async function notificationSettings(user) {
  try {
    return await NotificationSettings.findOneAndUpdate(
      { user },
      { $setOnInsert: { user } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    return NotificationSettings.findOne({ user });
  }
}
const signature = (data, secret) =>
  createHmac("sha256", secret)
    .update("unsubscribe:" + data)
    .digest("hex");
export function unsubscribeToken(settings, secret) {
  const data = `${settings.user}.${settings.unsubscribeNonce}`;
  return `${data}.${signature(data, secret)}`;
}
export function parseUnsubscribe(
  token,
  secret = process.env.EMAIL_TOKEN_SECRET,
) {
  if (
    !secret ||
    secret.length < 32 ||
    typeof token !== "string" ||
    !/^[a-f0-9]{24}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)
  )
    return null;
  const [user, nonce, supplied] = token.split("."),
    expected = signature(`${user}.${nonce}`, secret);
  return timingSafeEqual(
    Buffer.from(supplied, "hex"),
    Buffer.from(expected, "hex"),
  )
    ? { user, nonce }
    : null;
}
