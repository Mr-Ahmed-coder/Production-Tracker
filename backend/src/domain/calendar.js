export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "1000-01-01" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function shiftDate(value, amount) {
  const d = new Date(value + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}
export const weekday = (date) => new Date(date + "T12:00:00Z").getUTCDay();
export function validZone(zone) {
  try {
    if (typeof zone !== "string" || zone.length > 100) return false;
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
export function dateInZone(zone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return get("year") + "-" + get("month") + "-" + get("day");
}
export function isScheduled(habit, date) {
  if (
    date < habit.startDate ||
    habit.pauses.some((p) => date >= p.from && (!p.to || date < p.to))
  )
    return false;
  const version = [...habit.schedule]
    .reverse()
    .find((v) => v.effectiveFrom <= date);
  return Boolean(version?.weekdays.includes(weekday(date)));
}
export function habitMetrics(habit, completions, now = new Date()) {
  const today = dateInZone(habit.timeZone, now);
  const done = new Set(completions.filter((d) => d <= today));
  const eligible = [];
  for (let d = habit.startDate; d <= today; d = shiftDate(d, 1))
    if (isScheduled(habit, d)) eligible.push(d);
  let longest = 0,
    run = 0;
  for (const date of eligible) {
    run = done.has(date) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const ended = eligible.filter((date) => date !== today || done.has(date));
  let current = 0;
  for (let i = ended.length - 1; i >= 0 && done.has(ended[i]); i--) current++;
  const completed = eligible.filter((d) => done.has(d)).length;
  const monday = shiftDate(today, -((weekday(today) + 6) % 7));
  // Eight Monday-based weeks. Only elapsed scheduled dates enter the totals.
  const weekHistory = Array.from({ length: 8 }, (_, i) => {
    const start = shiftDate(monday, (i - 7) * 7);
    const end = shiftDate(start, 6);
    const scheduled = eligible.filter((d) => d >= start && d <= end);
    return {
      start,
      end,
      scheduled: scheduled.length,
      completed: scheduled.filter((d) => done.has(d)).length,
    };
  });
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDate(monday, i);
    return {
      date,
      scheduled: isScheduled(habit, date),
      completed: done.has(date),
      future: date > today,
    };
  });
  return {
    today,
    currentStreak: current,
    longestStreak: longest,
    consistency: eligible.length
      ? Math.round((completed / eligible.length) * 100)
      : 0,
    scheduledCount: eligible.length,
    completedCount: completed,
    weekHistory,
    week,
  };
}
export function habitCalendar(habit, completions, month, now = new Date()) {
  if (
    typeof month !== "string" ||
    !/^\d{4}-\d{2}$/.test(month) ||
    !validDate(month + "-01")
  )
    throw new Error("Invalid calendar month.");
  const today = dateInZone(habit.timeZone, now),
    done = new Set(completions);
  const days = [];
  for (
    let date = month + "-01";
    date.startsWith(month);
    date = shiftDate(date, 1)
  )
    days.push({
      date,
      scheduled: isScheduled(habit, date),
      completed: done.has(date),
      future: date > today,
    });
  return days;
}
export function goalProgress(goal) {
  return goal.milestones.length
    ? Math.round(
        (goal.milestones.reduce(
          (sum, m) => sum + Math.min(1, m.current / m.target),
          0,
        ) /
          goal.milestones.length) *
          100,
      )
    : goal.status === "completed"
      ? 100
      : 0;
}
