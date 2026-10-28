import { dateLabel } from "./format";
import { Link } from "react-router-dom";
import { Target, Check, Sprout, NotebookPen } from "lucide-react";
import { CardHeading } from "../components/DashboardCards";
import { type Goal, type Habit, type Note } from "./types";
import { type RecordStore } from "./useRecords";

export function GoalsTimeline({
  goals,
  loading,
  error,
}: {
  goals: Goal[];
  loading: boolean;
  error: string;
}) {
  const visible = goals
    .filter((g) => !g.archived && g.status !== "completed")
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
    .slice(0, 3);
  const dates = visible.map((g) => g.targetDate);
  const now = new Date();
  const today =
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0");
  const min = Math.min(Date.parse(today), ...dates.map(Date.parse)),
    max = Math.max(min + 14 * 86400000, ...dates.map(Date.parse));
  const at = (v: number) => new Date(v).toISOString().slice(0, 10);
  return (
    <section className="card timeline-card">
      <CardHeading
        title="Your goals, in motion"
        to="/goals"
        detail="Your next saved milestones"
      />
      {loading ? (
        <p className="empty" role="status">
          Loading goals…
        </p>
      ) : error ? (
        <p className="empty">Goals could not load. Use Retry to reconnect.</p>
      ) : !visible.length ? (
        <p className="empty">
          Give your next chapter a direction.{" "}
          <Link className="text-link" to="/goals">
            Create a goal
          </Link>
        </p>
      ) : (
        <>
          <div className="timeline">
            <div className="timeline-grid" />
            {visible.map((g, i) => (
              <Link
                key={g.id}
                to="/goals"
                className={"timeline-goal goal-" + i}
              >
                <span className="goal-icon">
                  <Target size={17} />
                </span>
                <div>
                  <strong>{g.title}</strong>
                  <small>Target · {dateLabel(g.targetDate)}</small>
                </div>
                <span className="goal-progress">{g.progress}%</span>
              </Link>
            ))}
            <div
              className="today-line"
              style={{
                left:
                  Math.max(
                    0,
                    Math.min(
                      100,
                      ((Date.parse(today) - min) / (max - min)) * 100,
                    ),
                  ) + "%",
              }}
            >
              <span>Today</span>
            </div>
          </div>
          <div className="timeline-labels">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i}>
                {new Date(
                  at(min + ((max - min) * i) / 6) + "T12:00:00Z",
                ).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
export function HabitActivity({ store }: { store: RecordStore<Habit> }) {
  const habits = store.items.filter((h) => !h.archived).slice(0, 3);
  return (
    <section className="card habit-card">
      <CardHeading
        title="Little habits. Big changes."
        to="/habits"
        detail="Your saved completion history"
      />
      {store.loading ? (
        <p role="status" className="empty">
          Loading habits…
        </p>
      ) : store.error ? (
        <p className="empty">Habits could not load. Use Retry to reconnect.</p>
      ) : !habits.length ? (
        <p className="empty">
          Choose a small habit and start showing up.{" "}
          <Link className="text-link" to="/habits">
            Create a habit
          </Link>
        </p>
      ) : (
        <>
          <div className="habit-days">
            <span>This week · each habit's timezone</span>
            <div>
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
          </div>
          {habits.map((h) => (
            <div className="habit-row" key={h.id}>
              <div className="habit-symbol">
                <Sprout size={18} />
              </div>
              <div className="habit-copy">
                <strong>{h.title}</strong>
                <small>
                  {h.currentStreak} scheduled-day streak · {h.consistency}%
                </small>
              </div>
              <div className="habit-checks real-checks">
                {h.week.map((d) => (
                  <button
                    key={d.date}
                    className={d.completed ? "checked" : ""}
                    disabled={store.busy || d.future || !d.scheduled}
                    aria-label={
                      h.title +
                      ", " +
                      d.date +
                      ", " +
                      (d.completed
                        ? "Completed"
                        : d.future
                          ? "Upcoming"
                          : !d.scheduled
                            ? "Not scheduled"
                            : "Incomplete")
                    }
                    aria-pressed={d.completed}
                    onClick={() =>
                      void store
                        .action(
                          "/" + h.id + "/completions/" + d.date,
                          d.completed ? "DELETE" : "PUT",
                        )
                        .catch(() => {})
                    }
                  >
                    {d.completed ? <Check size={11} /> : <span>·</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
      <p className="habit-footer">
        <span className="lime-dot" /> Every scheduled day is another chance to
        begin.
      </p>
    </section>
  );
}
export function RecentNotes({ store }: { store: RecordStore<Note> }) {
  const recent = [...store.items]
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
    .slice(0, 3);
  return (
    <section className="card recent-notes">
      <CardHeading
        title="A few thoughts to come back to"
        to="/notes"
        detail="Pinned and recently updated notes"
      />
      {store.loading ? (
        <p className="empty" role="status">
          Loading notes…
        </p>
      ) : store.error ? (
        <p className="empty">Notes could not load. Use Retry to reconnect.</p>
      ) : !recent.length ? (
        <p className="empty">
          A clear page for your next idea.{" "}
          <Link to="/notes" className="text-link">
            Write a note
          </Link>
        </p>
      ) : (
        <div className="recent-notes-grid">
          {recent.map((n) => (
            <Link to="/notes" className="recent-note" key={n.id}>
              <NotebookPen size={17} />
              <strong>{n.title}</strong>
              <p>{n.content.slice(0, 140) || "No content yet."}</p>
              <small>
                {n.journalDate ? "Journal · " + n.journalDate : n.category}
                {n.pinned ? " · Pinned" : ""}
              </small>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
