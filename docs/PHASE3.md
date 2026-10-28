# ProdTrack Phase 3 — Notes, Goals and Habits

The completed checklist, real habit charts, duplicate-name protection and persistent local MongoDB browser verification are documented in [Phase 3 local verification](PHASE3-LOCAL-VERIFICATION.md).

**Local database setup added after Phase 3 verification:** ProdTrack now uses the persistent local `prodtrack` database. Connection, index initialization, ping and normal API health were verified on 22 October 2026. See [Local MongoDB setup](LOCAL_MONGODB.md). The isolated-only verification statement below describes the original Phase 3 test run.

Phase 3 builds on the existing cookie authentication and private MongoDB task APIs. The cream-and-lime dashboard, sidebar, task controls, local-task import and focus timer are retained. No new dependencies were added.

## Notes and daily journal

Notes have a title, plain-text content (up to 20,000 characters), category, up to 10 tags, a pin flag and creation/update timestamps. Search titles, content or tags; filter by category, tag, or note/journal type. Open any note to read or edit its full content. Pin, edit and delete through the existing design language.

A journal entry is a note with a calendar-date key. Each user can have one entry per date. The Today's journal button opens an existing entry instead of creating another. The date can also be selected in the editor. Unchecking Daily journal entry converts it to an ordinary note when saved.

Optional goal and task links are checked against the authenticated owner's records. Deleting a linked task or goal never deletes the note. The editor identifies missing links and lets the user clear them explicitly; there are no cascading deletions.

## Goals and milestones

Goals support description, category, short/long term, target date, active/paused/completed status and archive/restore. The timeline lists saved upcoming goals in target-date order. Its cards retain the original staggered layout; they are not duration bars.

Milestones have their own IDs, titles, target/current numerical amounts, units and optional dates. The goal editor supports adding, editing and removing milestones. The inline Update progress form advances any milestone without requiring tasks.

Progress is computed on the server as the rounded average of each milestone's current/target ratio. Targets must be positive and current amounts must be between zero and the target. For example, 5/10 books and 2/2 reviews produce 75%. A goal without milestones is 0%, or 100% when manually marked completed. Goal status is an explicit user choice and does not automatically change when the percentage changes.

Tasks are optional links stored on the goal. Existing Task documents and task APIs did not need schema changes. A submitted milestone ID must already belong to that goal; task references must belong to the current user. Goal deletion removes only the goal and its embedded milestones, preserving tasks and notes.

## Habits, dates and history

Each habit saves a title, category, start date, IANA timezone, scheduled weekdays and archive history. The initial timezone defaults to the browser's timezone and can be selected at creation. It remains fixed afterward to preserve the meaning of historical date keys. All-seven weekdays means daily; choose fewer for selected-weekday habits.

The backend derives today with Intl.DateTimeFormat in the saved timezone. It performs date arithmetic on plain calendar dates using UTC day stepping, avoiding local midnight and DST-length assumptions. Completion records use calendar-date strings, not the UTC date of a completion timestamp.

Rules:

- Only scheduled dates on or before today in the habit's timezone can be marked or unmarked. Future dates and unscheduled days are read-only.
- Current streak counts consecutive **scheduled** completed days. An incomplete today has a grace period and does not break the streak; an earlier missed scheduled day does.
- Longest streak is the largest completed run over scheduled history. Unscheduled days and archive periods are skipped.
- Consistency is completed scheduled days divided by all scheduled days from the start date **through today**, rounded to a whole percentage. A scheduled but pending today is included in this denominator. Future days are excluded.
- Weekly cards show Monday–Sunday for each habit's local today. Future planned days are shown but do not count as missed.
- Weekday changes take effect tomorrow in the saved timezone (or the start date if later). Versioned schedules preserve earlier history. Multiple edits to the same future schedule replace that future version.
- Archive periods begin on the local archive date and end exclusively on the local restore date. These dates are excluded from eligible scheduled history while paused. Existing completion records are retained. Archived habits are read-only until restored.
- There is a unique MongoDB index on habit/date. PUT completion is idempotent, including concurrent requests. Unmarking removes only that habit/date's completion.
- New start dates may be up to 3,660 days before or 366 days after local today. Historical completion is available through the month calendar.
- The month calendar can display earlier and later months. It distinguishes completed, pending/incomplete, unscheduled and upcoming dates. The recent-history summary shows the latest ten recorded dates; the calendar provides access to the rest.
- Habit data refreshes every minute while the app is open, so local date rollover is reflected without requiring a logout.

## Dashboard and regression safety

The four overview cards now show active saved goals, today's tasks, all saved tasks, and completed/scheduled habits for each habit's local today. The timeline, habit activity and recent-note cards use private saved records. Loading/error states show placeholders and Retry controls, never seeded achievements.

Focus hours remain a clearly labeled illustrative chart. The old fabricated analytics percentage was removed; no productivity score is calculated. Persisted focus sessions and focus analytics were not added.

Authentication, session cookies, password hashing, task CRUD, task filters, task import, all eight navigation routes and the basic focus timer remain available.

## API endpoints

All endpoints below require the existing authenticated HTTP-only cookie. Mutations also require the existing exact Origin and X-ProdTrack-Request header protections.

