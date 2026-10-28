import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X, Pencil, Trash2 } from "lucide-react";
import { messageOf } from "../lib/api";
export function Modal({
  title,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      className="record-modal"
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="section-heading">
        <span className="eyebrow">YOUR PERSONAL WORKSPACE</span>
        <button
          className="icon-button"
          aria-label="Close editor"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <h2 id={id}>{title}</h2>
      {children}
    </dialog>
  );
}
export function StoreStatus({
  store,
}: {
  store: {
    loading: boolean;
    error: string;
    notice: string;
    busy: boolean;
    refresh: () => Promise<void>;
  };
}) {
  return (
    <>
      {store.loading && (
        <p className="loading-state" role="status">
          Loading your records…
        </p>
      )}
      {store.error && (
        <div className="error-banner" role="alert">
          {store.error}{" "}
          <button
            className="secondary-button"
            disabled={store.busy}
            onClick={() => void store.refresh()}
          >
            Retry
          </button>
        </div>
      )}
      {store.notice && !store.error && (
        <p className="save-notice" role="status">
          {store.notice}
        </p>
      )}
    </>
  );
}
export function Actions({
  title,
  edit,
  remove,
  busy,
  children,
}: {
  title: string;
  edit: () => void;
  remove?: () => void;
  busy: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="record-actions">
      <button
        className="secondary-button"
        disabled={busy}
        onClick={edit}
        aria-label={"Edit " + title}
      >
        <Pencil size={14} /> Edit
      </button>
      {children}
      {remove && (
        <button
          className="icon-button"
          disabled={busy}
          onClick={remove}
          aria-label={"Delete " + title}
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}
export function DeleteRecord({
  title,
  onClose,
  onRemove,
}: {
  title: string;
  onClose: () => void;
  onRemove: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Delete this record?" onClose={onClose} busy={busy}>
      <p className="muted">
        {title}. This cannot be undone. Linked notes, tasks and goals will be
        kept.
      </p>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className="timer-actions">
        <button className="secondary-button" disabled={busy} onClick={onClose}>
          Keep record
        </button>
        <button
          className="primary-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onRemove();
              onClose();
            } catch (e) {
              setError(messageOf(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Deleting…" : "Delete record"}
        </button>
      </div>
    </Modal>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="card module-empty">
      <h2>A little room to begin.</h2>
      <p className="muted">{children}</p>
    </div>
  );
}
