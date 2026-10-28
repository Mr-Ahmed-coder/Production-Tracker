# Phase 4 — Focus tracking & productivity analytics

Completed and verified on 22 October 2026. Scope is Phase 4 only. Existing React/TypeScript/Vite, Express/Mongoose authentication, tasks, notes, goals and habits are reused. No npm dependencies were added. The cream-and-lime layout, sidebar and dashboard cards are retained.

## Implemented features

- Server-timed focus sessions: start, pause, resume, finish, discard and heartbeat. Optional owned task/goal links. Running and paused sessions restore after refresh; activity persists across API restart and database reconnect.
- Configurable daily focus target (1–1440 whole minutes) and analytics timezone, in Settings. Default: 180 minutes and Africa/Kampala.
- Daily, Monday-based calendar-week and calendar-month focus charts with date selection. Recent 100-session history. Archived/discarded focus records are retained internally; discarded time is excluded.
- Real dashboard focus hours today, target progress and weekly chart. Existing task, goal, habit and note features remain functional.
- Analytics date filters (7/30/90 days, ending date), separate interactive focus/task/habit Recharts views, accessible values tables, weekly totals, current goal/milestone progress and daily target achievement counts. No combined productivity score or demo data.
- Daily Review: live daily activity summary; completed and unfinished due tasks; focus duration; completed habits; newly achieved milestones; editable reflections, challenges and tomorrow's priority; saved-review history and deletion with confirmation. One review per user/date with version conflict protection.
- All new APIs use existing HTTP-only cookie authentication and Origin/custom-header CSRF protection. Owner fields and client-supplied focus durations/timestamps are rejected. Linked records must belong to the authenticated user.

## Files created

- `backend/src/models/FocusSession.js`
- `backend/src/models/ProductivitySettings.js`
- `backend/src/models/DailyReview.js`
- `backend/src/domain/focus.js`
- `backend/src/domain/analytics.js`
- `backend/src/routes/focus.js`
- `backend/src/routes/productivity.js`
- `backend/test/productivity.test.js`
- `frontend/src/productivity/types.ts`
- `frontend/src/productivity/format.ts`
- `frontend/src/productivity/useProductivity.ts`
- `frontend/src/productivity/ActivityChart.tsx`
- `frontend/src/productivity/FocusPage.tsx`
- `frontend/src/productivity/FocusSettings.tsx`
- `frontend/src/productivity/AnalyticsPage.tsx`
- `frontend/src/productivity/DailyReviewPage.tsx`
- `docs/PHASE4.md` and Phase 4 screenshots.

## Files modified

- `backend/src/app.js`: authenticated route registration and conflict messages.
- `backend/src/config/database.js`: new model/index initialization.
- `backend/src/models/Task.js`, `backend/src/routes/tasks.js`: completion timestamps and optimistic concurrency.
- `backend/src/models/Goal.js`, `backend/src/routes/goals.js`: milestone achievement timestamps, preserving existing progress calculations.
- `frontend/src/App.tsx`: routes/navigation, saved focus integration, preferences, current-session status and dashboard card.
- `frontend/src/components/DashboardCards.tsx`: saved focus chart and daily review link.
- `frontend/src/styles.css`: responsive, consistent focus/review/analytics styling.
- `README.md`: current Phase 4 handoff, functionality and verification. Backend source was also formatted; notes route changes from that pass are formatting only.

## Database collections and indexes

Existing collections retained: `users`, `sessions`, `tasks`, `notes`, `goals`, `habits`, `habitcompletions`.

Added:

| Collection             | Contents                                                                             | Indexes                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `focussessions`        | Owner, state, active flag, links, server-recorded intervals, lease and end timestamp | Unique partial `(user, active)` for active=true; `(user, createdAt desc)` |
| `productivitysettings` | Owner, timezone, daily target minutes                                                | Unique owner                                                              |
| `dailyreviews`         | Owner, date, reflection/challenges/priority, timestamps, version                     | Unique `(user, date)`                                                     |

