import { useState, useEffect } from "react";
import { api, messageOf } from "../lib/api";
import type { Analytics } from "./types";
import type { ProductivityStore } from "./useProductivity";
import { ActivityChart } from "./ActivityChart";
import { hours } from "./format";
export function AnalyticsPage({ store }: { store: ProductivityStore }) {
  const [range, setRange] = useState("30"),
    [end, setEnd] = useState(""),
    [data, setData] = useState<Analytics | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const to = end || store.data?.today;
    if (!to) {
      setLoading(false);
      return;
    }
    const d = new Date(to + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - Number(range) + 1);
    void api<Analytics>(
      `/productivity/analytics?from=${d.toISOString().slice(0, 10)}&to=${to}`,
      { signal: controller.signal },
    )
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(messageOf(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range, end, store.data]);
  const days = data?.days || [],
    focus = days.reduce((s, d) => s + d.focusMs, 0),
    planned = days.reduce((s, d) => s + d.planned, 0),
    completed = days.reduce((s, d) => s + d.plannedCompleted, 0),
    scheduled = days.reduce((s, d) => s + d.habitsScheduled, 0),
    habitsDone = days.reduce((s, d) => s + d.habitsCompleted, 0);
  return (
    <>
      <section className="card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR ACTIVITY, CLEARLY</span>
            <h2>Productivity analytics</h2>
          </div>
        </div>
        <div className="record-filters">
          <label>
            Range
            <select value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </label>
          <label>
            Ending on
            <input
              type="date"
              max={store.data?.today}
              value={end || store.data?.today || ""}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        {loading && <p role="status">Loading saved activity…</p>}
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && data && (
          <>
            <div className="activity-stats">
              <div>
                <strong>{hours(focus)}h</strong>
                <span>Focused time</span>
              </div>
              <div>
                <strong>
                  {completed}/{planned}
                </strong>
                <span>Due tasks completed</span>
              </div>
              <div>
                <strong>
                  {scheduled
                    ? Math.round((habitsDone / scheduled) * 100) + "%"
                    : "—"}
                </strong>
                <span>
                  Habit consistency · {habitsDone}/{scheduled}
                </span>
              </div>
              <div>
                <strong>
                  {days.filter((d) => d.targetPercent >= 100).length}
                </strong>
                <span>Days meeting current focus target</span>
              </div>
            </div>
            <h3>Time spent focusing</h3>
            <ActivityChart days={days} />
            <h3>Tasks completed versus planned</h3>
            <ActivityChart days={days} kind="tasks" />
            <h3>Habit consistency</h3>
            <ActivityChart days={days} kind="habits" />
            <h3>Weekly totals</h3>
            <WeeklyTotals days={days} />
            <h3>Goals & milestones · current state</h3>
            {data.goals.length ? (
              data.goals.map((g) => (
                <div className="setting-row" key={g.id}>
                  <div>
                    <strong>{g.title}</strong>
                    <p>
                      {g.status}
                      {g.archived ? " · archived" : ""} ·{" "}
                      {g.milestonesCompleted}/{g.milestonesTotal} milestones
                    </p>
                  </div>
                  <strong>{g.progress}%</strong>
                </div>
              ))
            ) : (
              <p className="empty">No saved goals yet.</p>
            )}
            <p className="muted">
              Timezone: {data.timeZone}. Task planning uses current due dates;
              deleting or reopening tasks updates these figures. “Completed on
              date” uses recorded completion timestamps.{" "}
              {data.legacyCompletedTasks} older completed tasks have no known
              completion date and are excluded from completion-date trends.
              Habits use each habit’s saved timezone and scheduled calendar
              dates. Focus targets use your current setting, including past
              dates.
            </p>
          </>
        )}
      </section>
    </>
  );
}
function WeeklyTotals({ days }: { days: Analytics["days"] }) {
  const weeks = new Map<
    string,
    { focus: number; tasks: number; habits: number; scheduled: number }
  >();
  for (const d of days) {
    const day = new Date(d.date + "T12:00:00Z");
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    const key = day.toISOString().slice(0, 10);
    const value = weeks.get(key) || {
      focus: 0,
      tasks: 0,
      habits: 0,
      scheduled: 0,
    };
    value.focus += d.focusMs;
    value.tasks += d.tasksCompleted;
    value.habits += d.habitsCompleted;
    value.scheduled += d.habitsScheduled;
    weeks.set(key, value);
  }
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Week starting</th>
            <th>Focus hours</th>
            <th>Tasks completed</th>
            <th>Habits done/scheduled</th>
          </tr>
        </thead>
        <tbody>
          {[...weeks].map(([date, w]) => (
            <tr key={date}>
              <td>{date}</td>
              <td>{hours(w.focus)}</td>
              <td>{w.tasks}</td>
              <td>
                {w.habits}/{w.scheduled}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Monday-based weeks, restricted to the selected dates.
      </p>
    </div>
  );
}
