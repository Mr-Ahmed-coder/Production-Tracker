import { dateLabel } from "./format";
import { useState, type FormEvent } from "react";
import { Plus, Target } from "lucide-react";
import { localDate, type Task } from "../data/demo";
import { messageOf } from "../lib/api";
import { type Goal, type Milestone } from "./types";
import { type RecordStore } from "./useRecords";
import { Modal, StoreStatus, Actions, DeleteRecord, Empty } from "./Shared";
import { GoalsTimeline } from "./ModuleDashboard";
export function GoalsPage({
  store,
  tasks,
}: {
  store: RecordStore<Goal>;
  tasks: Task[];
}) {
  const [editing, setEditing] = useState<Goal | null | undefined>(),
    [removing, setRemoving] = useState<Goal>(),
    [archive, setArchive] = useState(false),
    [term, setTerm] = useState("all"),
    [status, setStatus] = useState("all");
  const visible = store.items.filter(
    (g) =>
      g.archived === archive &&
      (term === "all" || g.term === term) &&
      (status === "all" || g.status === status),
  );
  return (
    <>
      <div className="module-toolbar">
        <p className="muted">Small milestones. Meaningful progress.</p>
        <button
          className="primary-button"
          disabled={store.busy || store.loading}
          onClick={() => setEditing(null)}
        >
          <Plus size={16} /> New goal
        </button>
      </div>
      <StoreStatus store={store} />
      <GoalsTimeline
        goals={store.items}
        loading={store.loading}
        error={store.error}
      />
      <div className="module-filters">
        <label>
          Show
          <select
            value={String(archive)}
            onChange={(e) => setArchive(e.target.value === "true")}
          >
            <option value="false">Current goals</option>
            <option value="true">Archived goals</option>
          </select>
        </label>
        <label>
          Term
          <select value={term} onChange={(e) => setTerm(e.target.value)}>
            <option value="all">Both terms</option>
            <option value="short">Short-term</option>
            <option value="long">Long-term</option>
          </select>
        </label>
        <label>
          Goal status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
        </label>
      </div>
      <div className="records-grid">
        {visible.map((g) => (
          <section className="card goal-record" key={g.id}>
            <Target size={22} />
            <span className="note-tag">
              {g.term === "short" ? "Short-term" : "Long-term"} · {g.category}
            </span>
            <h2>{g.title}</h2>
            <p className="muted preserve-lines">{g.description}</p>
            <div className="section-heading">
              <strong>{g.progress}%</strong>
              <span className="muted">
                {g.status} · {dateLabel(g.targetDate)}
              </span>
            </div>
            <progress
              max={100}
              value={g.progress}
              aria-label={g.title + " progress"}
            />
            {g.milestones.map((m) => (
              <MilestoneControl
                key={m.id + ":" + m.current + ":" + m.target}
                milestone={m}
                busy={store.busy || g.archived}
                onSave={(current) =>
                  store.save(
                    {
                      milestones: g.milestones.map((v) =>
                        v.id === m.id ? { ...v, current } : v,
                      ),
                    },
                    g.id,
                  )
                }
              />
            ))}
            {!g.milestones.length && (
              <p className="muted">
                Add milestones to measure progress, or mark this goal completed.
              </p>
            )}
            {g.taskIds.length > 0 && (
              <p className="muted">
                Linked tasks:{" "}
                {g.taskIds
                  .map(
                    (id) =>
                      tasks.find((t) => t.id === id)?.title || "Deleted task",
                  )
                  .join(" · ")}
              </p>
            )}
            <Actions
              title={g.title}
              busy={store.busy}
              edit={() => setEditing(g)}
              remove={() => setRemoving(g)}
            >
              <button
                className="secondary-button"
                disabled={store.busy}
                onClick={() =>
                  void store
                    .save({ archived: !g.archived }, g.id)
                    .catch(() => {})
                }
              >
                {g.archived ? "Restore" : "Archive"}
              </button>
            </Actions>
          </section>
        ))}
      </div>
      {!store.loading && !store.error && !visible.length && (
        <Empty>
          Create a goal with measurable milestones. Tasks are optional.
        </Empty>
      )}
      {editing !== undefined && (
        <GoalEditor
          goal={editing}
          tasks={tasks}
          onClose={() => setEditing(undefined)}
          onSave={(body) => store.save(body, editing?.id)}
        />
      )}
      {removing && (
        <DeleteRecord
          title={removing.title}
          onClose={() => setRemoving(undefined)}
          onRemove={() => store.remove(removing.id)}
        />
      )}
    </>
  );
}
function MilestoneControl({
  milestone: m,
  busy,
  onSave,
}: {
  milestone: Milestone;
  busy: boolean;
  onSave: (current: number) => Promise<void>;
}) {
  const [value, setValue] = useState(m.current),
    [error, setError] = useState("");
  return (
    <form
      className="milestone-progress"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await onSave(value);
        } catch (e) {
          setError(messageOf(e));
        }
      }}
    >
      <label>
        {m.title}
        <span className="muted">
          {Math.round((m.current / m.target) * 100)}% complete · {m.current}/
          {m.target} {m.unit}
          {m.targetDate ? " · " + dateLabel(m.targetDate) : ""}
        </span>
        <input
          type="number"
          step="any"
          min={0}
          max={m.target}
          required
          value={value}
          aria-label={"Progress for " + m.title}
          onChange={(e) => setValue(e.target.valueAsNumber)}
        />
      </label>
      <button className="secondary-button" disabled={busy}>
        Update progress
      </button>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
