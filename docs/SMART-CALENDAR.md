# Smart Productivity Calendar

Open **Calendar** in StudyMomentum. Month and Monday-based week views have previous, next and Today controls. Use the arrow keys to move between dates, Home/End to move within the week, and Enter or Space to open the daily panel. The panel uses StudyMomentum's existing task editor and task/habit write endpoints. It sits beside the calendar on wide screens and below it on smaller screens.

## Data and calculation rules

- The optional Task `scheduledDate` is a date-only string. If absent or null, the task is planned on its existing `dueDate`. Changing the plan never changes the deadline or completion timestamp. An unfinished task is overdue once its **deadline** is before today in the saved analytics timezone. A different deadline is shown on its own date as a reference to the same task, and does not count twice.
- The dashboard's Today’s Tasks shows tasks by planned date with the due-date fallback. Existing due-date filters, analytics due-date cohorts, and recorded completion-date trends retain their meanings.
- Recurring habits use the scheduling history, archive pauses and local dates of each habit. Future scheduled habits appear as upcoming, with disabled checkboxes, and do not count toward elapsed totals. Archived history is read-only. Day markers are calculated from actual checklist records; empty dates stay neutral.
- Focus uses the same saved interval and timezone splitting logic as Analytics. Discarded sessions and paused time are excluded. Goals and milestone deadlines are separate from checklist progress.
- Monthly totals exclude the neighboring-month cells shown in the grid. Combined completion markers are just checked items over eligible checklist items. The trend table shows task and habit totals separately.

## API and files

`GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` requires the existing session cookie. It returns the inclusive range (up to 42 dates), saved timezone, server-local today in that timezone, and per-day task, deadline, habit, goal/milestone and focus data. Reads are scoped to the authenticated owner and requested period. Focus lookups include a bounded buffer to catch sessions spanning midnight. The Calendar route skips other modules' bulk reads while continuing active focus sync.

Existing task POST/PATCH endpoints accept optional `scheduledDate` or null, and task responses expose it. Existing habit completion PUT/DELETE and their uniqueness rules are reused. No collection or migration is required. The existing `tasks` and `goals` collections gain indexes for scheduled tasks and milestone dates.

- Backend: `src/routes/calendar.js`, `src/app.js`, `src/routes/tasks.js`, `src/models/Task.js`, `src/models/Goal.js`, `test/smart-calendar.test.js`.
- Frontend: `src/modules/CalendarPage.tsx`, `src/App.tsx`, `src/styles.css`, `src/data/demo.ts` (task type), `src/components/TaskDialog.tsx`, `src/components/DashboardCards.tsx`, `src/hooks/useTasks.ts`, `src/modules/useRecords.ts`, `src/productivity/useProductivity.ts`.

## Verification

- Baseline backend suite: 59 passed on retry after a local MongoDB process startup timeout.
- Final full suite: 64 passed, zero failures or skips, using `node --test --test-concurrency=1 backend/test/*.test.js`. Lint, TypeScript checks and Vite production build passed.
- Isolated MongoDB tests verified authorization and ownership, range validation, recurrence history, duplicate-completion prevention, legacy tasks, due-date analytics, and focus allocation across midnight and a daylight-saving transition.
- Browser checks covered month and week navigation, Today, keyboard date selection, in-place task creation and editing, completion and reopening, habit completion, refresh persistence, and synchronization in Tasks, Habits and Dashboard. Analytics remained accessible. Neither the 1440px desktop view nor the 390px mobile view overflowed horizontally.
- Screenshots: [Desktop calendar](calendar-desktop.jpg) and [Mobile calendar](calendar-mobile.jpg).

## Release and limitations

Deploy the backend before the frontend when approved. Confirm the new indexes initialize, then smoke-test authenticated range loading and a task/habit toggle with a staging account on the existing Render/Vercel routing and Atlas configuration. There are no new dependencies, secrets, database collections or infrastructure settings. Atlas and production deployments were not contacted during calendar verification.

Planned dates are day-level only. Calendar completion reflects current task status and saved habit history; it is not an immutable day-by-day audit log. No external calendar sync or drag-and-drop scheduling is included. Screenshots use temporary local test fixtures.