Tasks have an optional `completedAt`. Embedded goal milestones have an optional `achievedAt`. Existing records are not backfilled, deleted or assigned invented completion dates. No destructive migration is required. Starting the backend initializes the new indexes.

## API reference

All paths below are under `/api` and require authentication.

| Method/path                                                 | Behavior                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| GET `/focus/active`                                         | Current running/paused session, or null; expired leases normalize to paused    |
| GET `/focus`                                                | Most recent 100 non-discarded sessions                                         |
| POST `/focus`                                               | Start; optional `taskId`, `goalId` (or empty object)                           |
| POST `/focus/:id/pause`                                     | Close current interval and pause                                               |
| POST `/focus/:id/resume`                                    | Open a new interval if paused and under session limit                          |
| POST `/focus/:id/heartbeat`                                 | Renew a running lease; never implicitly resume an expired lease                |
| POST `/focus/:id/finish`                                    | Close interval and finish; retry is idempotent                                 |
| POST `/focus/:id/discard`                                   | Retain record but exclude its time; retry is idempotent                        |
| GET/PUT `/productivity/settings`                            | Read/change `timeZone`, `dailyTargetMinutes`                                   |
| GET `/productivity/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` | Saved activity over at most 92 elapsed calendar dates; default last 30 days    |
| GET `/productivity/reviews`                                 | Saved review list                                                              |
| GET `/productivity/reviews/:date`                           | Reflection plus live summary                                                   |
| PUT `/productivity/reviews/:date`                           | Save three text fields and `version` (null for new, returned version for edit) |
| DELETE `/productivity/reviews/:date`                        | Delete only the authenticated owner's reflection; source activity retained     |

Focus actions take an empty JSON object. They do not accept arbitrary duration, owner, state or timing fields. Missing/cross-owner resources return 404; bad input 400; concurrent/stale/duplicate changes 409; database outages use the existing safe 503 handler.

## Transparent calculation rules

1. **Focus duration:** sum of positive closed intervals plus a running interval through min(server now, lease expiry). Paused intervals add nothing. Discarded sessions contribute nothing. A unique active-session index and optimistic document versions prevent overlapping sessions and duplicate interval writes.
2. **Interruptions:** the browser renews a 45-second lease every 15 seconds while the authenticated application is mounted, including on other app pages. After a browser crash/close, lost connectivity, throttled background tab or suspended device, time is capped at the last lease. Reconnecting after expiry pauses the session and requires an explicit Resume. Up to 45 seconds after the last successful heartbeat can still count. The timer records user-declared focus, not proof of attention. There is no offline duration backfill.
3. **Session bound:** each session may count only within 24 hours of creation; paused sessions can still be finished/discarded later. Refresh never starts a new session. UI interpolation uses a monotonic clock and never supplies persisted time.
4. **Daily allocation:** actual UTC intervals are split at calendar midnight in the saved analytics timezone. Binary boundary searches support DST (23/25-hour dates) and fractional-hour offsets. Weeks start Monday. Calendar-month charts include only elapsed dates. Changing analytics timezone regroups timestamp-based history.
5. **Target achievement:** focused milliseconds / (current daily target minutes × 60,000). Display percentage is rounded and capped at 100. Achievement count includes days meeting that current target, including historical dates; targets are not historical snapshots.
6. **Task planning:** planned = existing tasks currently due on that date; due tasks completed = that cohort's current completed count. Completed on date = currently completed tasks with a known completion timestamp on that date, irrespective of due date. Reopening clears completion time; completing again records the new time. Editing title/priority preserves it. Due-date edits regroup planned counts; deleted tasks disappear. This is a live view, not a permanent audit log.
7. **Legacy tasks:** imported/pre-Phase-4 completed records with no known completion time count in their due-date cohort, but not completion-date trends. Analytics explicitly reports how many are excluded.
8. **Goals:** existing equal-weight average of milestone current/target ratios; goals without milestones use existing status behavior. Achievement timestamps are set on crossing a milestone target, preserved while it stays achieved, and cleared if reopened. Re-achieving records the new crossing. Already-completed legacy milestones retain unknown achievement dates and are not assigned today's date. Goal widgets show current state, independent of the selected trend range.
9. **Habits:** completed scheduled dates / elapsed scheduled dates. Schedule versions, archived intervals and each habit's timezone determine eligibility; future and unscheduled dates are excluded. Habit dates retain their own local calendar labels when aggregated alongside analytics dates. Percentages are not interchangeable with goal progress, task completion or time.
10. **Daily reviews:** text is saved once per owner/date and can be edited. Summaries are freshly calculated when opened/saved rather than frozen copies, so record edits/reopening/deletions are reflected. Future reviews are rejected.

