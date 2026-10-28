# Phase 3 completion review — local MongoDB

Verified on 22 October 2026 against the persistent local database `mongodb://127.0.0.1:27017/prodtrack`. No Atlas connection was used.

## Scope

The existing notes/journal, goals/milestones, habit calendars, authentication and task modules were inspected and reused. This review completed the missing habit progress charts and stronger duplicate habit-definition protection. No new dependencies were added and the cream-and-lime design was retained.

## Changes in this review

- `backend/src/domain/calendar.js`: eight Monday-based weeks of completed and scheduled counts, computed from the same saved timezone/schedule/archive history as streaks. Only dates through local today count.
- `backend/src/domain/habitIdentity.js` (new): case/whitespace/canonical-Unicode normalization for habit names.
- `backend/src/models/Habit.js`: optional internal titleKey and unique partial owner/titleKey index. Old records remain untouched.
- `backend/src/routes/habits.js`: reject duplicate creates and renames, including matches against pre-existing records without titleKey.
- `backend/src/app.js`: specific HTTP 409 duplicate-name message, including database-index conflicts from concurrent requests.
- `backend/test/calendar.test.js`, `backend/test/modules.test.js`: weekly totals, normalization, concurrent duplicate creates, owner-specific identity, archived names, and compatibility with legacy habit definitions.
- `frontend/src/modules/HabitProgressChart.tsx` (new): responsive Recharts bar chart, saved scheduled/completed counts, keyboard-accessible chart values table and empty state.
- `frontend/src/modules/HabitsPage.tsx`: chart in each habit record.
- `frontend/src/modules/GoalsPage.tsx`: each milestone now explicitly displays its completion percentage and current/target amounts.
- `frontend/src/modules/types.ts`: typed weekHistory response.
- `frontend/src/styles.css`: chart/table styles matching the current design.
- README and Phase 3 documentation: current verification and limits.

## Duplicate habit rules

New and renamed habits use a name key scoped to the authenticated user. Capitalization, repeated whitespace and canonical Unicode differences do not create separate habits. Archived habits retain their names: restore or edit the original instead of creating another. Another user may independently use the same habit name.

The partial unique index protects concurrent new creates/renames without rewriting historical records. Existing legacy duplicates, if any, are preserved rather than merged or deleted. API requests also check legacy names before creating or renaming. Existing duplicate legacy habits need distinct names when renamed; no automatic cleanup is performed.

Completion uniqueness remains separate: one completion per habit/date, protected by the existing unique index.

## Charts and percentages

Habit charts compare completed and scheduled days over the last eight calendar weeks, including the current partial week. Future and unscheduled dates and archive periods are excluded. Weekly totals are derived on the backend from saved data. The chart does not invent productivity scores. A values table exposes the exact numbers without requiring interaction with a graph.

Milestone percentages display current/target × 100, rounded; the overall goal remains the rounded average of milestone ratios. Existing status and task-link behavior is unchanged.

## Database collections

The local `prodtrack` database has the application's collections:

- users
- sessions
- tasks
- notes
- goals (milestones embedded in goals)
- habits
- habitcompletions

The local connection, database ping, model/index initialization and new unique habit-name index were verified. No credentials were printed.

## Verification results

- `npm run lint`: passed with zero warnings/errors.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm test`: **38 checks passed, 0 failed, 0 skipped**, using isolated real MongoDB processes for automated destructive tests.
- Existing authentication, cookie, CSRF, task CRUD/import, record isolation, notes/journal, goals/milestones, habit dates/streaks and duplicate-completion regressions passed.
- Four additional checks cover weekly totals, name normalization, duplicate definitions/concurrency and legacy preservation.

Browser verification additionally used a newly created disposable verification account in the **persistent local MongoDB**, through separate QA ports (API 4107, frontend 5177). The normal running development server was left alone.

Verified local workflows: registration, task creation, goal/task linking, milestone advancement from 25% to 50%, note creation/edit/search/pin with goal/task links, daily journal creation/reopening, daily habit creation, historical completion, chart values, duplicate-name errors and selected-weekday editing. The chart correctly showed three completed days out of four scheduled elapsed days in the current week. Notes, goals, habit history and the authenticated session survived an API restart.

Desktop and mobile checks included charts and the note/journal editor. No horizontal overflow was observed at the checked 1280px and 390px viewports. Screenshots show only verification data.

The disposable verification account was signed out, and only the separately started QA services were stopped. Automatic approval review rejected removing the disposable account and its records because irreversible deletion was not explicitly authorized. Those verification records remain pending user approval. Existing user records, the normal development server and the MongoDB Windows service were preserved.

## Running the application

Use the existing local `backend/.env` and start from the project root:

```powershell
cd "C:\Users\HP\OneDrive\Desktop\Production Track\ProdTrack"
npm run dev
```

If the current backend is not using watch mode, restart its development command to load the updated routes. Normal frontend URL: http://127.0.0.1:5173.

## Remaining limits

Notes are plain text; record lists have no pagination or offline synchronization. Habit timezone and start date remain fixed after creation to preserve history. Legacy duplicate names are not automatically merged. Chart history is limited to the last eight weeks; older completion history remains accessible through the calendar. Focus charts remain explicitly illustrative and the focus timer remains session-only. MongoDB backup/restore and restarting the MongoDB Windows service itself were not tested.

No Phase 4 features, deployment, GitHub push, force-push or merge were performed.

Implementation references: [MongoDB partial indexes](https://www.mongodb.com/docs/manual/core/index-partial/) and [Recharts BarChart](https://recharts.github.io/en-US/api/BarChart/).
