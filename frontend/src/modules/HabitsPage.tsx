import { dateLabel } from "./format";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Sprout, Check } from "lucide-react";
import { api, messageOf } from "../lib/api";
import { localDate } from "../data/demo";
import { type Habit, type Day } from "./types";
import { type RecordStore } from "./useRecords";
import { Modal, StoreStatus, Actions, Empty } from "./Shared";
import { HabitProgressChart } from "./HabitProgressChart";
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function HabitsPage({ store }: { store: RecordStore<Habit> }) {
  const [editing, setEditing] = useState<Habit | null | undefined>(),
    [archived, setArchived] = useState(false);
  const visible = store.items.filter((h) => h.archived === archived);
  return (
    <>
      <div className="module-toolbar">
        <p className="muted">Consistency on your schedule, in your timezone.</p>
        <button
          className="primary-button"
          disabled={store.loading || store.busy}
          onClick={() => setEditing(null)}
        >
          <Plus size={16} /> New habit
        </button>
      </div>
      <StoreStatus store={store} />
      <div className="module-filters">
        <label>
          Show habits
          <select
            value={String(archived)}
            onChange={(e) => setArchived(e.target.value === "true")}
          >
            <option value="false">Active habits</option>
            <option value="true">Archived habits</option>
          </select>
        </label>
      </div>
      <div className="habit-records">
        {visible.map((h) => (
          <section className="card habit-record" key={h.id}>
            <div className="section-heading">
              <div>
                <Sprout size={22} />
                <h2>{h.title}</h2>
                <p className="muted">
                  {h.category} · {h.timeZone} · Today: {dateLabel(h.today)}
                </p>
              </div>
              <button
                className="secondary-button"
                disabled={store.busy}
                onClick={() =>
                  void store
                    .save({ archived: !h.archived }, h.id)
                    .catch(() => {})
                }
              >
                {h.archived ? "Restore habit" : "Archive habit"}
              </button>
            </div>
            <div className="habit-statistics">
              <span>
                <strong>{h.currentStreak}</strong> Current streak
              </span>
              <span>
                <strong>{h.longestStreak}</strong> Longest streak
              </span>
              <span>
                <strong>{h.consistency}%</strong> Consistency
              </span>
              <span>
                <strong>
                  {h.completedCount}/{h.scheduledCount}
                </strong>{" "}
                Scheduled days done
              </span>
            </div>
            <p className="muted">
              Streaks count scheduled days. Today stays pending until completed;
              future and unscheduled days never break a streak.
            </p>
            <div className="week-overview">
              {h.week.map((d) => (
                <HabitDay
                  key={d.date}
                  day={d}
                  habit={h}
                  busy={store.busy}
                  onToggle={() =>
                    void store
                      .action(
                        "/" + h.id + "/completions/" + d.date,
                        d.completed ? "DELETE" : "PUT",
                      )
                      .catch(() => {})
                  }
                />
              ))}
            </div>
            <HabitProgressChart habit={h} />
            <HabitCalendar
              habit={h}
              busy={store.busy}
              onToggle={(d) =>
                store.action(
                  "/" + h.id + "/completions/" + d.date,
                  d.completed ? "DELETE" : "PUT",
                )
              }
            />
            <p className="muted history-summary">
              Completion history:{" "}
              {h.completions.length
                ? h.completions.slice(-10).reverse().map(dateLabel).join(" · ")
                : "No completed days yet."}
            </p>
            <Actions
              title={h.title}
              busy={store.busy}
              edit={() => setEditing(h)}
            />
          </section>
        ))}
      </div>
      {!store.loading && !store.error && !visible.length && (
        <Empty>
          {archived
            ? "Archived habits will appear here."
            : "Create a daily habit or choose the weekdays that fit your life."}
        </Empty>
      )}
      {editing !== undefined && (
        <HabitEditor
          habit={editing}
          onClose={() => setEditing(undefined)}
          onSave={(body) => store.save(body, editing?.id)}
        />
      )}
    </>
  );
}
function HabitDay({
  day: d,
  habit: h,
  busy,
  onToggle,
}: {
  day: Day;
  habit: Habit;
  busy: boolean;
  onToggle: () => void;
}) {
  const state = d.completed
    ? "Completed"
    : !d.scheduled
      ? "Not scheduled"
      : d.future
        ? "Upcoming"
        : d.date === h.today
          ? "Pending"
          : "Incomplete";
  return (
    <button
      className={
        "habit-day " +
        (d.completed ? "day-complete" : "") +
        (d.date === h.today ? " day-today" : "")
      }
      disabled={busy || h.archived || d.future || !d.scheduled}
      aria-label={h.title + ", " + d.date + ", " + state}
      aria-pressed={d.completed}
      onClick={onToggle}
    >
      <span>{dayNames[new Date(d.date + "T12:00:00Z").getUTCDay()]}</span>
      <strong>{Number(d.date.slice(8))}</strong>
      <small>{d.completed ? <Check size={13} /> : state}</small>
    </button>
  );
}
function HabitCalendar({
  habit,
  busy,
  onToggle,
}: {
  habit: Habit;
  busy: boolean;
  onToggle: (day: Day) => Promise<void>;
}) {
  const [month, setMonth] = useState(habit.today.slice(0, 7)),
    [days, setDays] = useState<Day[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<{ days: Day[] }>(
      "/habits/" + habit.id + "/calendar?month=" + encodeURIComponent(month),
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setDays(data.days);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(messageOf(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [habit, month, retry]);
  const blanks = (new Date(month + "-01T12:00:00Z").getUTCDay() + 6) % 7;
  return (
    <div className="habit-calendar">
      <div className="section-heading">
        <h3>Completion calendar</h3>
        <label>
          Calendar month
          <input
            type="month"
            required
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
        </label>
      </div>
      {loading ? (
        <p role="status" className="muted">
          Loading calendar…
        </p>
      ) : error ? (
        <p className="error-banner" role="alert">
          {error}{" "}
          <button
            className="secondary-button"
            onClick={() => setRetry((v) => v + 1)}
          >
            Retry calendar
          </button>
        </p>
      ) : (
        <div className="calendar-grid">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span key={d} className="calendar-day-name">
              {d}
            </span>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <span key={"blank" + i} />
          ))}
          {days.map((d) => (
            <HabitDay
              key={d.date}
              day={d}
              habit={habit}
              busy={busy}
              onToggle={() => {
                void onToggle(d).catch((e) => setError(messageOf(e)));
              }}
            />
          ))}
        </div>
      )}
      <p className="muted">
        Lime = completed · Upcoming days are read-only · Archived days are not
        missed days.
      </p>
    </div>
  );
}
function HabitEditor({
  habit,
  onClose,
  onSave,
}: {
  habit: Habit | null;
  onClose: () => void;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [weekdays, setWeekdays] = useState(
      habit?.weekdays || [0, 1, 2, 3, 4, 5, 6],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!weekdays.length) {
      setError("Choose at least one weekday.");
      return;
    }
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSave({
        title: f.get("title"),
        category: f.get("category"),
        weekdays,
        ...(!habit
          ? { timeZone: f.get("timeZone"), startDate: f.get("startDate") }
          : {}),
      });
      onClose();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        habit
          ? "Keep making space for yourself."
          : "Start a small daily promise."
      }
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        <label>
          Habit title
          <input
            name="title"
            autoFocus
            required
            maxLength={120}
            defaultValue={habit?.title || ""}
          />
        </label>
        <label>
          Category
          <input
            name="category"
            required
            maxLength={60}
            defaultValue={habit?.category || "Personal"}
          />
        </label>
        {habit ? (
          <p className="muted">
            Timezone: {habit.timeZone}. Weekday changes apply from tomorrow in
            this timezone (or the start date, if later), preserving past
            schedules.
          </p>
        ) : (
          <div className="form-grid">
            <label>
              Time zone
              <input
                name="timeZone"
                list="timezones"
                required
                maxLength={100}
                defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
              />
              <datalist id="timezones">
                {[
                  "Africa/Kampala",
                  "UTC",
                  "Europe/London",
                  "America/New_York",
                  "America/Los_Angeles",
                  "Asia/Tokyo",
                ].map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </label>
            <label>
              Start date
              <input
                name="startDate"
                type="date"
                required
                defaultValue={localDate()}
              />
            </label>
          </div>
        )}
        <fieldset className="weekday-select">
          <legend>Scheduled weekdays</legend>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <label className="inline-check" key={d}>
              <input
                type="checkbox"
                checked={weekdays.includes(d)}
                onChange={(e) =>
                  setWeekdays((prev) =>
                    e.target.checked
                      ? [...prev, d]
                      : prev.filter((v) => v !== d),
                  )
                }
              />
              {dayNames[d]}
            </label>
          ))}
          <button
            className="secondary-button"
            type="button"
            onClick={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])}
          >
            Every day
          </button>
        </fieldset>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? "Saving…" : "Save habit"}
        </button>
      </form>
    </Modal>
  );
}