## Verification

- `npm run lint`: passed, zero warnings/errors.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm test`: **52 passed, 0 failed, 0 skipped**. Existing Phase 1–3 regressions remain passing. New coverage includes server timing, pause exclusion, leases, concurrent starts/actions, duplicate prevention, isolation, invalid requests, settings, midnight/DST boundaries, analytics exclusion rules, task edits/deletion, milestone transitions, review CRUD/version conflicts, API restart and database reconnection.
- Automated destructive tests run exclusively in isolated MongoDB test processes, never against the persistent personal database.
- Persistent **local MongoDB** `127.0.0.1:27017/prodtrack`: connected; ping=1; new unique indexes verified. No Atlas connection or credentials used.
- Browser workflows at separate QA ports 4107/5177: existing verification-account login; linked focus start; pause at 23 seconds; refresh preserved 23 seconds; resume/navigation; finish at 38 seconds; second-session discard; target change to 120 minutes; review create/edit/revisit; task completion and milestone achievement appearing in real summaries; 7-day analytics filter and chart values; calendar-month history.
- Saved focus, review, settings and authentication survived a full QA API process restart against persistent local MongoDB.
- Desktop 1280×900 and mobile 390×844: review, analytics, focus and dashboard/navigation checked; no horizontal page overflow. Browser console check reported no warnings/errors.
- Verification used only the existing disposable local verification account. Its records remain for inspection. No existing personal records were deleted. Only separate QA services were stopped; the normal development server and MongoDB Windows service were preserved.

Screenshots: `phase4-dashboard-desktop.png`, `phase4-review-desktop.png`, `phase4-review-mobile.png`, `phase4-analytics-mobile.png`. They show verification data only.

## Local startup

Keep the existing ignored `backend/.env` with `MONGODB_URI=mongodb://127.0.0.1:27017/prodtrack`. No new environment secrets or services are required. The MongoDB Windows service must be running.

```powershell
cd "C:\Users\HP\OneDrive\Desktop\Production Track\ProdTrack"
npm run dev
```

Or separately from the same root: `npm run dev -w frontend` and `npm run dev -w backend`. Frontend: http://127.0.0.1:5173. API health: http://127.0.0.1:4000/api/health. Restart an existing backend started without watch mode to load these changes.

## Remaining limitations

- Focus tracking uses a bounded online lease, not background OS tracking or verified attention. Suspended/throttled tabs can pause tracking; users must resume. There is no offline synchronization or manual backdating/editing of focus durations.
- Session history lists the latest 100; analytics requests are limited to 92 days at a time. Tasks, goals and review lists still load an account's records without pagination. No production-scale load test was run.
- Historical targets are evaluated using today's preference. Daily reviews and analytics reflect current source records, not an immutable activity audit trail. Legacy completion dates remain unknown.
- Default timezone is Africa/Kampala until changed in Settings. Individual habit timezones remain fixed as in Phase 3. Reflection text is plain text.
- MongoDB service restart, backup/restore, HTTPS deployment and exhaustive device/browser combinations were not tested. No push, merge, deployment, Phase 5, AI or collaboration work was performed.
