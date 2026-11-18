import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, messageOf } from "../lib/api";
import { localDate, type Task } from "../data/demo";
import { shiftDate } from "../productivity/format";
import { TaskDeleteDialog, TaskDialog } from "../components/TaskDialog";
import { CardHeading } from "../components/DashboardCards";

type CalendarTask = Task & { overdue: boolean; completedAt: string | null };
type Day = {
  date: string;
  tasks: CalendarTask[];
  deadlines: CalendarTask[];
  habits: {
    id: string;
    title: string;
    timeZone: string;
    completed: boolean;
    future: boolean;
    editable: boolean;
  }[];
  goals: {
    id: string;
    title: string;
    goalTitle?: string;
    kind: "goal" | "milestone";
    progress: number;
    completed: boolean;
  }[];
  focusMs: number;
};
type Data = {
  from: string;
  to: string;
  today: string;
  timeZone: string;
  days: Day[];
};
type Mode = "month" | "week";
const clock = (day: string) => new Date(day + "T12:00:00Z");
const weekday = (day: string) => (clock(day).getUTCDay() + 6) % 7;
const label = (day: string, options: Intl.DateTimeFormatOptions) =>
  clock(day).toLocaleDateString(undefined, { ...options, timeZone: "UTC" });
const fullDate = (day: string) =>
  label(day, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
function counts(day?: Day) {
  const tasks = day?.tasks.length ?? 0,
    done = day?.tasks.filter((t) => t.completed).length ?? 0;
  const habits = day?.habits.filter((h) => !h.future) ?? [];
  return {
    tasks,
    done,
    habits: habits.length,
    habitDone: habits.filter((h) => h.completed).length,
  };
}
function movePeriod(day: string, mode: Mode, step: number) {
  if (mode === "week") return shiftDate(day, 7 * step);
  const dt = clock(day.slice(0, 7) + "-01");
  dt.setUTCMonth(dt.getUTCMonth() + step);
  return dt.toISOString().slice(0, 10);
}
function duration(ms: number) {
  if (ms === 0) return "0 min";
  if (ms < 60000) return "<1 min";
  const minutes = Math.floor(ms / 60000);
  return minutes < 60
    ? minutes + " min"
    : Math.floor(minutes / 60) + " h " + (minutes % 60) + " min";
}
export function CalendarPage({ revision }: { revision: number }) {
  const [mode, setMode] = useState<Mode>("month"),
    [selection, setSelection] = useState(""),
    [panel, setPanel] = useState(false),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [mutationError, setMutationError] = useState(""),
    [notice, setNotice] = useState(""),
    [deleting, setDeleting] = useState<Task | null>(null),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<{ date: string; task?: Task } | null>(null);
  const dataRef = useRef<Data | null>(null),
    mounted = useRef(true),
    requestVersion = useRef(0),
    panelRef = useRef<HTMLElement>(null),
    saving = useRef(false),
    dateButtons = useRef(new Map<string, HTMLButtonElement>()),
    focusDate = useRef("");
  dataRef.current = data;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  const today = data?.today ?? localDate(),
    selected = selection || today;
  const anchor = mode === "month" ? selected.slice(0, 7) + "-01" : selected;
  const from = shiftDate(anchor, -weekday(anchor)),
    to = shiftDate(from, mode === "month" ? 41 : 6);
  const ready = data?.from === from && data.to === to;
  const days = new Map(ready ? data.days.map((d) => [d.date, d]) : []);
  const dates = Array.from({ length: mode === "month" ? 42 : 7 }, (_, i) =>
    shiftDate(from, i),
  );
  const day = days.get(selected),
    totals = counts(day);
  const total = totals.tasks + totals.habits,
    finished = totals.done + totals.habitDone;
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      if (saving.current) return;
      const version = ++requestVersion.current;
      void api<Data>("/calendar?from=" + from + "&to=" + to, {
        signal: controller.signal,
      })
        .then((value) => {
          if (
            !controller.signal.aborted &&
            version === requestVersion.current &&
            !saving.current
          ) {
            setData(value);
            setError("");
          }
        })
        .catch((e) => {
          if (
            !controller.signal.aborted &&
            version === requestVersion.current &&
            !saving.current
          )
            setError(messageOf(e));
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [from, to, reload, revision]);
  useEffect(() => {
    if (focusDate.current === selected) {
      dateButtons.current.get(selected)?.focus();
      focusDate.current = "";
    }
  }, [selected]);
  function select(date: string, open = false) {
    setSelection(date);
    setMutationError("");
    if (open) {
      setPanel(true);
      window.requestAnimationFrame(() => {
        if (window.matchMedia("(max-width: 680px)").matches)
          panelRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      });
    }
  }
  function navigate(date: string) {
    setError("");
    select(date);
  }
  function arrow(e: KeyboardEvent<HTMLButtonElement>, date: string) {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -weekday(date),
      End: 6 - weekday(date),
    };
    const delta = step[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const next = shiftDate(date, delta);
    if (next === selected) return;
    focusDate.current = next;
    navigate(next);
  }
  async function mutate(
    path: string,
    method: string,
    body?: unknown,
    optimistic?: (current: Data) => Data,
  ) {
    if (saving.current) throw new Error("Please wait for the current change.");
    const previous = dataRef.current;
    saving.current = true;
    requestVersion.current++;
    setBusy(true);
    setMutationError("");
    setNotice("");
    if (optimistic)
      setData((current) => (current ? optimistic(current) : current));
    try {
      await api(path, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (mounted.current)
        setNotice(
          method === "DELETE" && path.startsWith("/tasks/")
            ? "Task deleted."
            : "Progress saved.",
        );
    } catch (e) {
      if (mounted.current) {
        setData((current) =>
          current?.from === previous?.from && current?.to === previous?.to
            ? previous
            : current,
        );
        setMutationError(messageOf(e));
      }
      throw e;
    } finally {
      saving.current = false;
      if (mounted.current) {
        setBusy(false);
        setReload((i) => i + 1);
      }
    }
  }
  function toggleTask(task: CalendarTask, checked: boolean) {
    void mutate(
      "/tasks/" + task.id,
      "PATCH",
      { completed: checked },
      (current) => ({
        ...current,
        days: current.days.map((d) => ({
          ...d,
          tasks: d.tasks.map((t) =>
            t.id === task.id ? { ...t, completed: checked } : t,
          ),
          deadlines: d.deadlines.map((t) =>
            t.id === task.id ? { ...t, completed: checked } : t,
          ),
        })),
      }),
    ).catch(() => {});
  }
  function toggleHabit(
    habit: Day["habits"][number],
    date: string,
    checked: boolean,
  ) {
    void mutate(
      "/habits/" + habit.id + "/completions/" + date,
      checked ? "PUT" : "DELETE",
      undefined,
      (current) => ({
        ...current,
        days: current.days.map((d) =>
          d.date === date
            ? {
                ...d,
                habits: d.habits.map((h) =>
                  h.id === habit.id ? { ...h, completed: checked } : h,
                ),
              }
            : d,
        ),
      }),
    ).catch(() => {});
  }
  const visible = ready
    ? data.days.filter(
        (d) => mode === "week" || d.date.slice(0, 7) === selected.slice(0, 7),
      )
    : [];
  const period = visible.reduce(
    (acc, d) => {
      const c = counts(d);
      return {
        tasks: acc.tasks + c.tasks,
        done: acc.done + c.done,
        habits: acc.habits + c.habits,
        habitDone: acc.habitDone + c.habitDone,
        focus: acc.focus + d.focusMs,
      };
    },
    { tasks: 0, done: 0, habits: 0, habitDone: 0, focus: 0 },
  );
  function taskRow(t: CalendarTask) {
    return (
      <li
        className={"calendar-activity" + (t.completed ? " is-completed" : "")}
        key={t.id}
      >
        <label>
          <input
            type="checkbox"
            checked={t.completed}
            disabled={busy || Boolean(error)}
            onChange={(e) => toggleTask(t, e.target.checked)}
          />
          <span>
            <strong>{t.title}</strong>
            <small>
              {t.priority} priority · Due {t.dueDate}
              {t.scheduledDate && t.scheduledDate !== t.dueDate
                ? " · Planned " + t.scheduledDate
                : ""}
            </small>
          </span>
        </label>
        <div className="calendar-task-actions">
          <button
            className="icon-button"
            aria-label={"Edit " + t.title}
            disabled={busy}
            onClick={() => setEditor({ task: t, date: selected })}
          >
            <Pencil size={15} />
          </button>
          <button
            className="icon-button"
            aria-label={"Delete " + t.title}
            disabled={busy}
            onClick={() => setDeleting(t)}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </li>
    );
  }
  return (
    <div className="calendar-module">
      <section
        className="card calendar-main"
        aria-label="Productivity calendar"
      >
        <CardHeading
          title="Make a little time"
          detail={
            data
              ? "Calendar timezone: " + data.timeZone
              : "Plan tasks and review your daily activity."
          }
        />
        <div className="calendar-toolbar">
          <div className="calendar-controls">
            <button
              className="icon-button"
              aria-label={"Previous " + mode}
              onClick={() => navigate(movePeriod(selected, mode, -1))}
            >
              <ChevronLeft size={18} />
            </button>
            <h3 aria-live="polite">
              {mode === "month"
                ? label(selected, { month: "long", year: "numeric" })
                : label(from, { month: "short", day: "numeric" }) +
                  " – " +
                  label(to, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
            </h3>
            <button
              className="icon-button"
              aria-label={"Next " + mode}
              onClick={() => navigate(movePeriod(selected, mode, 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="calendar-controls" aria-label="Calendar views">
            <button
              className="secondary-button"
              onClick={() => {
                navigate(today);
                setPanel(true);
              }}
            >
              Today
            </button>
            <button
              className="secondary-button"
              aria-pressed={mode === "month"}
              onClick={() => {
                setError("");
                setMode("month");
              }}
            >
              Month
            </button>
            <button
              className="secondary-button"
              aria-pressed={mode === "week"}
              onClick={() => {
                setError("");
                setMode("week");
              }}
            >
              Week
            </button>
          </div>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}{" "}
            <button
              className="secondary-button"
              onClick={() => {
                setError("");
                setReload((n) => n + 1);
              }}
            >
              Retry
            </button>
          </div>
        )}
        {!ready && !error && (
          <p className="muted" role="status">
            Loading calendar activity…
          </p>
        )}
        {mutationError && (
          <p className="error-banner" role="alert">
            {mutationError}
          </p>
        )}
        <p className="calendar-feedback" role="status" aria-live="polite">
          {busy
            ? "Saving activity…"
            : notice || "A little progress, one checkbox at a time."}
        </p>
        {mode === "month" && (
          <p className="calendar-mobile-hint">
            Swipe across the month, or choose Week for a full-width checklist.
          </p>
        )}
        <div className="calendar-grid-scroll">
          <div
            className={
              "calendar-grid " + (mode === "week" ? "calendar-week" : "")
            }
            role="group"
            aria-label="Dates. Use arrow keys to move between dates."
          >
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span className="calendar-weekday" key={d}>
                {d}
              </span>
            ))}
            {dates.map((date) => {
              const item = days.get(date);
              const activities = [
                ...(item?.tasks ?? []).map((t) => ({
                  kind: "task" as const,
                  record: t,
                })),
                ...(item?.habits ?? []).map((h) => ({
                  kind: "habit" as const,
                  record: h,
                })),
              ];
              const limit = mode === "month" ? 3 : 6;
              const remaining = activities.length - limit;
              return (
                <article
                  key={date}
                  role="group"
                  aria-label={fullDate(date)}
                  className={
                    "calendar-cell" +
                    (mode === "month" &&
                    date.slice(0, 7) !== selected.slice(0, 7)
                      ? " outside"
                      : "")
                  }
                  data-selected={selected === date}
                  data-today={date === today}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) select(date, true);
                  }}
                >
                  <button
                    ref={(node) => {
                      if (node) dateButtons.current.set(date, node);
                      else dateButtons.current.delete(date);
                    }}
                    type="button"
                    className="calendar-date-button"
                    tabIndex={selected === date ? 0 : -1}
                    aria-current={date === today ? "date" : undefined}
                    aria-pressed={selected === date}
                    aria-controls={panel ? "calendar-day-panel" : undefined}
                    aria-expanded={panel && selected === date}
                    aria-label={"Open " + fullDate(date)}
                    onKeyDown={(e) => arrow(e, date)}
                    onClick={() => select(date, true)}
                  >
                    <span className="calendar-cell-date">
                      {date.slice(-2).replace(/^0/, "")}
                    </span>
                    <span className="calendar-day-name">
                      {label(date, { weekday: "short" })}
                    </span>
                  </button>
                  <div className="calendar-cell-activities">
                    {activities.slice(0, limit).map((activity) => {
                      const record = activity.record;
                      return (
                        <label
                          key={activity.kind + record.id}
                          className={
                            "calendar-inline-activity" +
                            (record.completed ? " is-completed" : "")
                          }
                        >
                          <input
                            type="checkbox"
                            checked={record.completed}
                            aria-label={
                              (activity.kind === "habit"
                                ? "Habit: "
                                : "Task: ") +
                              record.title +
                              ", " +
                              fullDate(date)
                            }
                            disabled={
                              busy ||
                              Boolean(error) ||
                              (activity.kind === "habit" &&
                                !activity.record.editable)
                            }
                            onChange={(e) =>
                              activity.kind === "task"
                                ? toggleTask(activity.record, e.target.checked)
                                : toggleHabit(
                                    activity.record,
                                    date,
                                    e.target.checked,
                                  )
                            }
                          />
                          <span title={record.title}>{record.title}</span>
                        </label>
                      );
                    })}
                  </div>
                  {remaining > 0 && (
                    <button
                      type="button"
                      className="calendar-more"
                      aria-label={
                        "Show " +
                        remaining +
                        " more activities on " +
                        fullDate(date)
                      }
                      onClick={() => select(date, true)}
                    >
                      + {remaining} more
                    </button>
                  )}
                  <button
                    type="button"
                    className="calendar-add"
                    disabled={busy || !ready || Boolean(error)}
                    aria-label={"Add activity on " + fullDate(date)}
                    onClick={() => {
                      select(date);
                      setEditor({ date });
                    }}
                  >
                    <Plus size={12} />
                    <span>Add activity</span>
                  </button>
                </article>
              );
            })}
          </div>
        </div>
        {ready && (
          <div className="calendar-period">
            <h3>{mode === "month" ? "Monthly" : "Weekly"} progress</h3>
            <div className="calendar-period-stats">
              <span>
                <strong>
                  {period.done}/{period.tasks}
                </strong>{" "}
                tasks finished
              </span>
              <span>
                <strong>
                  {period.habitDone}/{period.habits}
                </strong>{" "}
                elapsed habits
              </span>
              <span>
                <strong>{duration(period.focus)}</strong> focus
              </span>
            </div>
            <details>
              <summary>Daily completion trend</summary>
              <div className="calendar-table">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Day</th>
                      <th scope="col">Tasks</th>
                      <th scope="col">Habits</th>
                      <th scope="col">Focus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((d) => {
                      const c = counts(d);
                      return (
                        <tr key={d.date}>
                          <th scope="row">
                            {label(d.date, { month: "short", day: "numeric" })}
                          </th>
                          <td>{c.tasks ? c.done + "/" + c.tasks : "—"}</td>
                          <td>
                            {c.habits ? c.habitDone + "/" + c.habits : "—"}
                          </td>
                          <td>{d.focusMs ? duration(d.focusMs) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </section>
      {panel && (
        <aside
          ref={panelRef}
          className="card calendar-panel"
          id="calendar-day-panel"
          aria-label="Daily activity"
        >
          <div className="calendar-panel-heading">
            <span className="eyebrow">
              <CalendarDays size={14} /> DAILY CHECKLIST
            </span>
            <button
              className="icon-button"
              aria-label="Close daily activity"
              onClick={() => {
                setPanel(false);
                dateButtons.current.get(selected)?.focus();
              }}
            >
              <X size={16} />
            </button>
          </div>
          <h2 aria-live="polite">{fullDate(selected)}</h2>
          <div className="calendar-controls calendar-panel-controls">
            <button
              className="icon-button"
              aria-label="Previous day"
              onClick={() => navigate(shiftDate(selected, -1))}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Next day"
              onClick={() => navigate(shiftDate(selected, 1))}
            >
              <ChevronRight size={16} />
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => setEditor({ date: selected })}
            >
              <Plus size={16} /> Add task for this day
            </button>
          </div>
          {!day ? (
            <p className="muted">
              {error ? "Activity is unavailable." : "Loading daily activity…"}
            </p>
          ) : (
            <>
              <div className="calendar-progress">
                <strong>
                  {total
                    ? finished === total
                      ? "Everything checked off. Nicely done!"
                      : finished + " of " + total + " complete"
                    : "A little room to begin"}
                </strong>
                {total > 0 && (
                  <>
                    <progress
                      aria-label="Daily checklist progress"
                      value={finished}
                      max={total}
                    />
                    <small>{total - finished} remaining</small>
                  </>
                )}
                <span>
                  <Clock3 size={14} /> {duration(day.focusMs)} of focus
                </span>
              </div>
              <h3>Planned tasks</h3>
              {day.tasks.length ? (
                <ul>{day.tasks.map(taskRow)}</ul>
              ) : (
                <p className="muted">No tasks planned.</p>
              )}
              <h3>Scheduled habits</h3>
              {day.habits.length ? (
                <ul>
                  {day.habits.map((h) => (
                    <li
                      className={
                        "calendar-activity" +
                        (h.completed ? " is-completed" : "")
                      }
                      key={h.id}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={h.completed}
                          disabled={busy || !h.editable}
                          onChange={(e) =>
                            toggleHabit(h, selected, e.target.checked)
                          }
                        />
                        <span>
                          <strong>{h.title}</strong>
                          <small>
                            {h.future
                              ? "Upcoming · "
                              : !h.editable
                                ? "Archived · "
                                : ""}
                            {h.timeZone}
                          </small>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No habits scheduled.</p>
              )}
              <h3>Deadlines & milestones</h3>
              {day.deadlines.length + day.goals.length > 0 ? (
                <ul>
                  {day.deadlines.map(taskRow)}
                  {day.goals.map((g) => (
                    <li className="calendar-activity" key={g.id}>
                      <Link className="text-link" to="/goals">
                        {g.title}
                      </Link>
                      <small>
                        {g.goalTitle ? g.goalTitle + " · " : "Goal · "}
                        {g.progress}%
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  No separate deadlines or goal milestones.
                </p>
              )}
            </>
          )}
        </aside>
      )}
      {deleting && (
        <TaskDeleteDialog
          task={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            mutate("/tasks/" + deleting.id, "DELETE", undefined, (current) => ({
              ...current,
              days: current.days.map((d) => ({
                ...d,
                tasks: d.tasks.filter((t) => t.id !== deleting.id),
                deadlines: d.deadlines.filter((t) => t.id !== deleting.id),
              })),
            }))
          }
        />
      )}
      {editor && (
        <TaskDialog
          task={editor.task}
          defaultDate={editor.task ? undefined : editor.date}
          onClose={() => setEditor(null)}
          onSave={(body) =>
            mutate(
              editor.task ? "/tasks/" + editor.task.id : "/tasks",
              editor.task ? "PATCH" : "POST",
              body,
            )
          }
        />
      )}
    </div>
  );
}
