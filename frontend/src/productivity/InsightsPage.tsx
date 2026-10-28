import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Flame,
  Target,
  ArrowRight,
  HelpCircle,
  Info,
} from "lucide-react";
import { api, messageOf } from "../lib/api";
import type { Insights } from "./types";

export function InsightsPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    api<Insights>("/productivity/insights", { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) setData(res);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(messageOf(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <section className="card">
        <p role="status">Analyzing your productivity patterns…</p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="card">
        <p className="error-banner" role="alert">
          {error || "Unable to load personal insights."}
        </p>
      </section>
    );
  }

  const {
    sufficientData,
    sufficiencyNotice,
    activeDaysCount,
    weeklyComparison,
    focusConsistency,
    taskPatterns,
    habitAdherence,
    goalProgress,
    suggestions,
    explanations,
  } = data;

  return (
    <div className="insights-view">
      {/* Header */}
      <section className="card insights-hero-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">PERSONAL PRODUCTIVITY INSIGHTS</span>
            <h2>Actionable patterns, verified data.</h2>
          </div>
          <span className="insights-badge">
            <Sparkles size={14} /> Real Recorded Metrics
          </span>
        </div>
        <p className="muted">
          All insights are derived deterministically from your actual focus
          intervals, task completions, habit records, and goal milestones. No
          fabricated scores or black-box predictions.
        </p>

        {!sufficientData && sufficiencyNotice && (
          <div className="sufficiency-callout">
            <Info size={18} className="callout-icon" />
            <div>
              <strong>Building your activity baseline</strong>
              <p>
                {sufficiencyNotice} (Currently recorded: {activeDaysCount} active
                day{activeDaysCount === 1 ? "" : "s"}).
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Practical Improvement Suggestions */}
      {suggestions.length > 0 && (
        <section className="card suggestions-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">ACTIONABLE NEXT STEPS</span>
              <h3>Recommended focus priorities</h3>
            </div>
          </div>
          <div className="suggestions-grid">
            {suggestions.map((s, idx) => (
              <div className="suggestion-item" key={idx}>
                <div className="suggestion-top">
                  <span className="suggestion-indicator" />
                  <h4>{s.title}</h4>
                </div>
                <p>{s.message}</p>
                {s.actionTo && s.actionLabel && (
                  <Link to={s.actionTo} className="suggestion-link">
                    {s.actionLabel} <ArrowRight size={13} />
                  </Link>
                )}
              </div>
            ))}
          </div>
          <details className="insight-calculation-detail">
            <summary>
              <HelpCircle size={13} /> How suggestions are generated
            </summary>
            <p>{explanations.suggestions}</p>
          </details>
        </section>
      )}

      {/* Weekly Performance Comparison */}
      <section className="card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">WEEK OVER WEEK</span>
            <h3>Performance comparison</h3>
          </div>
          <span className="muted">Monday–Sunday calendar cadence</span>
        </div>

        <div className="insights-comparison-grid">
          {/* Focus Time Card */}
          <div className="stat-card">
            <div className="stat-heading">
              <span>Focus Hours</span>
              <Clock size={16} />
            </div>
            <div className="stat-bottom">
              <div className="stat-value">
                {weeklyComparison.thisWeek.focusHours}
                <span>h</span>
              </div>
              <span className="comparison-subtext">
                vs {weeklyComparison.lastWeek.focusHours}h last week (
                <strong
                  className={
                    weeklyComparison.focusChangeHours >= 0
                      ? "trend-positive"
                      : "trend-negative"
                  }
                >
                  {weeklyComparison.focusChangeHours >= 0 ? "+" : ""}
                  {weeklyComparison.focusChangeHours}h
                </strong>
                )
              </span>
            </div>
          </div>

          {/* Tasks Completed Card */}
          <div className="stat-card">
            <div className="stat-heading">
              <span>Tasks Completed</span>
              <CheckCircle2 size={16} />
            </div>
            <div className="stat-bottom">
              <div className="stat-value">
                {weeklyComparison.thisWeek.tasksCompleted}
                <span>done</span>
              </div>
              <span className="comparison-subtext">
                vs {weeklyComparison.lastWeek.tasksCompleted} last week (
                <strong
                  className={
                    weeklyComparison.tasksChange >= 0
                      ? "trend-positive"
                      : "trend-negative"
                  }
                >
                  {weeklyComparison.tasksChange >= 0 ? "+" : ""}
                  {weeklyComparison.tasksChange}
                </strong>
                )
              </span>
            </div>
          </div>

          {/* Habit Consistency Card */}
          <div className="stat-card">
            <div className="stat-heading">
              <span>Habit Consistency</span>
              <TrendingUp size={16} />
            </div>
            <div className="stat-bottom">
              <div className="stat-value">
                {weeklyComparison.thisWeek.habitConsistency !== null
                  ? `${weeklyComparison.thisWeek.habitConsistency}%`
                  : "—"}
              </div>
              <span className="comparison-subtext">
                {weeklyComparison.lastWeek.habitConsistency !== null
                  ? `vs ${weeklyComparison.lastWeek.habitConsistency}% last week`
                  : "No prior week schedule"}
              </span>
            </div>
          </div>
        </div>

        {/* Best Day Highlight */}
        {weeklyComparison.bestDay && (
          <div className="highlight-callout">
            <Calendar size={18} className="highlight-icon" />
            <div>
              <strong>
                Peak Focus Day: {weeklyComparison.bestDay.day}s
              </strong>
              <p>
                You average {weeklyComparison.bestDay.averageHours} hours of
                focused work on {weeklyComparison.bestDay.day}s. Schedule complex
                work on this day to capitalize on your natural rhythm.
              </p>
            </div>
          </div>
        )}

        <details className="insight-calculation-detail">
          <summary>
            <HelpCircle size={13} /> How weekly performance is calculated
          </summary>
          <p>
            {explanations.weeklyComparison} {explanations.bestDay}
          </p>
        </details>
      </section>

      {/* Focus Consistency & Streaks */}
      <section className="card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">CONSISTENCY PATTERNS</span>
            <h3>Daily focus target adherence</h3>
          </div>
          <span className="muted">
            Target: {data.dailyTargetMinutes} min/day
          </span>
        </div>

        <div className="records-grid">
          <div className="setting-row">
            <div>
              <strong>Current Target Streak</strong>
              <p>
                Consecutive days meeting your {data.dailyTargetMinutes}-minute
                focus target.
              </p>
            </div>
            <span className="status done">
              <Flame size={14} /> {focusConsistency.currentTargetStreak} day
              {focusConsistency.currentTargetStreak === 1 ? "" : "s"}
            </span>
          </div>

          <div className="setting-row">
            <div>
              <strong>Longest Target Streak</strong>
              <p>Your best streak of meeting the target in the last 30 days.</p>
            </div>
            <span className="big-number-small">
              {focusConsistency.longestTargetStreak} days
            </span>
          </div>

          <div className="setting-row">
            <div>
              <strong>Target Attainment (Last 14 Days)</strong>
              <p>Days focus target was reached.</p>
            </div>
            <span className="big-number-small">
              {focusConsistency.daysMetTargetLast14} of 14 days
            </span>
          </div>

          <div className="setting-row">
            <div>
              <strong>Weekday vs Weekend Distribution</strong>
              <p>
                {focusConsistency.weekdayPercent}% weekdays ·{" "}
                {focusConsistency.weekendPercent}% weekends (Past 30d:{" "}
                {focusConsistency.totalFocusPast30Hours}h total)
              </p>
            </div>
            <span className="status done">
              {focusConsistency.weekdayPercent > 70 ? "Weekday-Focused" : "Balanced"}
            </span>
          </div>
        </div>

        <details className="insight-calculation-detail">
          <summary>
            <HelpCircle size={13} /> How focus consistency is calculated
          </summary>
          <p>{explanations.focusConsistency}</p>
        </details>
      </section>

      {/* Task Completion Patterns */}
      <section className="card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">TASK VELOCITY</span>
            <h3>Completion patterns & priorities</h3>
          </div>
          <Link to="/tasks" className="text-link">
            Manage tasks <ArrowRight size={13} />
          </Link>
        </div>

        <div className="activity-stats">
          <div>
            <span>Total Tasks</span>
            <strong>{taskPatterns.total}</strong>
          </div>
          <div>
            <span>Completed</span>
            <strong>{taskPatterns.completed}</strong>
          </div>
          <div>
            <span>Completion Rate</span>
            <strong>{taskPatterns.completionRate}%</strong>
          </div>
          <div>
            <span>Overdue Backlog</span>
            <strong
              className={
                taskPatterns.overdueCount > 0 ? "trend-negative" : ""
              }
            >
              {taskPatterns.overdueCount}
            </strong>
          </div>
        </div>

        {/* Priority Breakdown */}
        <h4>Completion by Priority</h4>
        <div className="priority-bars-container">
          {(["High", "Medium", "Low"] as const).map((p) => {
            const stat = taskPatterns.priorityBreakdown[p];
            const pct =
              stat.total > 0
                ? Math.round((stat.completed / stat.total) * 100)
                : 0;
            return (
              <div className="priority-bar-row" key={p}>
                <span className="priority-label">{p} Priority:</span>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="priority-meta">
                  {stat.completed}/{stat.total} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>

        {/* Overdue tasks warning */}
        {taskPatterns.overdueTasks.length > 0 && (
          <div className="overdue-list-card">
            <div className="overdue-title">
              <AlertCircle size={15} />
              <strong>{taskPatterns.overdueCount} Overdue Task(s)</strong>
            </div>
            <ul className="overdue-items">
              {taskPatterns.overdueTasks.map((t) => (
                <li key={t.id}>
                  <span>{t.title}</span>
                  <span className="overdue-due">Due {t.dueDate}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <details className="insight-calculation-detail">
          <summary>
            <HelpCircle size={13} /> How task patterns are calculated
          </summary>
          <p>{explanations.taskPatterns}</p>
        </details>
      </section>

      {/* Habit Adherence & Goals */}
      <div className="records-grid">
        {/* Habit Card */}
        <section className="card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">HABIT ADHERENCE</span>
              <h3>Routine consistency</h3>
            </div>
            <Link to="/habits" className="text-link">
              View habits <ArrowRight size={13} />
            </Link>
          </div>

          <div className="setting-row">
            <div>
              <strong>Active Habits</strong>
              <p>Currently tracked habits.</p>
            </div>
            <span className="big-number-small">
              {habitAdherence.activeCount}
            </span>
          </div>

          <div className="setting-row">
            <div>
              <strong>Average Consistency</strong>
              <p>Scheduled elapsed days completed.</p>
            </div>
            <span className="big-number-small">
              {habitAdherence.overallConsistency}%
            </span>
          </div>

          {habitAdherence.mostConsistentHabit && (
            <div className="setting-row">
              <div>
                <strong>Most Consistent Habit</strong>
                <p>{habitAdherence.mostConsistentHabit.title}</p>
              </div>
              <span className="status done">
                <Flame size={13} />{" "}
                {habitAdherence.mostConsistentHabit.streak} streak ·{" "}
                {habitAdherence.mostConsistentHabit.consistency}%
              </span>
            </div>
          )}

          <details className="insight-calculation-detail">
            <summary>
              <HelpCircle size={13} /> How habit adherence is calculated
            </summary>
            <p>{explanations.habitAdherence}</p>
          </details>
        </section>

        {/* Goal Highlights Card */}
        <section className="card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">GOAL MILESTONES</span>
              <h3>Progress highlights</h3>
            </div>
            <Link to="/goals" className="text-link">
              View goals <ArrowRight size={13} />
            </Link>
          </div>

          <div className="setting-row">
            <div>
              <strong>Active Goals</strong>
              <p>Goals currently underway.</p>
            </div>
            <span className="big-number-small">{goalProgress.active}</span>
          </div>

          <div className="setting-row">
            <div>
              <strong>Milestone Achievements</strong>
              <p>Milestones crossed to date.</p>
            </div>
            <span className="big-number-small">
              {goalProgress.achievedMilestones} of {goalProgress.totalMilestones}
            </span>
          </div>

          {goalProgress.nearCompletion.length > 0 && (
            <div className="setting-row">
              <div>
                <strong>Near Completion</strong>
                <p>{goalProgress.nearCompletion[0].title}</p>
              </div>
              <span className="status done">
                <Target size={13} /> {goalProgress.nearCompletion[0].progress}%
              </span>
            </div>
          )}

          <details className="insight-calculation-detail">
            <summary>
              <HelpCircle size={13} /> How goal progress is calculated
            </summary>
            <p>
              Evaluates milestone achievement ratios and highlights milestones
              approaching completion.
            </p>
          </details>
        </section>
      </div>
    </div>
  );
}
