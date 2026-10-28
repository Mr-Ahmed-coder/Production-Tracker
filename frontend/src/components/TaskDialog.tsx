import { useEffect, useRef, useState, type FormEvent } from "react";
import { X, Plus } from "lucide-react";
import { localDate, type Task } from "../data/demo";
import { messageOf } from "../lib/api";
export function TaskDeleteDialog({
  task,
  onClose,
  onConfirm,
}: {
  task: Task;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby="delete-task-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="delete-task-title">Delete this task?</h2>
      <p className="muted">{task.title}</p>
      <p className="muted">
        This removes the saved task from your account and cannot be undone.
      </p>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className="timer-actions">
        <button className="secondary-button" disabled={busy} onClick={onClose}>
          Keep task
        </button>
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => void remove()}
        >
          {busy ? "Deleting…" : "Delete task"}
        </button>
      </div>
    </dialog>
  );
}
export function TaskDialog({
  onClose,
  onSave,
  task,
}: {
  onClose: () => void;
  onSave: (task: Omit<Task, "id" | "completed">) => Promise<void>;
  task?: Task;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(task?.title || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSave({
        title: title.trim(),
        priority: data.get("priority") as Task["priority"],
        dueDate: String(data.get("date")),
        category: String(data.get("category")).trim() || "Personal",
      });
      onClose();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="task-dialog-title"
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="section-heading">
          <span className="eyebrow">MAKE ROOM FOR PROGRESS</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <h2 id="task-dialog-title">
          {task ? "Refine your next step." : "One small step."}
        </h2>
        <p className="muted">What would you like to accomplish?</p>
        <label>
          Task title
          <input
            autoFocus
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Give your next step a name"
          />
        </label>
        <div className="form-grid">
          <label>
            Priority
            <select name="priority" defaultValue={task?.priority || "Medium"}>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </label>
          <label>
            Due date
            <input
              name="date"
              type="date"
              required
              defaultValue={task?.dueDate || localDate()}
            />
          </label>
        </div>
        <label>
          Category
          <input
            name="category"
            maxLength={60}
            defaultValue={task?.category || "Personal"}
          />
        </label>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button"
          type="submit"
          disabled={busy || !title.trim()}
        >
          <Plus size={17} />
          {busy ? "Saving…" : task ? "Save changes" : "Add task"}
        </button>
      </form>
    </dialog>
  );
}
