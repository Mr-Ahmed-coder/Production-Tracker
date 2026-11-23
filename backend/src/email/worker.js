import { randomUUID } from "node:crypto";
import User from "../models/User.js";
import Task from "../models/Task.js";
import NotificationSettings from "../models/NotificationSettings.js";
import EmailDelivery from "../models/EmailDelivery.js";
import { settingsFor } from "../domain/analytics.js";
import { dateInZone } from "../domain/calendar.js";
import { recurringRange } from "../domain/recurringTasks.js";
import { emailConfig, sendEmail, EmailProviderError } from "./provider.js";
import { reminderEmail } from "./content.js";
import { unsubscribeToken } from "./preferences.js";
const hour = 3600000;
export function localClock(timeZone, now) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    date: dateInZone(timeZone, now),
    time: get("hour") + ":" + get("minute"),
  };
}
export async function unfinishedTasks(user, date) {
  const [tasks, recurring] = await Promise.all([
    Task.find({
      user,
      completed: false,
      $or: [{ scheduledDate: date }, { scheduledDate: null, dueDate: date }],
    })
      .select("title")
      .sort({ createdAt: 1 })
      .lean(),
    recurringRange(user, date, date),
  ]);
  return [...tasks, ...recurring.filter((item) => !item.completed)];
}
async function createDaily(settings, now, config, dryRun) {
  const user = await User.findById(settings.user).select("email").lean();
  if (!user || !settings.verifiedAt || settings.verifiedEmail !== user.email)
    return false;
  const { timeZone } = await settingsFor(user._id),
    { date, time } = localClock(timeZone, now);
  if (time < settings.reminderTime) return false;
  const dedupeKey = `daily:${user._id}:${date}`;
  if (await EmailDelivery.exists({ dedupeKey })) return false;
  const tasks = await unfinishedTasks(user._id, date);
  if (!tasks.length) return false;
  if (dryRun) return true;
  const token = unsubscribeToken(settings, config.secret);
  const payload = reminderEmail({
    from: config.from,
    to: user.email,
    date,
    tasks,
    calendarUrl: config.appUrl + "/calendar",
    unsubscribeUrl: config.appUrl + "/email/unsubscribe#token=" + token,
  });
  try {
    await EmailDelivery.updateOne(
      { dedupeKey },
      {
        $setOnInsert: {
          user: user._id,
          dedupeKey,
          kind: "daily",
          localDate: date,
          timeZone,
          recipient: user.email,
          payload,
          retryUntil: new Date(+now + 23 * hour),
          nextAttemptAt: now,
        },
      },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  return true;
}
async function eligible(delivery, now) {
  const [settings, user] = await Promise.all([
    NotificationSettings.findOne({ user: delivery.user }).select(
      "+verificationHash",
    ),
    User.findById(delivery.user).select("email"),
  ]);
  if (!settings || !user || user.email !== delivery.recipient) return false;
  if (delivery.kind === "verification")
    return (
      !settings.verifiedAt &&
      settings.verificationHash === delivery.verificationHash &&
      settings.verificationExpiresAt > now
    );
  const { timeZone } = await settingsFor(user._id),
    { date, time } = localClock(timeZone, now);
  if (
    !settings.enabled ||
    !settings.verifiedAt ||
    settings.verifiedEmail !== user.email ||
    date !== delivery.localDate ||
    time < settings.reminderTime
  )
    return false;
  // After a possible send, retry the immutable original request for provider deduplication.
  return Boolean(
    delivery.firstAttemptAt || (await unfinishedTasks(user._id, date)).length,
  );
}
export async function runEmailWorker({
  now,
  send = sendEmail,
  config = emailConfig(),
  dryRun = false,
  limit = 100,
} = {}) {
  if (!config && !dryRun)
    throw new Error("Email reminders are disabled or not configured.");
  const clock = () => (now ? new Date(now) : new Date());
  const stats = {
    due: 0,
    accepted: 0,
    retry: 0,
    failed: 0,
    cancelled: 0,
    uncertain: 0,
    dryRun,
  };
  const cursor = NotificationSettings.find({
    enabled: true,
    verifiedAt: { $ne: null },
  })
    .select("+unsubscribeNonce")
    .cursor();
  for await (const settings of cursor)
    if (await createDaily(settings, clock(), config, dryRun)) stats.due++;
  if (dryRun) return stats;
  // Keep an unfinished/ambiguous attempt as uncertain forever, never replay beyond Resend's 24h window.
  const expired = await EmailDelivery.updateMany(
    {
      status: { $in: ["pending", "retry", "sending"] },
      retryUntil: { $lte: clock() },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lte: clock() } }],
    },
    {
      $set: {
        status: "uncertain",
        lastFailure: "retry_window_expired",
        leaseToken: null,
      },
      $unset: { payload: 1 },
    },
  );
  stats.uncertain += expired.modifiedCount;
  // Snapshot candidate IDs avoids repeatedly claiming the same job inside one invocation.
  const candidates = await EmailDelivery.find({
    retryUntil: { $gt: clock() },
    $or: [
      {
        status: { $in: ["pending", "retry"] },
        nextAttemptAt: { $lte: clock() },
      },
      { status: "sending", leaseUntil: { $lte: clock() } },
    ],
  })
    .sort({ nextAttemptAt: 1, _id: 1 })
    .limit(limit)
    .select("_id")
    .lean();
  for (const candidate of candidates) {
    const instant = clock(),
      leaseToken = randomUUID();
    const row = await EmailDelivery.findOneAndUpdate(
      {
        _id: candidate._id,
        retryUntil: { $gt: instant },
        $or: [
          {
            status: { $in: ["pending", "retry"] },
            nextAttemptAt: { $lte: instant },
          },
          { status: "sending", leaseUntil: { $lte: instant } },
        ],
      },
      {
        $set: {
          status: "sending",
          leaseToken,
          leaseUntil: new Date(+instant + 2 * 60000),
        },
      },
      { new: true },
    ).select("+payload +recipient +verificationHash");
    if (!row) continue;
    const update = (values, outcome, code, terminal = false) =>
      EmailDelivery.updateOne(
        { _id: row._id, leaseToken },
        {
          $set: { ...values, leaseToken: null, leaseUntil: null },
          $push: {
            history: { $each: [{ at: clock(), outcome, code }], $slice: -10 },
          },
          ...(terminal ? { $unset: { payload: 1 } } : {}),
        },
      );
    if (!(await eligible(row, clock()))) {
      await update(
        { status: "cancelled", lastFailure: "no_longer_eligible" },
        "cancelled",
        "no_longer_eligible",
        true,
      );
      stats.cancelled++;
      continue;
    }
    const first = row.firstAttemptAt || instant;
    // Persist the first attempt BEFORE contacting the provider, so crash recovery remains bounded.
    const grant = await EmailDelivery.updateOne(
      {
        _id: row._id,
        leaseToken,
        leaseUntil: { $gt: clock() },
        retryUntil: { $gt: clock() },
      },
      {
        $set: {
          firstAttemptAt: first,
          retryUntil: new Date(Math.min(+row.retryUntil, +first + 23 * hour)),
        },
        $inc: { attempts: 1 },
        $push: {
          history: {
            $each: [{ at: instant, outcome: "attempt", code: null }],
            $slice: -10,
          },
        },
      },
    );
    if (!grant.matchedCount) continue;
    try {
      const providerId = await send(row.payload, row.dedupeKey);
      await update(
        {
          status: "accepted",
          providerId,
          acceptedAt: clock(),
          lastFailure: null,
        },
        "accepted",
        null,
        true,
      );
      stats.accepted++;
    } catch (error) {
      const code =
        error instanceof EmailProviderError ? error.code : "unknown_failure";
      const retry = !(error instanceof EmailProviderError) || error.retryable;
      const exhausted = row.attempts + 1 >= 6;
      const status = retry ? (exhausted ? "uncertain" : "retry") : "failed";
      const backoff = [60000, 300000, 900000, hour, 3 * hour][
        Math.min(row.attempts, 4)
      ];
      await update(
        {
          status,
          lastFailure: code,
          nextAttemptAt: new Date(+clock() + backoff),
        },
        status,
        code,
        status !== "retry",
      );
      stats[status]++;
    }
  }
  return stats;
}
