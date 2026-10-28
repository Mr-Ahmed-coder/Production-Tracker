import { useId } from "react";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { type Habit } from "./types";
import { dateLabel } from "./format";

export function HabitProgressChart({ habit }: { habit: Habit }) {
  const headingId = useId();
  const history = habit.weekHistory;
  return (
    <section className="habit-progress-chart" aria-labelledby={headingId}>
      <h3 id={headingId}>Weekly habit progress</h3>
      <p className="muted">
        Completed and scheduled days over eight weeks · {habit.timeZone}. Future
        and unscheduled days are excluded.
      </p>
      {history.some((w) => w.scheduled > 0) ? (
        <>
          <div
            className="habit-chart-canvas"
            aria-label={"Weekly completion chart for " + habit.title}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={history}
                margin={{ top: 18, right: 8, left: -20, bottom: 0 }}
                accessibilityLayer
              >
                <XAxis
                  dataKey="start"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#818b71", fontSize: 10 }}
                  tickFormatter={(v) =>
                    new Date(String(v) + "T12:00:00Z").toLocaleDateString(
                      undefined,
                      { month: "short", day: "numeric", timeZone: "UTC" },
                    )
                  }
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, 7]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#818b71", fontSize: 10 }}
                />
                <Tooltip
                  labelFormatter={(v) => "Week of " + dateLabel(String(v))}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e2e8d6",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                <Bar
                  dataKey="scheduled"
                  name="Scheduled through today"
                  fill="#dce3ce"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="completed"
                  name="Completed"
                  fill="#caed45"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="habit-chart-values">
            <summary>View weekly chart values</summary>
            <div className="chart-table-scroll">
              <table>
                <caption>{habit.title} · saved scheduled-day history</caption>
                <thead>
                  <tr>
                    <th scope="col">Week beginning</th>
                    <th scope="col">Completed</th>
                    <th scope="col">Scheduled</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((w) => (
                    <tr key={w.start}>
                      <th scope="row">{dateLabel(w.start)}</th>
                      <td>{w.completed}</td>
                      <td>{w.scheduled}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className="empty">No scheduled days in this eight-week window.</p>
      )}
    </section>
  );
}