function GoalEditor({
  goal,
  tasks,
  onClose,
  onSave,
}: {
  goal: Goal | null;
  tasks: Task[];
  onClose: () => void;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [milestones, setMilestones] = useState<Milestone[]>(
      goal?.milestones || [],
    ),
    [links, setLinks] = useState(goal?.taskIds || []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function patch(i: number, change: Partial<Milestone>) {
    setMilestones((prev) =>
      prev.map((m, j) => (i === j ? { ...m, ...change } : m)),
    );
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSave({
        title: f.get("title"),
        description: f.get("description"),
        category: f.get("category"),
        targetDate: f.get("targetDate"),
        term: f.get("term"),
        status: f.get("status"),
        taskIds: links,
        milestones,
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
        goal ? "Shape your next milestone." : "Give your ambition a direction."
      }
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        <label>
          Goal title
          <input
            name="title"
            autoFocus
            required
            maxLength={120}
            defaultValue={goal?.title || ""}
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            rows={3}
            maxLength={5000}
            defaultValue={goal?.description || ""}
          />
        </label>
        <div className="form-grid">
          <label>
            Category
            <input
              name="category"
              required
              maxLength={60}
              defaultValue={goal?.category || "Personal"}
            />
          </label>
          <label>
            Target date
            <input
              name="targetDate"
              type="date"
              required
              defaultValue={goal?.targetDate || localDate()}
            />
          </label>
          <label>
            Term
            <select name="term" defaultValue={goal?.term || "short"}>
              <option value="short">Short-term</option>
              <option value="long">Long-term</option>
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={goal?.status || "active"}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </label>
        </div>
        <h3>Milestones</h3>
        <p className="muted">
          Progress is the average of each milestone’s completion percentage.
        </p>
        {milestones.map((m, i) => (
          <fieldset className="milestone-editor" key={m.id || i}>
            <legend>Milestone {i + 1}</legend>
            <label>
              Milestone title
              <input
                required
                maxLength={120}
                value={m.title}
                onChange={(e) => patch(i, { title: e.target.value })}
              />
            </label>
            <div className="form-grid">
              <label>
                Target amount
                <input
                  type="number"
                  step="any"
                  required
                  min={0.000001}
                  max={1e9}
                  value={m.target}
                  onChange={(e) => patch(i, { target: e.target.valueAsNumber })}
                />
              </label>
              <label>
                Current amount
                <input
                  type="number"
                  step="any"
                  required
                  min={0}
                  max={m.target}
                  value={m.current}
                  onChange={(e) =>
                    patch(i, { current: e.target.valueAsNumber })
                  }
                />
              </label>
              <label>
                Unit
                <input
                  required
                  maxLength={32}
                  value={m.unit}
                  onChange={(e) => patch(i, { unit: e.target.value })}
                />
              </label>
              <label>
                Milestone date (optional)
                <input
                  type="date"
                  value={m.targetDate || ""}
                  onChange={(e) =>
                    patch(i, { targetDate: e.target.value || null })
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setMilestones((prev) => prev.filter((_, j) => j !== i))
              }
            >
              Remove milestone {i + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="secondary-button"
          disabled={milestones.length >= 30}
          onClick={() =>
            setMilestones((prev) => [
              ...prev,
              {
                title: "",
                target: 1,
                current: 0,
                unit: "steps",
                targetDate: null,
              },
            ])
          }
        >
          Add milestone
        </button>
        <fieldset className="task-links">
          <legend>Link existing tasks (optional)</legend>
          {[
            ...tasks.map((t) => ({ id: t.id, title: t.title })),
            ...links
              .filter((id) => !tasks.some((t) => t.id === id))
              .map((id) => ({
                id,
                title: "Unavailable task — uncheck to clear",
              })),
          ].map((t) => (
            <label className="inline-check" key={t.id}>
              <input
                type="checkbox"
                checked={links.includes(t.id)}
                onChange={(e) =>
                  setLinks((prev) =>
                    e.target.checked
                      ? [...prev, t.id]
                      : prev.filter((id) => id !== t.id),
                  )
                }
              />
              {t.title}
            </label>
          ))}
          {!tasks.length && !links.length && (
            <p className="muted">
              No tasks yet. Goals and milestones work independently.
            </p>
          )}
        </fieldset>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? "Saving…" : "Save goal"}
        </button>
      </form>
    </Modal>
  );
}
