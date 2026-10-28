import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  Folder,
  SlidersHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { type Task } from "../data/demo";
import { ActivityChart } from "../productivity/ActivityChart";
import type { Analytics } from "../productivity/types";
import { hours, shiftDate } from "../productivity/format";
import { PaginationBar } from "./PaginationBar";
export function CardHeading({
  title,
  to,
  detail,
}: {
  title: string;
  to?: string;
  detail?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {detail && <p className="muted card-detail">{detail}</p>}
      </div>
      {to && (
        <Link className="round-link" to={to} aria-label={`View ${title}`}>
          <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function FocusChart({
  data,
  unavailable = false,
}: {
  data: Analytics | null;
  unavailable?: boolean;
}) {
  const today = data?.today;
  const monday = today
    ? shiftDate(today, -((new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7))
    : "";
  const days = data?.days.filter((d) => d.date >= monday) || [];
  return (
    <section className="card focus-card">
      <div className="section-heading">
        <div>
          <span className="big-number">
            {unavailable
              ? "—"
              : hours(days.reduce((sum, d) => sum + d.focusMs, 0))}
            <span>h</span>
          </span>
          <p className="muted">
            Focused this week · {data?.timeZone || "loading timezone"}
          </p>
        </div>
        <Link
          className="round-link"
          to="/analytics"
          aria-label="View focus analytics"
        >
          <SlidersHorizontal size={15} />
        </Link>
      </div>
      {unavailable ? (
        <p className="empty">
          Focus activity is unavailable. Use Retry activity above.
        </p>
      ) : (
        <ActivityChart days={days} />
      )}
      <div className="chart-footer">
        <span>
          <i className="lime-dot" /> Saved focused time
        </span>
        <Link className="text-link" to="/review">
          Daily review <ArrowUpRight size={14} />
        </Link>
      </div>
      {!unavailable && data && (
        <p className="muted">
          Today: {hours(data.days.at(-1)?.focusMs || 0)}h ·{" "}
          {data.days.at(-1)?.targetPercent || 0}% of {data.dailyTargetMinutes}m
          target
        </p>
      )}
    </section>
  );
}
export function TaskList({
  tasks,
  toggle,
  full = false,
  busy = false,
  loading = false,
  unavailable = false,
  edit,
  remove,
}: {
  tasks: Task[];
  toggle: (id: string) => void;
  full?: boolean;
  busy?: boolean;
  loading?: boolean;
  unavailable?: boolean;
  edit?: (task: Task) => void;
  remove?: (task: Task) => void;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.ceil(tasks.length / pageSize) || 1;
  const currentPage = Math.min(page, totalPages);
  const displayedTasks = full
    ? tasks.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : tasks;

  return (
    <section className="card tasks-card">
      <CardHeading
        title={full ? "Your tasks" : "Today's tasks"}
        to={full ? undefined : "/tasks"}
        detail={
          loading
            ? "Loading your tasks…"
            : unavailable
              ? "Tasks could not be loaded."
              : `${tasks.filter((t) => t.completed).length} of ${tasks.length} completed · one step at a time`
        }
      />
      <div className="task-list">
        {loading ? (
          <p className="empty" role="status">
            Fetching your saved tasks…
          </p>
        ) : unavailable ? (
          <p className="empty">Use Retry above to load your tasks.</p>
        ) : tasks.length === 0 ? (
          <p className="empty">
            A little breathing room. Add a task to get started.
          </p>
        ) : (
          displayedTasks.map((t) => (
            <div
              className={`task-row ${t.completed ? "is-complete" : ""}`}
              key={t.id}
            >
              <input
                type="checkbox"
                checked={t.completed}
                disabled={busy}
                onChange={() => toggle(t.id)}
                aria-label={`Complete ${t.title}`}
              />
              <div className="task-copy">
                <strong>{t.title}</strong>
                <div>
                  <span>
                    <Folder size={11} />
                    {t.category}
                  </span>
                  <span className={t.completed ? "status done" : "status"}>
                    {t.completed ? (
                      <Check size={10} />
                    ) : (
                      <span className="status-dot" />
                    )}
                    {t.completed ? "Completed" : "To do"}
                  </span>
                  {full && <span>{t.dueDate}</span>}
                </div>
              </div>
              <span className={`priority ${t.priority.toLowerCase()}`}>
                ● {t.priority}
              </span>
              <div className="task-row-actions">
                {edit && (
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Edit ${t.title}`}
                    onClick={() => edit(t)}
                  >
                    <Pencil size={13} />
                  </button>
                )}
                {remove && (
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Delete ${t.title}`}
                    onClick={() => remove(t)}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      {full && (
        <PaginationBar
          page={currentPage}
          totalPages={totalPages}
          totalItems={tasks.length}
          itemName="tasks"
          onPageChange={setPage}
        />
      )}
    </section>
  );
}
