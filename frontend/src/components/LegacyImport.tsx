import { useState } from "react";
import { type Task } from "../data/demo";
import { messageOf } from "../lib/api";
function readLegacy(): { tasks: Task[]; error: string } {
  try {
    const raw = localStorage.getItem("prodtrack.tasks.v1");
    if (!raw) return { tasks: [], error: "" };
    const value: unknown = JSON.parse(raw);
    if (
      !Array.isArray(value) ||
      !value.every(
        (t) =>
          t &&
          typeof t.id === "string" &&
          typeof t.title === "string" &&
          typeof t.category === "string" &&
          typeof t.completed === "boolean" &&
          typeof t.dueDate === "string" &&
          ["High", "Medium", "Low"].includes(t.priority),
      )
    )
      throw new Error();
    return { tasks: value, error: "" };
  } catch {
    return {
      tasks: [],
      error:
        "Browser tasks could not be read. The original browser data has been preserved.",
    };
  }
}
export function LegacyImport({
  onImport,
  busy,
}: {
  onImport: (tasks: Task[]) => Promise<void>;
  busy: boolean;
}) {
  const [legacy] = useState(readLegacy);
  const [review, setReview] = useState(false);
  const [selected, setSelected] = useState<string[]>(
    legacy.tasks.map((t) => t.id),
  );
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  if (!legacy.tasks.length && !legacy.error) return null;
  async function run() {
    setMessage("");
    try {
      await onImport(legacy.tasks.filter((t) => selected.includes(t.id)));
      setMessage("Import complete. Browser originals remain untouched.");
      setDone(true);
      setReview(false);
    } catch (e) {
      setMessage(
        messageOf(e) +
          " You can safely retry; imported items will not be duplicated.",
      );
    }
  }
  return (
    <section className="card import-card">
      <h2>Bring your browser tasks along.</h2>
      <p className="muted">
        {legacy.tasks.length} Phase 1 tasks found on this browser. These may
        include demo examples or tasks from another person using this device.
        Import only tasks that belong in your account. Originals are never
        deleted.
      </p>
      {legacy.error && <p role="alert">{legacy.error}</p>}
      {!done && legacy.tasks.length > 0 && (
        <button className="secondary-button" onClick={() => setReview(!review)}>
          {review ? "Hide review" : "Review browser tasks"}
        </button>
      )}
      {review && (
        <>
          <div className="import-list">
            {legacy.tasks.map((t) => (
              <label key={t.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(t.id)}
                  onChange={(e) =>
                    setSelected((prev) =>
                      e.target.checked
                        ? [...prev, t.id]
                        : prev.filter((id) => id !== t.id),
                    )
                  }
                />
                <span>
                  {t.title} · {t.dueDate} ·{" "}
                  {t.completed ? "Completed" : "To do"}
                </span>
              </label>
            ))}
          </div>
          <button
            className="primary-button"
            disabled={busy || !selected.length}
            onClick={() => void run()}
          >
            {busy
              ? "Importing…"
              : `Import ${selected.length} selected tasks into my account`}
          </button>
        </>
      )}
      {message && (
        <p role="status" className="muted">
          {message}
        </p>
      )}
    </section>
  );
}
