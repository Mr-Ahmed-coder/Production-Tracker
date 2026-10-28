import {
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import type { ActivityDay } from "./types";
export function ActivityChart({
  days,
  kind = "focus",
}: {
  days: ActivityDay[];
  kind?: "focus" | "tasks" | "habits";
}) {
  const series =
    kind === "focus"
      ? [["focusHours", "Focus hours", "#c3e73e"]]
      : kind === "tasks"
        ? [
            ["planned", "Tasks due", "#e2e5d8"],
            ["plannedCompleted", "Due tasks completed", "#c3e73e"],
            ["tasksCompleted", "Completed on date", "#576b43"],
          ]
        : [
            ["habitsScheduled", "Habits scheduled", "#e2e5d8"],
            ["habitsCompleted", "Habits completed", "#c3e73e"],
          ];
  return (
    <>
      <div className="activity-chart" aria-label={`${kind} by calendar date`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={days}
            margin={{ top: 12, right: 8, left: -20, bottom: 5 }}
          >
            <XAxis
              dataKey="date"
              tickFormatter={(v) => String(v).slice(5)}
              tick={{ fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={kind === "focus"}
              tick={{ fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid #e2e4da" }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map(([key, name, color]) => (
              <Bar
                key={key}
                dataKey={key}
                name={name}
                fill={color}
                radius={[5, 5, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-values">
        <summary>View {kind} chart values</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                {series.map(([k, n]) => (
                  <th key={k}>{n}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <th>{d.date}</th>
                  {series.map(([k]) => (
                    <td key={k}>{d[k as keyof ActivityDay]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
