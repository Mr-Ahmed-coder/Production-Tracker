# Calendar checkbox planner — 18 November 2026

The existing /calendar module was updated in place. No production API handlers, authentication, database models, Atlas configuration, Render or Vercel configuration changed. No dependencies were added. This update remains local and was not pushed or deployed.

## Visible changes

- Month cells show up to three real task/habit activities with native checkboxes, subtly crossed-out completed titles, and Add Activity. Extra records open through + more.
- Week cells show up to six activities before + more. Month/week navigation, Today and keyboard date selection remain.
- Overdue labels, deadline counts and repetitive completion-number badges were removed from the grid. Planned dates, deadlines, completion timestamps and overdue business logic are preserved on the server.
- The full daily panel retains task priorities/deadlines, scheduled habits, completion summary, focus duration and relevant goals/milestones. Task edit and confirmed delete controls reuse the existing dialogs and endpoints.
- On small screens the month grid scrolls inside its own container so activity titles remain readable. Week view uses stacked full-width day cards, and selecting a day brings the full-width checklist into view.
- The Calendar route no longer shows the unrelated loading-tasks banner for its intentionally skipped bulk task request. Other pages retain their existing loading states.

## Saving and safety

Task checkboxes PATCH the existing task with only completed=true/false. Habit checkboxes call the existing dated PUT/DELETE completion endpoints. No fake checkbox records or duplicate tasks are created. Only the server assigns actual task completion timestamps; historical calendar checks never submit backdated timestamps.

Checkbox changes update the grid and panel immediately. While saving, further mutations are disabled. A rejected write restores the previous view, shows the API error, and refreshes canonical records. Request generations prevent an older in-flight calendar response from overwriting an optimistic change. Future or archived habit dates remain read-only according to existing scheduling rules. Delete requires the existing explicit confirmation dialog.

## Files changed

- frontend/src/modules/CalendarPage.tsx: inline activity rows, accessible date controls, optimistic state/rollback, edit/delete dialogs, mobile day-panel access.
- frontend/src/styles.css: calendar-scoped day cards, activity checkboxes, completion styling and responsive layouts.
- frontend/src/App.tsx: hide the skipped global task-loading indicator on Calendar only.
- backend/test/smart-calendar.test.js: historical task timestamps, edited task timestamp preservation, owner-scoped deletion and source-record preservation.
- docs/SMART-CALENDAR.md and this report.
- docs/calendar-checkbox-desktop.jpg, calendar-checkbox-mobile-week.jpg and calendar-checkbox-mobile.jpg: synthetic QA screenshots.

## Verification results

- Baseline: 64 tests passed.
- Final regression suite: **65 passed, zero failed, zero skipped**, including all existing authentication, Tasks, Habits, Dashboard analytics, goals, notes, focus, exports and calendar tests.
- Command: node --test --test-concurrency=1 backend/test/*.test.js. Destructive tests used isolated MongoDB test processes.
- npm run lint: passed with zero warnings/errors.
- npm run typecheck: passed.
- npm run build: passed.
- git diff --check: passed.

Browser verification used the existing app against a separate disposable local MongoDB process on QA ports 4107/5177. Atlas and existing personal data were not accessed.

Checked workflows:

- Three month activities with + more; six week activities; no grid warning labels, deadline-count text or repetitive numeric badges.
- Inline task check/uncheck and immediate completion styling; inline habit check/uncheck; saved states after refresh.
- Future habit controls disabled, and no buttons nested inside other interactive controls.
- Month/week previous and next; Today; arrow-key selection; complete checklist through + more/date controls.
- Add Activity with selected planned date and a separate deadline; in-place edit of the same record. Delete confirmation was opened and cancelled in the browser; successful scoped deletion is covered by isolated automated tests.
- Task state synchronized from Calendar to Tasks and Dashboard, and from Tasks back to Calendar. Habit completion appeared in Habits. Analytics rendered its saved task chart.
- Rejected-save check: a synthetic habit was archived outside the stale calendar view. The attempted check returned the expected conflict, displayed the error and left no false completion in the database. The fixture was restored afterward.
- Desktop 1440x1050 and mobile 390x844: no horizontal page overflow. The mobile week card occupied the available content width; its inline task and daily-panel habit checkboxes worked.

## Remaining limits

Month view intentionally scrolls horizontally on narrow screens; Week and the daily panel provide the comfortable full-width checklist. Changes require a successful network save; failed requests are rolled back. Live Atlas/production deployment checks remain outstanding. Existing account-wide history and date calculations retain the original module's behavior.

No production data was reset or deleted. No push, deployment, new cloud service or infrastructure changes were performed.
