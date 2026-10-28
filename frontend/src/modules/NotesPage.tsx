import { stamp } from "./format";
import { useState, type FormEvent } from "react";
import { Pin, Plus, NotebookPen } from "lucide-react";
import { localDate, type Task } from "../data/demo";
import { messageOf } from "../lib/api";
import { type Note, type Goal } from "./types";
import { type RecordStore } from "./useRecords";
import { Modal, StoreStatus, Actions, DeleteRecord, Empty } from "./Shared";
import { PaginationBar } from "../components/PaginationBar";
export function NotesPage({
  store,
  goals,
  tasks,
}: {
  store: RecordStore<Note>;
  goals: Goal[];
  tasks: Task[];
}) {
  const [editing, setEditing] = useState<Note | null | undefined>(),
    [journal, setJournal] = useState(false),
    [removing, setRemoving] = useState<Note>(),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [kind, setKind] = useState("all"),
    [tag, setTag] = useState("");
  const visible = store.items
    .filter(
      (n) =>
        (n.title + " " + n.content + " " + n.tags.join(" "))
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!category || n.category === category) &&
        (!tag || n.tags.includes(tag)) &&
        (kind === "all" || Boolean(n.journalDate) === (kind === "journal")),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.ceil(visible.length / pageSize) || 1;
  const currentPage = Math.min(page, totalPages);
  const displayedNotes = visible.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  return (
    <>
      <div className="module-toolbar">
        <p className="muted">
          Thoughts worth keeping. A journal that is just yours.
        </p>
        <div className="record-actions">
          <button
            className="secondary-button"
            disabled={store.loading || store.busy}
            onClick={() => {
              const entry = store.items.find(
                (n) => n.journalDate === localDate(),
              );
              setJournal(true);
              setEditing(entry || null);
            }}
          >
            Today's journal
          </button>
          <button
            className="primary-button"
            disabled={store.loading || store.busy}
            onClick={() => {
              setJournal(false);
              setEditing(null);
            }}
          >
            <Plus size={16} /> New note
          </button>
        </div>
      </div>
      <StoreStatus store={store} />
      <div className="module-filters">
        <label>
          Search notes
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search titles, content or tags"
          />
        </label>
        <label>
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {[...new Set(store.items.map((n) => n.category))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All notes</option>
            <option value="note">Notes</option>
            <option value="journal">Journal entries</option>
          </select>
        </label>
        <label>
          Tag
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All tags</option>
            {[...new Set(store.items.flatMap((n) => n.tags))].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="records-grid">
        {displayedNotes.map((n) => (
          <article className="card saved-note" key={n.id}>
            <div className="section-heading">
              <NotebookPen size={20} />
              <button
                className={"icon-button " + (n.pinned ? "is-pinned" : "")}
                aria-label={(n.pinned ? "Unpin " : "Pin ") + n.title}
                disabled={store.busy}
                onClick={() =>
                  void store.save({ pinned: !n.pinned }, n.id).catch(() => {})
                }
              >
                <Pin size={16} />
              </button>
            </div>
            <span className="note-tag">
              {n.journalDate ? "Journal · " + n.journalDate : n.category}
            </span>
            <button
              className="note-open"
              onClick={() => {
                setJournal(Boolean(n.journalDate));
                setEditing(n);
              }}
              aria-label={"Open " + n.title}
            >
              <h2>{n.title}</h2>
              <p>{n.content || "No content yet."}</p>
            </button>
            <div className="tag-list">
              {n.tags.map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </div>
            {(n.goalId || n.taskId) && (
              <p className="muted">
                Linked to{" "}
                {n.goalId
                  ? goals.find((g) => g.id === n.goalId)?.title ||
                    "a deleted goal"
                  : ""}
                {n.goalId && n.taskId ? " · " : ""}
                {n.taskId
                  ? tasks.find((t) => t.id === n.taskId)?.title ||
                    "a deleted task"
                  : ""}
              </p>
            )}
            <small className="muted">Updated {stamp(n.updatedAt)}</small>
            <Actions
              title={n.title}
              busy={store.busy}
              edit={() => {
                setJournal(Boolean(n.journalDate));
                setEditing(n);
              }}
              remove={() => setRemoving(n)}
            />
          </article>
        ))}
      </div>
      <PaginationBar
        page={currentPage}
        totalPages={totalPages}
        totalItems={visible.length}
        itemName="notes"
        onPageChange={setPage}
      />
      {!store.loading && !store.error && !visible.length && (
        <Empty>
          Create a note or a daily journal entry, or adjust your filters.
        </Empty>
      )}
      {editing !== undefined && (
        <NoteEditor
          note={editing}
          journal={journal}
          goals={goals}
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
function NoteEditor({
  note,
  journal,
  goals,
  tasks,
  onClose,
  onSave,
}: {
  note: Note | null;
  journal: boolean;
  goals: Goal[];
  tasks: Task[];
  onClose: () => void;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [isJournal, setIsJournal] = useState(journal);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSave({
        title: String(f.get("title")),
        content: String(f.get("content")),
        category: String(f.get("category")),
        tags: String(f.get("tags"))
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        journalDate: isJournal ? String(f.get("journalDate")) : null,
        goalId: f.get("goalId") || null,
        taskId: f.get("taskId") || null,
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
        note
          ? "Your words, kept safe."
          : isJournal
            ? "A moment to reflect."
            : "Capture a thought."
      }
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          Title
          <input
            name="title"
            autoFocus
            required
            maxLength={120}
            defaultValue={
              note?.title || (journal ? "Journal · " + localDate() : "")
            }
          />
        </label>
        <label>
          Content
          <textarea
            name="content"
            rows={10}
            maxLength={20000}
            defaultValue={note?.content || ""}
            placeholder="Make a little space for your thoughts…"
          />
        </label>
        <div className="form-grid">
          <label>
            Category
            <input
              name="category"
              required
              maxLength={60}
              defaultValue={note?.category || "Personal"}
            />
          </label>
          <label>
            Tags (comma separated)
            <input
              name="tags"
              maxLength={329}
              defaultValue={note?.tags.join(", ") || ""}
            />
          </label>
        </div>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={isJournal}
            onChange={(e) => setIsJournal(e.target.checked)}
          />{" "}
          Daily journal entry
        </label>
        {isJournal && (
          <label>
            Journal date
            <input
              name="journalDate"
              type="date"
              required
              defaultValue={note?.journalDate || localDate()}
            />
          </label>
        )}
        <div className="form-grid">
          <label>
            Link to goal
            <select name="goalId" defaultValue={note?.goalId || ""}>
              <option value="">No goal</option>
              {note?.goalId && !goals.some((g) => g.id === note.goalId) && (
                <option value={note.goalId}>
                  Unavailable goal — choose No goal to clear
                </option>
              )}
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Link to task
            <select name="taskId" defaultValue={note?.taskId || ""}>
              <option value="">No task</option>
              {note?.taskId && !tasks.some((t) => t.id === note.taskId) && (
                <option value={note.taskId}>
                  Unavailable task — choose No task to clear
                </option>
              )}
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {note && (
          <p className="muted">
            Created {stamp(note.createdAt)} · Updated {stamp(note.updatedAt)}
          </p>
        )}
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? "Saving…" : "Save note"}
        </button>
      </form>
    </Modal>
  );
}
