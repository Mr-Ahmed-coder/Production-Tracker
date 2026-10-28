import { useEffect, useState } from "react";
import { NavLink, Link, Route, Routes, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ListTodo,
  NotebookPen,
  Target,
  Sprout,
  Timer,
  ChartNoAxesCombined,
  Settings,
  ClipboardCheck,
  Search,
  Bell,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  ChevronDown,
  Check,
  X,
} from "lucide-react";
import { CardHeading, FocusChart, TaskList } from "./components/DashboardCards";
import { TaskDialog, TaskDeleteDialog } from "./components/TaskDialog";
import { useTasks } from "./hooks/useTasks";
import { useAuth } from "./auth/context";
import { messageOf } from "./lib/api";
import { LegacyImport } from "./components/LegacyImport";
import { type Task } from "./data/demo";
import { localDate } from "./data/demo";
import { useRecords } from "./modules/useRecords";
import { type Note, type Goal, type Habit } from "./modules/types";
import { NotesPage } from "./modules/NotesPage";
import { GoalsPage } from "./modules/GoalsPage";
import { HabitsPage } from "./modules/HabitsPage";
import {
  GoalsTimeline,
  HabitActivity,
  RecentNotes,
} from "./modules/ModuleDashboard";
import { StoreStatus } from "./modules/Shared";
import { useProductivity } from "./productivity/useProductivity";
import { FocusPage } from "./productivity/FocusPage";
import { AnalyticsPage } from "./productivity/AnalyticsPage";
import { DailyReviewPage } from "./productivity/DailyReviewPage";
import { FocusSettings } from "./productivity/FocusSettings";
import { InsightsPage } from "./productivity/InsightsPage";
import { ExportCard } from "./productivity/ExportCard";
import { hours } from "./productivity/format";
import { StudyMomentumIcon } from "./components/BrandLogo";
const navigation = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/tasks", label: "Tasks", icon: ListTodo },
  { path: "/notes", label: "Notes", icon: NotebookPen },
  { path: "/goals", label: "Goals", icon: Target },
  { path: "/habits", label: "Habits", icon: Sprout },
  { path: "/focus", label: "Focus Timer", icon: Timer },
  { path: "/analytics", label: "Analytics", icon: ChartNoAxesCombined },
  { path: "/insights", label: "Insights", icon: Sparkles },
  { path: "/review", label: "Daily Review", icon: ClipboardCheck },
  { path: "/settings", label: "Settings", icon: Settings },
];
export default function App() {
  const {
    tasks,
    error,
    loading,
    busy,
    refresh,
    addTask,
    editTask,
    toggleTask,
    deleteTask,
    importTasks,
  } = useTasks();
  const notes = useRecords<Note>("/notes");
  const goals = useRecords<Goal>("/goals");
  const habits = useRecords<Habit>("/habits");
  const modulesBusy = notes.busy || goals.busy || habits.busy;
  const { user, logout } = useAuth();
  const [accountError, setAccountError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [editing, setEditing] = useState<Task | undefined>();
  const [deleting, setDeleting] = useState<Task | undefined>();
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const taskActions = {
    busy: busy || loading,
    loading,
    unavailable: Boolean(error) && tasks.length === 0,
    edit: (task: Task) => {
      setEditing(task);
      setDialog(true);
    },
    remove: (task: Task) => setDeleting(task),
  };
  const handleToggle = (id: string) => {
    void toggleTask(id).catch(() => {});
  };
  async function signOut() {
    setSigningOut(true);
    setAccountError("");
    try {
      await logout();
    } catch (e) {
      setAccountError(messageOf(e));
    } finally {
      setSigningOut(false);
    }
  }

  const [dialog, setDialog] = useState(false);
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<"notifications" | "profile" | null>(null);
  const [toast, setToast] = useState("");
  const location = useLocation();
  const productivity = useProductivity(
    JSON.stringify([tasks, goals.items, habits.items, location.pathname]),
  );
  const focusToday = productivity.data?.days.at(-1);
  const calendarToday = productivity.data?.today || localDate();
  const current =
    navigation.find((n) => n.path === location.pathname)?.label ||
    "Page not found";
  const matching = tasks.filter(
    (t) =>
      t.title.toLowerCase().includes(search.toLowerCase()) &&
      (statusFilter === "all" ||
        t.completed === (statusFilter === "completed")) &&
      (priorityFilter === "all" || t.priority === priorityFilter) &&
      (!dateFilter || t.dueDate === dateFilter),
  );
  const today = matching.filter((t) => t.dueDate === calendarToday);
  const completed = tasks.filter(
    (t) => t.dueDate === calendarToday && t.completed,
  ).length;
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="brand" to="/" aria-label="StudyMomentum home" title="StudyMomentum">
          <StudyMomentumIcon size={26} className="sidebar-brand-icon" />
        </Link>
        <nav aria-label="Main navigation">
          {navigation.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              title={label}
              aria-label={label}
              className={({ isActive }) =>
                isActive ? "nav-icon active" : "nav-icon"
              }
            >
              <Icon size={19} />
              <span className="nav-tooltip">{label}</span>
            </NavLink>
          ))}
        </nav>
        <Link
          className="sidebar-focus"
          to="/focus"
          title="Start a focus session"
          aria-label="Start a focus session"
        >
          <Target size={19} />
        </Link>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="top-tabs">
            <Link
              className={
                location.pathname === "/" ? "top-tab selected" : "top-tab"
              }
              to="/"
            >
              <LayoutDashboard size={13} /> Overview
            </Link>
            <Link
              className={
                location.pathname === "/analytics"
                  ? "top-tab selected"
                  : "top-tab"
              }
              to="/analytics"
            >
              <ChartNoAxesCombined size={13} /> Analytics
            </Link>
            <span className="workspace-name">Personal workspace</span>
          </div>
          <div className="top-actions">
            <span className="demo-badge">
              <i /> Signed in
            </span>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              aria-expanded={panel === "notifications"}
              onClick={() =>
                setPanel(panel === "notifications" ? null : "notifications")
              }
            >
              <Bell size={18} />
              <i />
            </button>
            <button
              className="profile-button"
              aria-label="Your profile"
              aria-expanded={panel === "profile"}
              onClick={() => setPanel(panel === "profile" ? null : "profile")}
            >
              {user?.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </button>
            {panel && (
              <div className="popover">
                <div className="section-heading">
                  <strong>
                    {panel === "notifications"
                      ? "All caught up"
                      : "Your personal space"}
                  </strong>
                  <button
                    className="icon-button"
                    aria-label="Close panel"
                    onClick={() => setPanel(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
                <p>
                  {panel === "notifications"
                    ? "No new notifications. A clear mind looks good on you."
                    : `${user?.name} · ${user?.email}`}
                </p>
                {panel === "profile" && (
                  <button
                    className="secondary-button"
                    disabled={
                      signingOut || busy || modulesBusy || productivity.busy
                    }
                    onClick={() => void signOut()}
                  >
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                )}
              </div>
            )}
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}{" "}
                <span className="heading-dot">•</span> YOUR TIME, WELL SPENT
              </div>
              <h1>
                {current === "Dashboard" ? (
                  <>
                    A little better, <span>every day.</span>
                  </>
                ) : (
                  current
                )}
              </h1>
              <p className="welcome">
                Welcome back, {user?.name} <span className="wave">✳</span> Let’s
                make room for what matters.
              </p>
            </div>
            <div className="heading-actions">
              <label className="search-box">
                <Search size={16} />
                <input
                  aria-label="Search tasks"
                  placeholder="Search tasks…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </label>
              <button
                className="primary-button"
                onClick={() => {
                  setEditing(undefined);
                  setDialog(true);
                }}
                disabled={busy || loading}
              >
                <Plus size={17} /> Add task
              </button>
            </div>
          </div>
          {accountError && (
            <p className="error-banner" role="alert">
              {accountError}
            </p>
          )}
          {loading && (
            <p role="status" className="loading-state">
              Loading your saved tasks…
            </p>
          )}
          {!loading &&
            !error &&
            ["/", "/tasks"].includes(location.pathname) && (
              <div className="task-filters" aria-label="Task filters">
                <label>
                  Status
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All statuses</option>
                    <option value="incomplete">To do</option>
                    <option value="completed">Completed</option>
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                  >
                    <option value="all">All priorities</option>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </label>
                <label>
                  Due date
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                  />
                </label>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setStatusFilter("all");
                    setPriorityFilter("all");
                    setDateFilter("");
                    setSearch("");
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          {error && (
            <p className="error-banner" role="alert">
              {error}{" "}
              <button
                className="secondary-button"
                onClick={() => void refresh()}
              >
                Retry
              </button>
            </p>
          )}
          {search &&
            location.pathname !== "/" &&
            location.pathname !== "/tasks" && (
              <TaskList
                tasks={matching}
                toggle={handleToggle}
                {...taskActions}
                full
              />
            )}
          {productivity.loading && (
            <p className="loading-state" role="status">
              Loading focus and activity�
            </p>
          )}
          {productivity.error && (
            <div className="error-banner" role="alert">
              {productivity.error}{" "}
              <button
                className="secondary-button"
                onClick={() => void productivity.refresh()}
              >
                Retry activity
              </button>
            </div>
          )}
          {productivity.notice && !productivity.error && (
            <p className="save-notice" role="status">
              {productivity.notice}
            </p>
          )}
          {productivity.session && (
            <p className="focus-session-status">
              Focus session {productivity.session.state} ·{" "}
              <Link className="text-link" to="/focus">
                Return to timer
              </Link>
            </p>
          )}
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <StoreStatus store={goals} />
                  <StoreStatus store={habits} />
                  <StoreStatus store={notes} />
                  <div className="overview-grid">
                    {[
                      {
                        label: "Active goals",
                        value: String(
                          goals.items.filter(
                            (g) => !g.archived && g.status === "active",
                          ).length,
                        ),
                        change: "Active",
                        caption: "Personal goals in progress",
                        unavailable: goals.loading || Boolean(goals.error),
                        to: "/goals",
                        demo: false,
                      },
                      {
                        label: "Today’s tasks",
                        value: String(
                          tasks.filter(
                            (t) => t.dueDate === calendarToday && !t.completed,
                          ).length,
                        ),
                        change: `${completed} done`,
                        caption: "Progress over perfection",
                        to: "/tasks",
                        demo: false,
                      },
                      {
                        label: "Focus hours today",
                        value: focusToday
                          ? String(hours(focusToday.focusMs))
                          : "�",
                        change: `${focusToday?.targetPercent ?? 0}% of target`,
                        caption: `${productivity.settings?.dailyTargetMinutes ?? "�"} minute daily target`,
                        unavailable:
                          productivity.loading || Boolean(productivity.error),
                        to: "/focus",
                        demo: false,
                      },
                      {
                        label: "Habits today",
                        value: String(
                          habits.items.filter(
                            (h) =>
                              !h.archived &&
                              h.week.some(
                                (d) =>
                                  d.date === h.today &&
                                  d.scheduled &&
                                  d.completed,
                              ),
                          ).length,
                        ),
                        suffix: "",
                        change:
                          String(
                            habits.items.filter(
                              (h) =>
                                !h.archived &&
                                h.week.some(
                                  (d) => d.date === h.today && d.scheduled,
                                ),
                            ).length,
                          ) + " scheduled",
                        caption: "Completed in each habit’s timezone",
                        unavailable: habits.loading || Boolean(habits.error),
                        to: "/habits",
                        demo: false,
                      },
                    ].map((s) => (
                      <Link className="stat-card" key={s.label} to={s.to}>
                        <div className="stat-heading">
                          <span>{s.label}</span>
                          <span className="stat-change">
                            {(
                              "unavailable" in s
                                ? s.unavailable
                                : loading || error
                            )
                              ? "—"
                              : s.change}
                          </span>
                          <ArrowUpRight size={16} />
                        </div>
                        <div className="stat-bottom">
                          <div className="stat-value">
                            {(
                              "unavailable" in s
                                ? s.unavailable
                                : loading || error
                            )
                              ? "—"
                              : s.value}
                            <span>{s.suffix}</span>
                          </div>
                          <span>{s.caption}</span>
                        </div>
                        {s.demo && <span className="stat-demo">DEMO</span>}
                      </Link>
                    ))}
                  </div>
                  <div className="middle-grid">
                    <FocusChart
                      data={productivity.data}
                      unavailable={
                        Boolean(productivity.error) || productivity.loading
                      }
                    />
                    <GoalsTimeline
                      goals={goals.items}
                      loading={goals.loading}
                      error={goals.error}
                    />
                  </div>
                  <div className="bottom-grid">
                    <HabitActivity store={habits} />
                    <TaskList
                      tasks={today}
                      toggle={handleToggle}
                      {...taskActions}
                    />
                  </div>
                  <RecentNotes store={notes} />
                  <Link
                    to="/insights"
                    className="daily-note insights-dashboard-banner"
                  >
                    <Sparkles size={16} />
                    <div className="insights-banner-content">
                      <strong>Personal Productivity Insights</strong>
                      <p>
                        View your week-over-week trends, focus consistency, and
                        priority highlights.
                      </p>
                    </div>
                    <ArrowRight size={16} />
                  </Link>
                  <div className="daily-note">
                    <Sparkles size={14} />
                    <p>
                      You don’t have to be perfect. Just a little more
                      intentional.
                    </p>
                    <span>YOUR DAILY REMINDER</span>
                  </div>
                </>
              }
            />
            <Route
              path="/tasks"
              element={
                <TaskList
                  tasks={matching}
                  toggle={handleToggle}
                  {...taskActions}
                  full
                />
              }
            />
            <Route
              path="/goals"
              element={<GoalsPage store={goals} tasks={tasks} />}
            />
            <Route path="/habits" element={<HabitsPage store={habits} />} />
            <Route
              path="/notes"
              element={
                <NotesPage store={notes} goals={goals.items} tasks={tasks} />
              }
            />
            <Route
              path="/focus"
              element={
                <FocusPage
                  store={productivity}
                  tasks={tasks}
                  goals={goals.items}
                />
              }
            />
            <Route path="/insights" element={<InsightsPage />} />
            <Route
              path="/review"
              element={<DailyReviewPage store={productivity} />}
            />
            <Route
              path="/analytics"
              element={<AnalyticsPage store={productivity} />}
            />
            <Route
              path="/settings"
              element={
                <section className="card settings-card">
                  <CardHeading
                    title="Your workspace"
                    detail="StudyMomentum · your personal account"
                  />
                  <div className="setting-row">
                    <div>
                      <strong>Task storage</strong>
                      <p>
                        Tasks, notes, goals, and focus sessions are saved securely in MongoDB for your StudyMomentum account.
                      </p>
                    </div>
                    <span className="status done">
                      <Check size={12} /> MongoDB
                    </span>
                  </div>
                  <LegacyImport onImport={importTasks} busy={busy} />
                  <FocusSettings store={productivity} />
                  <ExportCard />
                  <div className="setting-row">
                    <div>
                      <strong>Account & sync</strong>
                      <p>
                        Signed in as {user?.name} ({user?.email}).
                      </p>
                    </div>
                    <button
                      className="secondary-button"
                      disabled={
                        signingOut || busy || modulesBusy || productivity.busy
                      }
                      onClick={() => void signOut()}
                    >
                      {signingOut ? "Signing out…" : "Sign out"}
                    </button>
                  </div>
                </section>
              }
            />
            <Route
              path="*"
              element={
                <section className="card">
                  <h2>This page took a detour.</h2>
                  <Link className="text-link" to="/">
                    Back to your dashboard <ArrowRight size={16} />
                  </Link>
                </section>
              }
            />
          </Routes>
          <footer>
            <span className="footer-brand">
              StudyMomentum<span>®</span>
            </span>
            <span>Focus Today. Grow Every Day.</span>
            <span className="footer-right">
              Personal workspace <ChevronDown size={12} />
            </span>
          </footer>
        </main>
      </div>
      {deleting && (
        <TaskDeleteDialog
          task={deleting}
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await deleteTask(deleting.id);
            setToast("Task deleted.");
          }}
        />
      )}
      {dialog && (
        <TaskDialog
          task={editing}
          onClose={() => {
            setDialog(false);
            setEditing(undefined);
          }}
          onSave={async (task) => {
            if (editing) await editTask(editing.id, task);
            else await addTask(task);
            setToast(
              editing
                ? "Task updated."
                : "Task added. A little momentum starts here.",
            );
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
