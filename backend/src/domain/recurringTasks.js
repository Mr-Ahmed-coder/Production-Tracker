import RecurringTask from "../models/RecurringTask.js";
import TaskOccurrence from "../models/TaskOccurrence.js";
import { shiftDate, weekday } from "./calendar.js";
export function scheduled(series, date) {
  return (
    !series.deletedAt &&
    date >= series.startDate &&
    date <= series.endDate &&
    (!series.stoppedAfter || date <= series.stoppedAfter) &&
    series.weekdays.includes(weekday(date))
  );
}
export function occurrenceView(series, state, date) {
  const completed = Boolean(state?.completed),
    snapshot = completed ? state : series;
  return {
    id: String(series._id) + ":" + date,
    seriesId: String(series._id),
    date,
    title: snapshot.title,
    description: snapshot.description || "",
    priority: snapshot.priority,
    completed,
    completedAt: state?.completedAt ?? null,
    timeZone: series.timeZone,
    retained: completed && !scheduled(series, date),
    editable: !series.deletedAt,
  };
}
export async function recurringRange(user, from, to) {
  const states = await TaskOccurrence.find({
    user,
    date: { $gte: from, $lte: to },
  }).lean();
  const series = await RecurringTask.find({
    user,
    $or: [
      { deletedAt: null, startDate: { $lte: to }, endDate: { $gte: from } },
      { _id: { $in: states.filter((s) => s.completed).map((s) => s.series) } },
    ],
  }).lean();
  const stateMap = new Map(
    states.map((s) => [String(s.series) + ":" + s.date, s]),
  );
  const items = [];
  for (const s of series)
    for (let date = from; date <= to; date = shiftDate(date, 1)) {
      const state = stateMap.get(String(s._id) + ":" + date);
      if (state?.completed || (scheduled(s, date) && !state?.skipped))
        items.push(occurrenceView(s, state, date));
    }
  return items;
}
export async function recurringCompletions(
  user,
  from,
  to,
  timeZone,
  dateInZone,
) {
  const rows = await TaskOccurrence.find({
    user,
    completed: true,
    completedAt: {
      $gte: new Date(+new Date(from) - 48 * 3600000),
      $lt: new Date(+new Date(to) + 48 * 3600000),
    },
  }).lean();
  const ids = new Set(
    (
      await RecurringTask.find({
        user,
        _id: { $in: rows.map((r) => r.series) },
      })
        .select("_id")
        .lean()
    ).map((s) => String(s._id)),
  );
  return rows
    .filter(
      (r) =>
        ids.has(String(r.series)) &&
        dateInZone(timeZone, r.completedAt) >= from &&
        dateInZone(timeZone, r.completedAt) <= to,
    )
    .map((r) => ({
      id: String(r.series) + ":" + r.date,
      title: r.title,
      date: dateInZone(timeZone, r.completedAt),
      scheduledDate: r.date,
      recurring: true,
    }));
}
