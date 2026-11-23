# Optional daily email reminders

Implemented locally on 2026-11-19. Nothing was pushed, deployed, sent to a real recipient or provisioned as a paid service. Existing authentication, task records, calendar functionality and hosting configuration are preserved. No new package dependencies.

## User experience

Settings → Email notifications offers verification, an explicit opt-in checkbox, HH:mm reminder time, saved productivity timezone, save feedback and an immediate opt-out. Users must request a verification email, open its link, sign into the requesting account and press **Confirm email ownership**. Verification alone does not turn reminders on. Tokens expire after 24 hours, are bound to the requested email/account and cannot be reused. Requests are rate limited in MongoDB to three per rolling 24 hours and at least ten minutes apart.

Reminder emails contain escaped task titles, StudyMomentum cream/lime HTML, a text alternative, calendar link and unsubscribe link. At most 50 titles are listed; additional activities are summarized with a count. The unsubscribe page needs no login and requires an explicit button click, so an email scanner following a GET cannot opt someone out. Its signed bearer token can only disable reminders for its account, not read or modify tasks. Existing Origin/custom-header CSRF checks remain in force. This is a confirmation-page unsubscribe, not an RFC 8058 automated one-click POST endpoint.

## Scheduling and calculation rules

Run the independent, finite worker every five minutes, in UTC. The worker does not run in Express, in a browser or on the free web service's event loop.

For each enabled account whose verified email still matches its user record, use the existing `ProductivitySettings.timeZone` (existing fallback Africa/Kampala). At or after the saved HH:mm, consider only that local calendar date. Catch up within the same date following a scheduler delay; do not send a previous day's reminders. A nonexistent DST reminder time is reached at the next valid local time; a repeated DST hour is deduplicated by local date. Timezone edits take effect on the next run.

Normal tasks use `scheduledDate`, falling back to `dueDate` only when no scheduled date exists. Completed tasks and tasks planned for any other date are excluded. Recurring tasks use the existing `recurringRange` and occurrence state: exclude completed, skipped, stopped, deleted and unscheduled repetitions. Series retain their existing saved weekday/date semantics, matching the calendar. Habits are distinct and are not emailed. Tasks are never marked complete or otherwise modified.

No delivery record is created for an empty checklist. A new task created after reminder time can therefore trigger that day's reminder on a later run. Once a daily record exists, there is no second summary for that user/date, even if preferences or tasks change. Disabling reminders and completing an entire checklist are rechecked before an unattempted email is dispatched. Opt-out cannot recall an already in-flight provider request.

## Duplicate protection and failure handling

`EmailDelivery.dedupeKey` has a unique index: `daily:<user-id>:<YYYY-MM-DD>`. Each verification uses its own unique key. Atomic MongoDB leases (two minutes, random ownership token) prevent simultaneous dispatch. First-attempt timestamps, counts and bounded outcome history are persisted before/after external delivery. The provider request uses the same key and immutable payload on retry. **Accepted** means Resend accepted the request, not that the recipient received it.

Resend retains idempotency keys for 24 hours: https://resend.com/docs/dashboard/emails/idempotency-keys . Automatic retries stop within 23 hours of the first attempt and before the queued record's expiry; daily retries also stop when its local date ends. Up to six attempts use delays of 1, 5, 15, 60 and 180 minutes (rounded up to the next cron run). Network errors, ambiguous successful responses, HTTP 408/409/429 and 5xx can retry. Other provider errors fail permanently. No new provider key is generated to bypass failures. Expired or exhausted ambiguous work is retained as `uncertain` and is never automatically replayed beyond the provider's safety window. This chooses a possibly missed email over a duplicate.

The original snapshot may mention tasks completed after an attempted send; changing the payload would invalidate provider idempotency. The email explains that it reflects a saved snapshot. Terminal delivery records retain deduplication/audit metadata but discard HTML/text/token payloads. Pending payloads are private database records and are never exposed through application APIs or logs. No TTL deletes daily deduplication history. A backup/restore that rolls delivery records back requires pausing the worker and reconciliation before restart; no database deletion/reset is part of activation.

