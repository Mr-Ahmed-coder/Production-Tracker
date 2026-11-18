import { useEffect, useRef, useState } from "react";
import { api, messageOf } from "../lib/api";
import { Modal } from "./Shared";
import { shiftDate } from "../productivity/format";
export type RecurringOccurrence = {
  id: string;
  seriesId: string;
  date: string;
  title: string;
  description: string;
  priority: "High" | "Medium" | "Low";
  completed: boolean;
  completedAt: string | null;
  timeZone: string;
  retained: boolean;
  editable: boolean;
};
type Series = {
  id: string;
  title: string;
  description: string;
  priority: "High" | "Medium" | "Low";
  startDate: string;
  endDate: string;
  weekdays: number[];
  timeZone: string;
  stoppedAfter: string | null;
  deletedAt: string | null;
  version: number;
};
const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function RepeatingTaskDialog({
  seriesId,
  defaultDate,
  onClose,
  onSaved,
}: {
  seriesId?: string;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [record, setRecord] = useState<Series | null>(null),
    [skipped, setSkipped] = useState<string[]>([]),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [priority, setPriority] = useState("Medium"),
    [start, setStart] = useState(defaultDate),
    [end, setEnd] = useState(shiftDate(defaultDate, 6)),
    [weekdays, setWeekdays] = useState([0, 1, 2, 3, 4, 5, 6]),
    [schedule, setSchedule] = useState("daily"),
    [loading, setLoading] = useState(Boolean(seriesId)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [confirm, setConfirm] = useState<"stop" | "delete" | null>(null);
  const createKey = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!seriesId) return;
    const c = new AbortController();
    setLoading(true);
    setError("");
    void api<{ item: Series; skippedDates: string[] }>(
      "/recurring-tasks/" + seriesId,
      { signal: c.signal },
    )
      .then(({ item, skippedDates }) => {
        if (c.signal.aborted) return;
        setRecord(item);
        setSkipped(skippedDates);
        setTitle(item.title);
        setDescription(item.description);
        setPriority(item.priority);
        setStart(item.startDate);
        setEnd(item.endDate);
        setWeekdays(item.weekdays);
        setSchedule(item.weekdays.length === 7 ? "daily" : "weekdays");
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(messageOf(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [seriesId, refresh]);
  const count = Math.round((+new Date(end) - +new Date(start)) / 86400000) + 1,
    valid = Number.isInteger(count) && count >= 1 && count <= 30;
  const activeDays = schedule === "daily" ? [0, 1, 2, 3, 4, 5, 6] : weekdays;
  let occurrences = 0;
  if (valid)
    for (let d = start; d <= end; d = shiftDate(d, 1))
      if (activeDays.includes(new Date(d + "T12:00:00Z").getUTCDay()))
        occurrences++;
  async function change(
    path: string,
    method: string,
    body: unknown,
    close = true,
    restoredDate?: string,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(path, { method, body: JSON.stringify(body) });
      onSaved();
      if (close) onClose();
      else setSkipped((dates) => dates.filter((date) => date !== restoredDate));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        confirm === "stop"
          ? "Stop future repetitions?"
          : confirm === "delete"
            ? "Remove this recurring series?"
            : seriesId
              ? "Edit repeating task"
              : "Plan a repeating task"
      }
      onClose={onClose}
      busy={busy}
    >
      {error && (
        <p role="alert" className="error-banner">
          {error}{" "}
          {seriesId && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setRefresh((n) => n + 1)}
            >
              Reload series
            </button>
          )}
        </p>
      )}
      {loading ? (
        <p role="status">Loading series…</p>
      ) : confirm ? (
        <>
          <p className="muted">
            {confirm === "stop"
              ? "Occurrences after today in this series’s timezone will stop. Today and completed occurrences are kept."
              : "Unfinished occurrences will be removed from the calendar. Completed occurrences and their actual timestamps remain as read-only history."}
          </p>
          <div className="timer-actions">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Keep planning
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void change(
                  "/recurring-tasks/" +
                    seriesId +
                    (confirm === "stop" ? "/stop" : ""),
                  confirm === "stop" ? "POST" : "DELETE",
                  { confirm: true },
                )
              }
            >
              {confirm === "stop" ? "Confirm stop" : "Confirm remove series"}
            </button>
          </div>
        </>
      ) : (
        (!seriesId || record) && (
          <>
            {record?.stoppedAfter && (
              <p className="muted">
                Stopped after {record.stoppedAfter}. Completed history is
                preserved. Create a new series to begin another run.
              </p>
            )}
            {record?.deletedAt && (
              <p className="muted">
                This series was removed. Its completed dates are kept as
                read-only history.
              </p>
            )}
            <form
              className="repeat-task-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!valid || !occurrences) return;
                void change(
                  "/recurring-tasks" + (seriesId ? "/" + seriesId : ""),
                  seriesId ? "PATCH" : "POST",
                  {
                    title,
                    description,
                    priority,
                    startDate: start,
                    endDate: end,
                    weekdays: activeDays,
                    ...(seriesId
                      ? { version: record?.version }
                      : { createKey: createKey.current }),
                  },
                );
              }}
            >
              <label>
                Task title
                <input
                  required
                  maxLength={120}
                  value={title}
                  disabled={busy || Boolean(record?.deletedAt)}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <div className="form-grid">
                <label>
                  Start date
                  <input
                    type="date"
                    required
                    value={start}
                    disabled={busy || Boolean(record?.deletedAt)}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  End date
                  <input
                    type="date"
                    required
                    value={end}
                    min={start}
                    max={start ? shiftDate(start, 29) : undefined}
                    disabled={busy || Boolean(record?.deletedAt)}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
              </div>
              <div className="repeat-presets" aria-label="Date range presets">
                {[7, 14, 30].map((n) => (
                  <button
                    type="button"
                    className="secondary-button"
                    key={n}
                    disabled={!start || busy || Boolean(record?.deletedAt)}
                    onClick={() => setEnd(shiftDate(start, n - 1))}
                  >
                    {n} days
                  </button>
                ))}
              </div>
              <label>
                Repeat schedule
                <select
                  value={schedule}
                  disabled={busy || Boolean(record?.deletedAt)}
                  onChange={(e) => setSchedule(e.target.value)}
                >
                  <option value="daily">Every day</option>
                  <option value="weekdays">Selected weekdays</option>
                </select>
              </label>
              {schedule === "weekdays" && (
                <fieldset className="repeat-weekdays">
                  <legend>Choose weekdays</legend>
                  {weekdayNames.map((name, i) => (
                    <label key={name}>
                      <input
                        type="checkbox"
                        checked={weekdays.includes(i)}
                        disabled={busy || Boolean(record?.deletedAt)}
                        onChange={(e) =>
                          setWeekdays((days) =>
                            e.target.checked
                              ? [...days, i]
                              : days.filter((n) => n !== i),
                          )
                        }
                      />
                      {name}
                    </label>
                  ))}
                </fieldset>
              )}
              <p
                className={valid && occurrences ? "muted" : "error-banner"}
                role="status"
              >
                {valid
                  ? count +
                    " calendar days · " +
                    occurrences +
                    " scheduled occurrences"
                  : "Choose 1–30 calendar days, including both dates."}
              </p>
              <label>
                Priority
                <select
                  value={priority}
                  disabled={busy || Boolean(record?.deletedAt)}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </label>
              <label>
                Description (optional)
                <textarea
                  rows={3}
                  maxLength={5000}
                  value={description}
                  disabled={busy || Boolean(record?.deletedAt)}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <p className="muted">
                One series, independent checkboxes on each date. Dates use{" "}
                {record?.timeZone || "your saved analytics timezone"}. Completed
                dates keep their saved title, priority and actual completion
                time when the series changes.
              </p>
              {!record?.deletedAt && (
                <button
                  className="primary-button"
                  disabled={busy || !valid || !occurrences || !title.trim()}
                >
                  {busy
                    ? "Saving…"
                    : seriesId
                      ? "Save entire series"
                      : "Create repeating task"}
                </button>
              )}
            </form>
            {record && !record.deletedAt && (
              <div className="repeat-management">
                <button
                  className="secondary-button"
                  disabled={busy || Boolean(record.stoppedAfter)}
                  onClick={() => setConfirm("stop")}
                >
                  Stop future repetitions
                </button>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setConfirm("delete")}
                >
                  Remove series
                </button>
              </div>
            )}
            {skipped.length > 0 && (
              <section className="repeat-skipped">
                <h3>Skipped dates</h3>
                {skipped.map((date) => (
                  <div key={date} className="setting-row">
                    <span>{date}</span>
                    <button
                      className="secondary-button"
                      disabled={busy || Boolean(record?.deletedAt)}
                      onClick={() =>
                        void change(
                          "/recurring-tasks/" +
                            seriesId +
                            "/occurrences/" +
                            date,
                          "PUT",
                          { skipped: false },
                          false,
                          date,
                        )
                      }
                    >
                      Restore {date}
                    </button>
                  </div>
                ))}
              </section>
            )}
          </>
        )
      )}
    </Modal>
  );
}
export function RepeatingTaskList({
  onClose,
  onEdit,
}: {
  onClose: () => void;
  onEdit: (id: string) => void;
}) {
  const [page, setPage] = useState(1),
    [data, setData] = useState<{ items: Series[]; totalPages: number } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    void api<{ items: Series[]; totalPages: number }>(
      "/recurring-tasks?page=" + page,
      { signal: c.signal },
    )
      .then((value) => {
        if (!c.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(messageOf(e));
      });
    return () => c.abort();
  }, [page, retry]);
  return (
    <Modal title="Your repeating tasks" onClose={onClose}>
      {error ? (
        <p role="alert" className="error-banner">
          {error}{" "}
          <button
            className="secondary-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      ) : !data ? (
        <p role="status">Loading repeating tasks…</p>
      ) : (
        <>
          {!data.items.length && (
            <p className="muted">
              Create a repeating task to plan a run of up to 30 days.
            </p>
          )}
          {data.items.map((s) => (
            <div key={s.id} className="setting-row">
              <div>
                <strong>{s.title}</strong>
                <p>
                  {s.startDate} – {s.endDate}
                  {s.stoppedAfter ? " · stopped" : ""}
                </p>
              </div>
              <button className="secondary-button" onClick={() => onEdit(s.id)}>
                Manage {s.title}
              </button>
            </div>
          ))}
          <div className="repeat-management">
            <button
              className="secondary-button"
              disabled={page === 1}
              onClick={() => setPage((n) => n - 1)}
            >
              Previous
            </button>
            <span>
              {page} / {data.totalPages}
            </span>
            <button
              className="secondary-button"
              disabled={page >= data.totalPages}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
