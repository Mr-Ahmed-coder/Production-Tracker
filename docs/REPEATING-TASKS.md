# Repeating tasks and date ranges

Implemented in the existing StudyMomentum calendar on 18 November 2026. No dependencies, authentication configuration, hosting services or environment secrets were changed. This update is local; no push or deployment was performed.

## Workflow

Choose **Repeat task** on Calendar, or **Repeat across a date range** in its Add Activity task form. Enter a title, start/end dates, daily or selected-weekday schedule, optional priority and description. Presets select 7, 14 or 30 calendar days. The range includes both endpoints and is limited to 30 days. November 18 through December 17 is exactly 30 daily occurrences.

Each date has its own checkbox in the existing month/week grid and full daily panel. Check/uncheck changes only that dated occurrence. Normal one-time tasks and Habits keep their existing APIs and scheduling behavior.

Open **Manage repeating tasks** or a dated row's **Edit series** control to edit the definition. Skipped dates can be restored in that dialog. Stopping future repetitions requires confirmation and retains today and all completed occurrences. Removing a series also requires confirmation: unfinished occurrences disappear, but completed records remain visible as read-only history. Removal is soft; it never physically deletes completion records.

## Data architecture

New Mongoose collections:

- `recurringtasks`: one owner-scoped definition containing title, description, priority, inclusive start/end dates, weekdays, captured timezone, stop/removal state and optimistic version. Unique `(user, createKey)` prevents duplicate create retries; a validated payload fingerprint rejects accidental key reuse for different content.
- `taskoccurrences`: exceptions/completion state keyed uniquely by `(user, series, date)`. Records are created only when a date is touched, not pre-created as 30 unrelated Tasks. Completion stores a server timestamp and a content snapshot. Unchecking clears the current completion timestamp but retains the record and its last completion timestamp.

Untouched occurrences are generated from the series date range. Completed records survive range, weekday, title and stop changes, including dates outside the revised schedule. Their original completed title/priority/description remain frozen. Skips affect only one date. Concurrent writes use unique indexes and optimistic concurrency; conflicts require refreshing rather than creating duplicates.

The saved analytics timezone is captured when a series is created and then remains fixed. Calendar labels are date-only and advance by calendar days, so DST does not shorten or duplicate the 30-day range. Stopping uses today in that series timezone. Completion timestamps always use actual server time, never the selected planned date. Future task occurrences can be completed in advance, like ordinary tasks; future habits retain their stricter existing rules.

## APIs

All endpoints are authenticated and scoped to `req.user`.

| Endpoint | Purpose |
| --- | --- |
| GET `/api/recurring-tasks?page=1` | Paginated definitions, 20 per page, excluding removed definitions |
| POST `/api/recurring-tasks` | Create one definition with title, startDate, endDate, weekdays, optional priority/description and createKey |
| GET `/api/recurring-tasks/:id` | Definition, version and skipped dates |
| PATCH `/api/recurring-tasks/:id` | Edit series with the returned version; completed snapshots retained |
| PUT `/api/recurring-tasks/:id/occurrences/:date` | Set either completed or skipped, separately |
| POST `/api/recurring-tasks/:id/stop` | Require confirm=true; stop incomplete future dates |
| DELETE `/api/recurring-tasks/:id` | Require confirm=true; soft-remove definition, retain completed history |

The existing calendar range response adds `days[].recurringTasks` and still loads only the requested period. Ordinary Task and Habit records are not duplicated or rewritten.

## Analytics and other modules

Recurring occurrences contribute to planned/completed task totals and the dashboard's daily count. Their planned cohort uses the occurrence date; ordinary task cohorts continue using due dates. Completion-date trends use actual completion timestamps in the current analytics timezone, including completion of a planned date outside the selected trend range. Separate recurringPlanned/recurringCompleted counts remain available in analytics data. Skips are excluded. Retained completed history continues contributing after a series changes or is removed.

Analytics, Insights and Daily Review reuse the existing activity calculations. Chart labels distinguish planned/due tasks from completion-date totals. Repeating series are managed from Calendar; the existing Tasks list continues to manage one-time tasks. JSON export and the combined CSV export include definitions and dated states, without create fingerprints or credentials in the JSON payload. Existing per-entity one-time Tasks CSV behavior remains unchanged.

## Changed files

Created:

- backend/src/models/RecurringTask.js
- backend/src/models/TaskOccurrence.js
- backend/src/domain/recurringTasks.js
- backend/src/routes/recurringTasks.js
- backend/test/recurring-tasks.test.js
- frontend/src/modules/RepeatingTaskDialog.tsx
- docs/REPEATING-TASKS.md and repeating-task screenshots

Modified:

- backend/src/app.js, backend/src/config/database.js
- backend/src/routes/calendar.js
- backend/src/domain/analytics.js, backend/src/domain/export.js
- frontend/src/App.tsx, frontend/src/modules/CalendarPage.tsx
- frontend/src/components/TaskDialog.tsx, frontend/src/components/DashboardCards.tsx
- frontend/src/productivity/types.ts, ActivityChart.tsx, AnalyticsPage.tsx, DailyReviewPage.tsx
- frontend/src/styles.css and README.md

## Verification

The complete 65-test baseline passed. The extended suite passed **77 tests with no failures or skips**, covering range validation, exact 30-day generation, weekdays, leap/DST calendar dates, retry-safe creation, independent completions, concurrency, ownership, actual timestamps, snapshots after edits, skips/restoration, stop/removal confirmation, saved timezone behavior, analytics, exports and database reconnection. Existing ordinary Tasks, Habits, authentication and all other regression tests passed.

Lint, TypeScript and production build passed after implementation. Final command-line verification was rerun after the environment reconnect; see the final delivery message for its result.

Browser checks used an isolated local MongoDB preview and synthetic records only. Verified:

- Creating the exact 30-day November 18–December 17 example.
- Checking today leaves tomorrow incomplete; both states survive refresh.
- December 17 appears and December 18 is excluded for the initial range.
- Skipping one occurrence and restoring it via series management.
- Editing range, title and weekdays preserves the original completed date and its title while removing an unscheduled Thursday.
- Desktop calendar and mobile form/week layouts; no horizontal page overflow at the checked 1440x1050 and 390x844 viewports.

Screenshots: [Desktop calendar](repeating-tasks-calendar.jpg), [Mobile form](repeating-tasks-mobile-form.jpg).

The browser automation runtime disconnected during the final stop-series UI check. That specific browser workflow and the final post-edit removal UI were not completed. Stop/removal behavior, confirmations and historical preservation passed automated API tests. One interrupted browser probe also targeted an unscheduled date after the selection changed; it is not counted as a passing UI check. Atlas and production deployment were not accessed.

## Release and limits

Release the backend first, allowing the two new collections/indexes to initialize, then release the frontend after staging verification. No destructive migration or new environment variable is required. Stopped series do not auto-resume; create a new run to start again. Historical completed dates may remain outside an edited 30-day window by design. Removing a series keeps completed history rather than providing a hard-purge feature. There is no external calendar sync or per-occurrence title/date editing.
