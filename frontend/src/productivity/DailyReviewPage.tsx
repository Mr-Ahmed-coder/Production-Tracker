import { useEffect, useState } from "react";
import { api, messageOf } from "../lib/api";
import type { Analytics, Review } from "./types";
import type { ProductivityStore } from "./useProductivity";
import { hours } from "./format";
export function DailyReviewPage({ store }: { store: ProductivityStore }) {
  const [date, setDate] = useState(""),
    [loaded, setLoaded] = useState(""),
    [review, setReview] = useState<Review | null>(null),
    [summary, setSummary] = useState<Analytics | null>(null),
    [history, setHistory] = useState<Review[]>([]),
    [wentWell, setWell] = useState(""),
    [challenges, setChallenges] = useState(""),
    [tomorrow, setTomorrow] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [confirmDelete, setConfirmDelete] = useState(false);
  const selected = date || store.data?.today || "";
  useEffect(() => {
    if (!selected) return;
    const c = new AbortController();
    setLoading(true);
    setError("");
    setNotice("");
    setLoaded("");
    setConfirmDelete(false);
    void Promise.all([
      api<{ item: Review | null; summary: Analytics }>(
        `/productivity/reviews/${selected}`,
        { signal: c.signal },
      ),
      api<{ items: Review[] }>("/productivity/reviews", { signal: c.signal }),
    ])
      .then(([r, list]) => {
        if (c.signal.aborted) return;
        setReview(r.item);
        setSummary(r.summary);
        setWell(r.item?.wentWell || "");
        setChallenges(r.item?.challenges || "");
        setTomorrow(r.item?.tomorrow || "");
        setHistory(list.items);
        setLoaded(selected);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(messageOf(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [selected]);
  async function save(remove = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (remove) {
        await api(`/productivity/reviews/${selected}`, { method: "DELETE" });
        setReview(null);
        setWell("");
        setChallenges("");
        setTomorrow("");
        setConfirmDelete(false);
        setNotice("Review deleted. Your activity records were kept.");
      } else {
        const r = await api<{ item: Review }>(
          `/productivity/reviews/${selected}`,
          {
            method: "PUT",
            body: JSON.stringify({
              wentWell,
              challenges,
              tomorrow,
              version: review?.version ?? null,
            }),
          },
        );
        setReview(r.item);
        setNotice("Daily review saved.");
      }
      const [list, fresh] = await Promise.all([
        api<{ items: Review[] }>("/productivity/reviews"),
        api<{ item: Review | null; summary: Analytics }>(
          `/productivity/reviews/${selected}`,
        ),
      ]);
      setHistory(list.items);
      setSummary(fresh.summary);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  const d = summary?.days[0];
  return (
    <section className="card daily-review">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PAUSE. NOTICE. BEGIN AGAIN.</span>
          <h2>Daily review</h2>
        </div>
        <label>
          Review date
          <input
            type="date"
            required
            value={selected}
            disabled={busy}
            max={store.data?.today}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      {loading && <p role="status">Loading your day…</p>}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="save-notice" role="status">
          {notice}
        </p>
      )}
      {!loading && loaded === selected && d && (
        <>
          <p className="muted">
            Live activity summary · {summary?.timeZone} · refreshed when opened
            or saved
          </p>
          <div className="activity-stats">
            <div>
              <strong>{hours(d.focusMs)}h</strong>
              <span>Focused work</span>
            </div>
            <div>
              <strong>
                {d.plannedCompleted}/{d.planned}
              </strong>
              <span>Due tasks completed</span>
            </div>
            <div>
              <strong>
                {d.habitsCompleted}/{d.habitsScheduled}
              </strong>
              <span>Scheduled habits completed</span>
            </div>
            <div>
              <strong>{d.milestonesAchieved}</strong>
              <span>Milestones achieved on date</span>
            </div>
          </div>
          <div className="review-summary">
            <div>
              <h3>Completed on this date</h3>
              {summary?.completedTasks.length ? (
                summary.completedTasks.map((t) => <p key={t.id}>✓ {t.title}</p>)
              ) : (
                <p className="muted">No recorded task completions.</p>
              )}
              <h3>Unfinished tasks due</h3>
              {summary?.tasks.some((t) => !t.completed) ? (
                summary.tasks
                  .filter((t) => !t.completed)
                  .map((t) => <p key={t.id}>{t.title}</p>)
              ) : (
                <p className="muted">No unfinished tasks due on this date.</p>
              )}
            </div>
            <div>
              <h3>Habits completed</h3>
              {summary?.completedHabits.length ? (
                summary.completedHabits.map((h, i) => (
                  <p key={i}>
                    ✓ {h.title} · {h.timeZone}
                  </p>
                ))
              ) : (
                <p className="muted">No scheduled habit completions.</p>
              )}
              <h3>Milestones achieved</h3>
              {summary?.achieved.length ? (
                summary.achieved.map((m, i) => (
                  <p key={i}>
                    ✓ {m.title} · {m.goal}
                  </p>
                ))
              ) : (
                <p className="muted">No recorded milestone achievements.</p>
              )}
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label>
              What went well?
              <textarea
                rows={4}
                maxLength={5000}
                value={wentWell}
                onChange={(e) => setWell(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              What prevented progress?
              <textarea
                rows={4}
                maxLength={5000}
                value={challenges}
                onChange={(e) => setChallenges(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              Tomorrow’s most important priority
              <textarea
                rows={2}
                maxLength={2000}
                value={tomorrow}
                onChange={(e) => setTomorrow(e.target.value)}
                disabled={busy}
              />
            </label>
            <div className="timer-actions">
              <button className="primary-button" disabled={busy}>
                {busy ? "Saving…" : "Save daily review"}
              </button>
              {review && (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete review
                </button>
              )}
            </div>
          </form>
          {confirmDelete && (
            <div className="discard-confirm">
              <p>
                Delete this reflection? Tasks, focus and habit records are kept.
              </p>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void save(true)}
              >
                Confirm delete review
              </button>
              <button
                className="secondary-button"
                onClick={() => setConfirmDelete(false)}
              >
                Keep review
              </button>
            </div>
          )}
        </>
      )}
      <h3>Revisit a review</h3>
      <div className="review-history">
        {history.length ? (
          history.map((r) => (
            <button
              key={r.id}
              className="secondary-button"
              disabled={busy}
              onClick={() => setDate(r.date)}
            >
              {r.date}
            </button>
          ))
        ) : (
          <p className="muted">Your saved reflections will appear here.</p>
        )}
      </div>
      <p className="muted">
        Summaries reflect current saved records, including task edits, reopened
        milestones and deletions. Older activity without a completion timestamp
        is not assigned an invented date.
      </p>
    </section>
  );
}
