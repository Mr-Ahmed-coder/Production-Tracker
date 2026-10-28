import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Play,
  Pause,
  Check,
  Trash2,
  Coffee,
  Volume2,
  Bell,
  Sparkles,
  Target,
  ListTodo,
} from "lucide-react";
import type { Task } from "../data/demo";
import type { Goal } from "../modules/types";
import type { ProductivityStore } from "./useProductivity";
import { api, messageOf } from "../lib/api";
import type { Analytics, ActivityDay } from "./types";
import type { FocusSession } from "./types";
import { dateInZone, shiftDate } from "./format";
import { ActivityChart } from "./ActivityChart";
import {
  playChime,
  requestNotificationPermission,
  showNotification,
} from "./sound";

type PresetKey = "25_5" | "50_10" | "15_3" | "custom" | "open";

export function FocusPage({
  store,
  tasks,
  goals,
}: {
  store: ProductivityStore;
  tasks: Task[];
  goals: Goal[];
}) {
  const [taskId, setTask] = useState("");
  const [goalId, setGoal] = useState("");
  const [discard, setDiscard] = useState(false);
  const [tick, setTick] = useState(0);
  const [period, setPeriod] = useState("week");
  const [historyDate, setHistoryDate] = useState("");
  const [chartDays, setChartDays] = useState<ActivityDay[]>([]);
  const [chartError, setChartError] = useState("");
  const [chartLoading, setChartLoading] = useState(false);

  // Preset & Pomodoro states
  const [preset, setPreset] = useState<PresetKey>(() => {
    return (
      (localStorage.getItem("prodtrack.focus.preset") as PresetKey) || "25_5"
    );
  });
  const [customFocus, setCustomFocus] = useState(30);
  const [customBreak, setCustomBreak] = useState(5);
  const [targetAlerted, setTargetAlerted] = useState(false);

  // Sound & Notification preferences
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem("prodtrack.focus.sound") !== "false";
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem("prodtrack.focus.notifications") === "true";
  });

  // Break mode (client-side only; does not record focus time)
  const [inBreak, setInBreak] = useState(false);
  const [breakTotalSeconds, setBreakTotalSeconds] = useState(300);
  const [breakRemaining, setBreakRemaining] = useState(300);
  const breakIntervalRef = useRef<number | null>(null);

  // History filtering
  const [historyFilter, setHistoryFilter] = useState("all");

  const s = store.session;

  useEffect(() => {
    localStorage.setItem("prodtrack.focus.preset", preset);
  }, [preset]);

  useEffect(() => {
    localStorage.setItem("prodtrack.focus.sound", String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem(
      "prodtrack.focus.notifications",
      String(notificationsEnabled),
    );
  }, [notificationsEnabled]);

  // Handle active session monotonic clock ticking
  useEffect(() => {
    setTick(0);
    const anchor = performance.now();
    const t = window.setInterval(
      () => setTick(performance.now() - anchor),
      500,
    );
    return () => clearInterval(t);
  }, [s]);

  // Interpolate against monotonic browser clock; server timestamps remain authoritative
  const elapsed = s
    ? s.durationMs +
      (s.state === "running"
        ? Math.max(
            0,
            Math.min(
              tick,
              Date.parse(s.leaseUntil || s.serverNow) - Date.parse(s.serverNow),
            ),
          )
        : 0)
    : 0;

  const seconds = Math.floor(elapsed / 1000);
  const hours = Math.floor(seconds / 3600);

  // Determine current preset focus & break minutes
  let presetFocusMinutes: number | null = null;
  let presetBreakMinutes = 5;

  if (preset === "25_5") {
    presetFocusMinutes = 25;
    presetBreakMinutes = 5;
  } else if (preset === "50_10") {
    presetFocusMinutes = 50;
    presetBreakMinutes = 10;
  } else if (preset === "15_3") {
    presetFocusMinutes = 15;
    presetBreakMinutes = 3;
  } else if (preset === "custom") {
    presetFocusMinutes = customFocus;
    presetBreakMinutes = customBreak;
  } else if (preset === "open") {
    presetFocusMinutes = null;
    presetBreakMinutes = 5;
  }

  const targetSeconds = presetFocusMinutes ? presetFocusMinutes * 60 : null;
  const progressPercent = targetSeconds
    ? Math.min(100, Math.round((seconds / targetSeconds) * 100))
    : 0;

  // Trigger completion alerts when target is reached
  useEffect(() => {
    if (
      s?.state === "running" &&
      targetSeconds !== null &&
      seconds >= targetSeconds &&
      !targetAlerted
    ) {
      setTargetAlerted(true);
      if (soundEnabled) playChime();
      if (notificationsEnabled) {
        showNotification(
          "Focus target reached!",
          `Great job completing ${presetFocusMinutes} minutes. Time for a ${presetBreakMinutes}-minute break.`,
        );
      }
    }
  }, [
    s?.state,
    seconds,
    targetSeconds,
    targetAlerted,
    soundEnabled,
    notificationsEnabled,
    presetFocusMinutes,
    presetBreakMinutes,
  ]);

  // Reset alert flag when session changes or ends
  useEffect(() => {
    if (!s || s.state !== "running") {
      setTargetAlerted(false);
    }
  }, [s]);

  // Break mode countdown
  useEffect(() => {
    if (!inBreak) {
      if (breakIntervalRef.current) clearInterval(breakIntervalRef.current);
      return;
    }

    breakIntervalRef.current = window.setInterval(() => {
      setBreakRemaining((prev) => {
        if (prev <= 1) {
          if (breakIntervalRef.current) clearInterval(breakIntervalRef.current);
          if (soundEnabled) playChime();
          if (notificationsEnabled) {
            showNotification(
              "Break complete!",
              "Ready to begin your next focused work session.",
            );
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (breakIntervalRef.current) clearInterval(breakIntervalRef.current);
    };
  }, [inBreak, soundEnabled, notificationsEnabled]);

  function startBreak(mins = presetBreakMinutes) {
    const totalSec = mins * 60;
    setBreakTotalSeconds(totalSec);
    setBreakRemaining(totalSec);
    setInBreak(true);
  }

  function stopBreak() {
    setInBreak(false);
    if (breakIntervalRef.current) clearInterval(breakIntervalRef.current);
  }

  const selected = historyDate || store.data?.today || "";
  useEffect(() => {
    if (!selected || !store.data) return;
    const c = new AbortController();
    setChartLoading(true);
    setChartError("");
    let from = selected,
      to = selected;
    if (period === "week") {
      from = shiftDate(
        selected,
        -((new Date(selected + "T12:00:00Z").getUTCDay() + 6) % 7),
      );
      to = shiftDate(from, 6);
    }
    if (period === "month") {
      from = selected.slice(0, 7) + "-01";
      const next = new Date(from + "T12:00:00Z");
      next.setUTCMonth(next.getUTCMonth() + 1);
      to = shiftDate(next.toISOString().slice(0, 10), -1);
    }
    to = to > store.data.today ? store.data.today : to;
    void api<Analytics>(`/productivity/analytics?from=${from}&to=${to}`, {
      signal: c.signal,
    })
      .then((d) => {
        if (!c.signal.aborted) setChartDays(d.days);
      })
      .catch((e) => {
        if (!c.signal.aborted) setChartError(messageOf(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setChartLoading(false);
      });
    return () => c.abort();
  }, [selected, period, store.data]);

  const disabled = store.busy || store.loading || !store.settings;

  // Filter history items
  const filteredHistory = store.history.filter((item: FocusSession) => {
    if (historyFilter === "all") return true;
    if (historyFilter === "task") return Boolean(item.taskId);
    if (historyFilter === "goal") return Boolean(item.goalId);
    if (historyFilter.startsWith("task:"))
      return item.taskId === historyFilter.slice(5);
    if (historyFilter.startsWith("goal:"))
      return item.goalId === historyFilter.slice(5);
    return true;
  });

  return (
    <>
      <section className="card timer-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A MOMENT OF UNDISTRACTED YOU</span>
            <h2>Make space for deep work.</h2>
          </div>
          <Link className="round-link" to="/insights" aria-label="View insights">
            <Sparkles size={16} />
          </Link>
        </div>

        <p className="muted">
          One session at a time. Progress is server-timed and saved to your
          account.
        </p>

        {/* Break Mode Banner / Timer */}
        {inBreak ? (
          <div className="break-mode-banner">
            <div className="break-header">
              <Coffee size={24} className="break-icon" />
              <div>
                <h3>Break in progress</h3>
                <p className="muted">
                  Relax, hydrate, or stretch. (Focus tracking is paused; break time
                  is not logged to records).
                </p>
              </div>
            </div>
            <div
              className="timer-face break-timer-face"
              role="timer"
              aria-label="Break countdown"
            >
              {String(Math.floor(breakRemaining / 60)).padStart(2, "0")}:
              {String(breakRemaining % 60).padStart(2, "0")}
            </div>
            <div className="break-progress-bar">
              <div
                className="break-progress-fill"
                style={{
                  width: `${Math.round(((breakTotalSeconds - breakRemaining) / breakTotalSeconds) * 100)}%`,
                }}
              />
            </div>
            <div className="timer-actions">
              <button
                className="primary-button"
                onClick={() => {
                  stopBreak();
                  if (!s) {
                    void store.change("/focus", {
                      taskId: taskId || null,
                      goalId: goalId || null,
                    });
                  }
                }}
              >
                <Play size={16} /> End break & Focus
              </button>
              <button className="secondary-button" onClick={stopBreak}>
                Close break
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Pomodoro Presets Selector */}
            <div className="preset-selector">
              <span className="preset-label">Preset:</span>
              <div className="preset-buttons" role="radiogroup">
                <button
                  type="button"
                  className={`preset-btn ${preset === "25_5" ? "active" : ""}`}
                  onClick={() => setPreset("25_5")}
                >
                  25/5 min (Classic)
                </button>
                <button
                  type="button"
                  className={`preset-btn ${preset === "50_10" ? "active" : ""}`}
                  onClick={() => setPreset("50_10")}
                >
                  50/10 min (Deep)
                </button>
                <button
                  type="button"
                  className={`preset-btn ${preset === "15_3" ? "active" : ""}`}
                  onClick={() => setPreset("15_3")}
                >
                  15/3 min (Sprint)
                </button>
                <button
                  type="button"
                  className={`preset-btn ${preset === "custom" ? "active" : ""}`}
                  onClick={() => setPreset("custom")}
                >
                  Custom
                </button>
                <button
                  type="button"
                  className={`preset-btn ${preset === "open" ? "active" : ""}`}
                  onClick={() => setPreset("open")}
                >
                  Open-ended
                </button>
              </div>
            </div>

            {preset === "custom" && (
              <div className="custom-preset-inputs">
                <label>
                  Focus (minutes)
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={customFocus}
                    onChange={(e) =>
                      setCustomFocus(
                        Math.max(1, Math.min(180, Number(e.target.value) || 1)),
                      )
                    }
                  />
                </label>
                <label>
                  Break (minutes)
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={customBreak}
                    onChange={(e) =>
                      setCustomBreak(
                        Math.max(1, Math.min(60, Number(e.target.value) || 1)),
                      )
                    }
                  />
                </label>
              </div>
            )}

            {/* Timer Face */}
            <div className="timer-face" role="timer" aria-label="Focused duration">
              {hours ? String(hours).padStart(2, "0") + ":" : ""}
              {String(Math.floor(seconds / 60) % 60).padStart(2, "0")}
              <span>:</span>
              {String(seconds % 60).padStart(2, "0")}
            </div>

            {/* Target Progress Bar */}
            {targetSeconds !== null && (
              <div className="timer-target-progress">
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="progress-meta">
                  <span>
                    Target: {presetFocusMinutes}m ({progressPercent}%)
                  </span>
                  {seconds >= targetSeconds && (
                    <span className="target-reached-pill">
                      ✓ Target Complete
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Target Reached Banner */}
            {targetAlerted && (
              <div className="target-reached-banner">
                <Sparkles size={16} />
                <span>
                  Target reached! You can wrap up or start your{" "}
                  {presetBreakMinutes}-minute break.
                </span>
                <button
                  type="button"
                  className="small-action-button"
                  onClick={() => startBreak(presetBreakMinutes)}
                >
                  <Coffee size={14} /> Start Break
                </button>
              </div>
            )}

            {s ? (
              <>
                <p className="muted session-meta">
                  {s.state === "running" ? "Focusing" : "Paused"} ·{" "}
                  {s.taskId
                    ? tasks.find((t) => t.id === s.taskId)?.title ||
                      "Linked task unavailable"
                    : "No linked task"}{" "}
                  ·{" "}
                  {s.goalId
                    ? goals.find((g) => g.id === s.goalId)?.title ||
                      "Linked goal unavailable"
                    : "No linked goal"}
                </p>
                <div className="timer-actions">
                  <button
                    className="primary-button"
                    disabled={disabled}
                    onClick={() =>
                      void store.change(
                        `/focus/${s.id}/${s.state === "running" ? "pause" : "resume"}`,
                      )
                    }
                  >
                    {s.state === "running" ? (
                      <Pause size={16} />
                    ) : (
                      <Play size={16} />
                    )}{" "}
                    {s.state === "running" ? "Pause" : "Resume"}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={disabled}
                    onClick={() => void store.change(`/focus/${s.id}/finish`)}
                  >
                    <Check size={16} /> Finish session
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => startBreak(presetBreakMinutes)}
                  >
                    <Coffee size={16} /> Take a break
                  </button>
                  <button
                    className="icon-button"
                    disabled={disabled}
                    aria-label="Discard session"
                    onClick={() => setDiscard(true)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                {discard && (
                  <div className="discard-confirm">
                    <p>
                      Discard this session? Its time will be excluded from
                      analytics.
                    </p>
                    <button
                      className="secondary-button"
                      onClick={() => setDiscard(false)}
                    >
                      Keep session
                    </button>
                    <button
                      className="secondary-button"
                      disabled={disabled}
                      onClick={() => {
                        setDiscard(false);
                        void store.change(`/focus/${s.id}/discard`);
                      }}
                    >
                      Confirm discard
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="focus-links">
                  <label>
                    Optional task
                    <select
                      value={taskId}
                      onChange={(e) => setTask(e.target.value)}
                    >
                      <option value="">No task</option>
                      {tasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Optional goal
                    <select
                      value={goalId}
                      onChange={(e) => setGoal(e.target.value)}
                    >
                      <option value="">No goal</option>
                      {goals
                        .filter((g) => !g.archived)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.title}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <div className="timer-actions">
                  <button
                    className="primary-button"
                    disabled={disabled}
                    onClick={() =>
                      void store.change("/focus", {
                        taskId: taskId || null,
                        goalId: goalId || null,
                      })
                    }
                  >
                    <Play size={16} /> Start focus
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => startBreak(presetBreakMinutes)}
                  >
                    <Coffee size={16} /> Break first
                  </button>
                </div>
              </>
            )}

            {/* Notification & Sound Quick Settings */}
            <div className="focus-notification-bar">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                />
                <Volume2 size={15} /> Sound chime on completion
              </label>
              <button
                type="button"
                className="text-link sound-preview-link"
                onClick={playChime}
              >
                Preview chime
              </button>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={notificationsEnabled}
                  onChange={async (e) => {
                    if (e.target.checked) {
                      const granted = await requestNotificationPermission();
                      setNotificationsEnabled(granted);
                    } else {
                      setNotificationsEnabled(false);
                    }
                  }}
                />
                <Bell size={15} /> Desktop notification
              </label>
            </div>
          </>
        )}

        <p className="muted timer-explanation">
          Keep StudyMomentum open while focusing. A 45-second server lease limits
          counting after connection loss; an expired session pauses and needs
          Resume. Paused time is excluded. Sessions stop counting after 24
          hours.
        </p>
        <Link className="text-link" to="/settings">
          Daily target: {store.settings?.dailyTargetMinutes ?? "—"} minutes ·
          change target & timezone
        </Link>
      </section>

      {/* Focus History Section */}
      <section className="card">
        <div className="section-heading">
          <h2>Focus history</h2>
          <label>
            Period
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="day">Day</option>
              <option value="week">Calendar week</option>
              <option value="month">Calendar month</option>
            </select>
          </label>
        </div>
        <label className="focus-history-date">
          Date in period
          <input
            type="date"
            max={store.data?.today}
            value={selected}
            onChange={(e) => setHistoryDate(e.target.value)}
          />
        </label>
        {chartLoading ? (
          <p role="status">Loading focus history…</p>
        ) : chartError ? (
          <p className="error-banner" role="alert">
            {chartError}
          </p>
        ) : (
          <ActivityChart days={chartDays} />
        )}

        <div className="history-filter-row">
          <h3>Recent sessions</h3>
          <div className="history-filters">
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              aria-label="Filter session history"
            >
              <option value="all">All sessions</option>
              <option value="task">Linked to any task</option>
              <option value="goal">Linked to any goal</option>
              {tasks.length > 0 && (
                <optgroup label="Specific task">
                  {tasks.map((t) => (
                    <option key={t.id} value={`task:${t.id}`}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
              )}
              {goals.length > 0 && (
                <optgroup label="Specific goal">
                  {goals.map((g) => (
                    <option key={g.id} value={`goal:${g.id}`}>
                      {g.title}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {!filteredHistory.length && (
          <p className="empty">
            {historyFilter === "all"
              ? "Start a session to make room for focused work."
              : "No sessions match the selected filter."}
          </p>
        )}
        <div className="focus-history">
          {filteredHistory.map((item: FocusSession) => {
            const linkedTask = item.taskId
              ? tasks.find((t) => t.id === item.taskId)
              : null;
            const linkedGoal = item.goalId
              ? goals.find((g) => g.id === item.goalId)
              : null;
            const mins = Math.floor(item.durationMs / 60000);
            const secs = Math.floor(item.durationMs / 1000) % 60;
            return (
              <div className="setting-row focus-history-item" key={item.id}>
                <div>
                  <div className="history-item-top">
                    <strong>
                      {dateInZone(
                        store.settings?.timeZone || "Africa/Kampala",
                        item.createdAt,
                      )}
                    </strong>
                    <span className={`status-pill status-${item.state}`}>
                      {item.state}
                    </span>
                  </div>
                  <p className="history-duration">
                    {mins > 0 ? `${mins}m ` : ""}
                    {secs}s
                    {linkedTask && (
                      <span className="linked-badge">
                        <ListTodo size={12} /> {linkedTask.title}
                      </span>
                    )}
                    {linkedGoal && (
                      <span className="linked-badge">
                        <Target size={12} /> {linkedGoal.title}
                      </span>
                    )}
                  </p>
                </div>
                <span>{item.id === s?.id ? "Current session" : "Saved"}</span>
              </div>
            );
          })}
        </div>
        <p className="muted">
          Charts include saved elapsed time in running, paused and finished
          sessions. Discarded sessions are excluded. Showing the latest 100
          sessions.
        </p>
      </section>
    </>
  );
}