| Method | Endpoint                               | Purpose                                                                     |
| ------ | -------------------------------------- | --------------------------------------------------------------------------- |
| GET    | /api/notes                             | List own notes; search, category, tag, kind=note/journal                    |
| POST   | /api/notes                             | Create note or dated journal entry                                          |
| GET    | /api/notes/:id                         | View owned note                                                             |
| PATCH  | /api/notes/:id                         | Edit, pin, change journal date or links                                     |
| DELETE | /api/notes/:id                         | Delete owned note                                                           |
| GET    | /api/goals                             | List own goals; search, category, archived=true/false                       |
| POST   | /api/goals                             | Create goal with optional milestones/tasks                                  |
| GET    | /api/goals/:id                         | View owned goal and calculated progress                                     |
| PATCH  | /api/goals/:id                         | Edit milestones/progress, metadata, status, archive flag or links           |
| DELETE | /api/goals/:id                         | Delete goal; preserve linked records                                        |
| GET    | /api/habits                            | List owned habits, computed statistics, completion history and current week |
| POST   | /api/habits                            | Create daily/weekday habit                                                  |
| GET    | /api/habits/:id                        | View owned habit and statistics                                             |
| PATCH  | /api/habits/:id                        | Edit title/category/weekdays; archive or restore                            |
| GET    | /api/habits/:id/calendar?month=YYYY-MM | Calendar with scheduled/completed/future flags                              |
| PUT    | /api/habits/:id/completions/:date      | Mark scheduled date completed, idempotently                                 |
| DELETE | /api/habits/:id/completions/:date      | Mark scheduled date incomplete                                              |

Goal PATCH accepts a milestones array to add, edit, advance or remove embedded milestones. Existing milestone IDs must be retained for existing milestones. A new milestone omits its ID. No separate milestone collection or cross-goal milestone linking is used.

## Models and indexes

- Note: owner, title/content/category/tags, pin, optional journal date and task/goal references. Owner/pin/update index; unique partial owner/journal-date index.
- Goal: owner, metadata, term/date/status/archive, embedded milestones and task IDs. Owner/archive/target-date index.
- Habit: owner, metadata, timezone/start date, schedule versions and archive periods. Owner/archive/creation index.
- HabitCompletion: owner, habit and calendar date. Unique habit/date index and owner/date lookup index.
- Existing User, Session and Task models are unchanged.
- Normal database initialization waits for all new indexes before accepting requests. Optimistic concurrency on notes/goals/habits rejects overlapping document saves with HTTP 409. API field allowlists and ownership checks reject forged references and owner fields.

## Files created

Backend:

- src/models/Note.js, Goal.js, Habit.js, HabitCompletion.js
- src/domain/calendar.js
- src/routes/records.js, notes.js, goals.js, habits.js
- test/calendar.test.js, modules.test.js

Frontend:

- src/modules/types.ts, format.ts, useRecords.ts
- src/modules/Shared.tsx, NotesPage.tsx, GoalsPage.tsx, HabitsPage.tsx, ModuleDashboard.tsx

Documentation and QA:

- docs/PHASE3.md
- docs/phase3-*.png

Files modified:

- backend/src/app.js — authenticated routers and conflict/duplicate journal errors
- backend/src/config/database.js — new model/index initialization
- frontend/src/App.tsx — live modules, overview counts and recent notes
- frontend/src/components/DashboardCards.tsx — remove unused goal/habit demos, retain chart and task components
- frontend/src/styles.css — matching responsive module/editor/calendar styles
- README.md — current setup and Phase 3 handoff

## Verification — 22 October 2026

Automated checks passed:

- npm run lint (zero warnings/errors)
- npm run typecheck
- npm run build
- npm test: **38 checks passed**, no skips, using isolated real MongoDB processes.

The suite includes existing registration/login/logout, cookies, CSRF, task CRUD/import, isolation and persistence tests, plus:

- Notes CRUD, pin/search/filter, journal uniqueness and isolation.
- Owned/missing task and goal reference validation.
- Goal and milestone CRUD/validation, foreign milestone rejection, ratio-based progress, archive/restore.
- Habits with daily and selected-weekday schedules, future/unscheduled rejection, timezone midnight boundaries, leap dates and DST-safe date stepping.
- Pending-today grace, broken/longest streaks, consistency, schedule versions and archive intervals.
- Eight concurrent completion PUTs resulting in one completion record.
- Calendar date validation, cross-user reads/writes and non-cascading deletions.
- Module persistence after disconnect/reconnect.

Browser checks used a disposable dummy account:

- Registration and existing task creation.
- Goal creation with task link, 25% to 50% inline milestone progress, archive/restore and deletion of a temporary goal.
- Note creation with task/goal links, pinning, search, full-content editing, and deletion of a temporary note.
- Today's journal creation and reopening the same saved entry.
- Daily habit creation in Africa/Kampala, completion, calendar/history, archive/restore, weekday edits and authenticated reload.
- Desktop, tablet and mobile layouts, including mobile note and goal editors, with no horizontal overflow at the checked breakpoints.
- Dashboard live records, navigation and the existing focus controls.

## Database configuration and limitations

Use the existing backend/.env.example and set MONGODB_URI to your own local/Atlas database. No new environment variables or credentials are required for Phase 3. Start from the project root with npm run dev, or use the existing npm run dev:isolated -w backend helper with a separate npm run dev -w frontend terminal for disposable QA.

No personal MONGODB_URI was supplied. Real MongoDB engine connectivity, indexes and HTTP APIs were verified in the isolated test/QA databases; connectivity, network permissions, credentials, disk durability and backups for your own MongoDB deployment remain unverified.

Notes are plain text. There is no rich-text editor, attachment upload, offline synchronization or pagination. Task/goal/note links are references rather than cascades; deleted targets appear as unavailable and can be cleared. Goal statuses remain manually controlled. Habit timezone/start date are fixed after creation; archive periods exclude their covered local dates from consistency calculations. Very large histories and cross-tab live synchronization have not been load-tested. Focus charts remain illustrative and the timer remains session-only.

No deployment, push, merge, AI features, team collaboration or Phase 4 work was performed.