## Models and API

New collections: `notificationsettings` (unique user, opt-in/time, verified address, hashed expiring verification challenge, shared request limits, unsubscribe nonce) and `emaildeliveries` (unique dedupe key, private recipient/payload, local date, lease, attempt history, acceptance/failure state). No existing user/task schema is changed and no data migration is required. Startup initializes these additive indexes; do not run `syncIndexes` or destructive migrations.

All preferences and verification endpoints use existing authenticated cookies:

| Endpoint | Purpose |
| --- | --- |
| GET `/api/notifications/settings` | Own preferences, verification/configuration status and saved timezone |
| PUT `/api/notifications/settings` | Update only enabled/reminderTime |
| POST `/api/notifications/verification` with `{}` | Queue an ownership verification email |
| POST `/api/notifications/verify` with `{token}` | Confirm an unexpired token for the authenticated requesting account |
| POST `/api/email-actions/unsubscribe` with `{token}` | Public signed opt-out; normal frontend Origin/custom-header checks still required |

Email fragments keep verification/unsubscribe tokens out of request URLs and ordinary access logs. The frontend removes fragments after reading them. Reopen the original email link if the page is refreshed before confirmation. Verification fragments survive the existing login redirect through router state. Signing-key rotation invalidates previously issued unsubscribe links; keep the same secret stable across API and cron.

## Provider configuration

Use server-only environment variables from `backend/.env.example` in both the existing API and the independent worker:

```dotenv
EMAIL_REMINDERS_ENABLED=false
RESEND_API_KEY=<server-only Resend key>
EMAIL_FROM=StudyMomentum <reminders@your-verified-domain.example>
EMAIL_APP_URL=https://production-tracker-navy.vercel.app
EMAIL_TOKEN_SECRET=<at least 32 random bytes, stored securely>
```

Use the existing MongoDB Atlas `MONGODB_URI`. Never print/share it or place it in frontend configuration. `EMAIL_APP_URL` is the public frontend origin, has no path, and must also be allowed by the API's existing `CLIENT_ORIGIN`. Production requires HTTPS. Generate a strong secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` in a private terminal and put it directly in server-side secrets; do not commit its output.

Verify ownership of the sender domain with Resend, configure the DNS records they provide (SPF/DKIM, with DMARC recommended), and use an actual authorized sender address on that domain. Account email ownership is a separate application-level verification step. Resend's sending API documentation: https://resend.com/docs/api-reference/emails/send-email . The app checks configuration presence/format, not live DNS verification or the validity of an API key.

## Independent scheduler and costs (manual activation only)

From the repository root:

```powershell
# Reads candidate data only; no emails or delivery records are created.
npm run reminders:dry-run -w backend

# Real sending: ONLY after provider verification and explicit operator activation.
npm run reminders:run -w backend
```

For an operator-approved Render Cron Job using this existing repository, set build command `npm ci`, command `npm run reminders:run -w backend`, schedule `*/5 * * * *` (UTC), and securely configure the same database/provider/frontend-origin/signing-secret values. Enable `EMAIL_REMINDERS_ENABLED=true` in API and cron only when ready. Do not change the existing free web service or Vercel proxy. No cron service has been added to `render.yaml`, because applying it could create a paid resource without approval.

Render cron billing has a **$1/month minimum per job**, with usage-dependent compute charges: https://render.com/docs/cronjobs . A five-minute schedule is about 8,640 runs per 30-day month; actual cost depends on startup, database queries and provider latency. See current rates: https://render.com/pricing . An existing independent host with system cron is also suitable; it must have stable network access to Atlas/Resend and protect these same secrets.

Resend's free tier currently has a 100-email daily limit; verification messages consume quota too. See current plan quotas and pricing before activation: https://resend.com/pricing . Verified domain registration/DNS may have separate costs. No paid plan, domain or service was purchased. Do not use GitHub Actions secrets or send workflow jobs unless separately reviewed and configured.

Worker output contains aggregate counters only. Exit status is nonzero for provider failures/retry/uncertain results or fatal database/configuration errors; configure scheduler failure alerts and monitor MongoDB delivery states. Drain capacity is 100 queued records per run, oldest first; increase frequency/capacity only after reviewing quota, costs and load. No public scheduler trigger endpoint or scheduler credential is exposed.

## Changed files

- `backend/src/models/NotificationSettings.js`, `EmailDelivery.js`: additive models/indexes.
- `backend/src/email/provider.js`, `content.js`, `preferences.js`, `worker.js`: provider, rendering, signed tokens, daily selection and durable dispatch.
- `backend/src/routes/notifications.js`, `backend/src/app.js`: owner-scoped routes and token-scoped unsubscribe.
- `backend/src/config/database.js`: model/index initialization.
- `backend/scripts/reminders.js`, `backend/package.json`: finite worker commands.
- `backend/.env.example`: disabled-by-default server configuration.
- `backend/test/notifications.test.js`: isolated API/worker/security tests with mocked provider.
- `frontend/src/notifications/EmailPreferences.tsx`, `UnsubscribePage.tsx`: settings and public confirmation page.
- `frontend/src/App.tsx`, `auth/AuthGate.tsx`, `styles.css`: existing Settings integration, public opt-out route and verification redirect preservation.
- `README.md`, this document: setup, calculation rules, costs and activation guidance.

## Safe activation checklist

1. Review the local diff and tests; approve a release separately. These changes have not been pushed/deployed.
2. Verify a sender domain and choose a provider plan/quota. Configure secrets and allowed origin on the existing API; keep the global switch off.
3. Approve and configure the independent scheduler and its budget. Run the dry-run command against the intended database without modifying records.
4. Deploy the reviewed API/frontend/worker, verify additive indexes and health, then enable the global switch in API and worker.
5. Use only an operator-controlled mailbox for the first explicitly authorized live verification/reminder. Confirm HTML/text, links, opt-out, scheduler logs and one-per-day deduplication before wider opt-in.
6. Each user must request/confirm ownership, enable reminders and save a local time. Monitor provider acceptance, bounces and scheduler failures; turn the global switch off to stop new sends if needed. Unsubscribe continues to work while the switch is off, provided the signing secret remains configured.

## Remaining limits

No live Resend delivery, DNS verification, paid scheduler or production deployment has been performed. Provider acceptance is tracked; bounce/complaint/inbox delivery webhooks and automatic suppression management are not implemented. Check the provider dashboard and suppression settings before production activation. The default operator-disabled state is intentional. Provider/network outages can lead to a skipped reminder; no fake success is returned. A 23-hour idempotency cutoff and permanent MongoDB dedupe records prevent unsafe automatic replays, but cannot provide an absolute end-to-end inbox exactly-once guarantee across external provider outages or restored database backups.

## Verification results

The pre-change regression baseline passed 88 tests. After implementation, the full suite passed **107 tests**, including 19 new tests/subtests for reminders. Commands: `node --test --test-concurrency=1 backend/test/*.test.js`, `npm run lint`, `npm run typecheck`, `npm run build`. All tests used isolated MongoDB and mocked Resend calls; no real recipient, Atlas database or provider key was used.

Coverage includes current-day selection, due-date fallback, incomplete recurring occurrences, completed/future/skipped/stopped/deleted exclusions, no task mutations, defaults/disabled/unverified accounts, verification expiry/email binding/ownership/replay/rate limits, owner isolation, concurrent workers, provider idempotency/ambiguous retries/permanent errors, expired leases, retry cutoff, unsubscribe with no session and with sending disabled, persistence after MongoDB reconnect, timezone midnight, half-hour offsets, and DST gap/fold behavior.

Local desktop and 390px mobile browser checks used a disposable account with fake provider configuration and no running email worker. Verified sign-in, opt-in/time save (`19:15`), persistence after refresh, opt-out persistence, and logged-out access to the unsubscribe page's missing-token state. Mobile document width did not exceed the viewport. Actual signed unsubscribe/verification behavior was covered by the isolated API tests; no inbox/browser email delivery was performed. Screenshots: `verification/email-settings-desktop.jpg` and `verification/email-settings-mobile.jpg`.
