# Deployment reliability

## Diagnosis (2026-11-18)

Before this change, the production root served the current built frontend, but direct requests to `/login`, `/calendar`, `/tasks`, `/notes`, `/goals`, `/habits`, `/focus`, `/analytics`, `/insights` and `/settings` all returned Vercel `404 NOT_FOUND`. JavaScript/CSS assets and the API were healthy. The deployed asset names matched commit `1747913`.

`frontend/vercel.json` combined `cleanUrls: true` with a rewrite to `/index.html`. Vercel requires extensionless rewrite destinations when clean URLs are enabled: https://vercel.com/docs/project-configuration/vercel-json . Clean URLs are unnecessary for React Router and have been removed. The API proxy remains first and the SPA fallback remains `/index.html`. Existing static files are served by Vercel's filesystem routing. The public `X-StudyMomentum-Routing: spa-fallback-v2` header identifies the effective configuration after deployment.

## Routing and API safety

- Existing proxy: `/api/:path*` → `https://production-tracker-k7qd.onrender.com/api/:path*`.
- Explicit `/api/` → backend `/api` prevents the trailing-slash API root falling through to React (verified as an edge case during the first production smoke run).
- All remaining client routes → `/index.html`.
- API errors remain JSON; private API responses retain `no-store`.
- Session cookies remain HTTP-only, Secure and host-only in production. CSRF headers and trusted-origin checks are unchanged. No tokens are placed in browser storage.
- Backend health adds a non-secret Render commit identifier when supplied by Render. Errors include a random request ID and error type, without request bodies, URLs, credentials or cookie contents.

## Network behavior

GET/HEAD requests have at most three attempts, each bounded to 20 seconds, with 1/2-second backoff. Only network failures, timeouts and HTTP 408/502/503/504 are retried. Authentication/validation/rate-limit errors are not retried. Writes have one attempt with a 30-second timeout and explicitly tell users to check saved records before retrying an uncertain result. Unexpected HTML or malformed JSON cannot become successful API data or a false session-expiry event.

Session restoration shows a wake-up message after five seconds and a retry control after failure. Cancellation prevents stale restoration requests from overriding a newer login/logout. Network failure does not invalidate a known session. Render free instances can take about one minute to wake after inactivity (https://render.com/docs/free); this is a possible delay source, not proof of the configured account's billing tier.

## Checks and release procedure

Run from the repository root:

```powershell
npm run lint
npm run typecheck
npm run build
npm test
npm run smoke:deployment -- --require-routing --local-build frontend/dist
```

The smoke check requests all eleven specified routes twice, verifies SPA HTML, compares deployed index/JS/CSS bytes with the local build, checks database health, missing/invalid sessions, JSON API 404s and origin rejection. It creates no accounts or application records. Use `--base https://...` to check an existing preview. It exits nonzero on failure and never masks unhealthy responses.

Pre-release validation: ESLint and TypeScript passed; production build passed; all 88 automated tests passed against isolated MongoDB, including authentication, session expiry, cookie scope, CSRF, task/calendar/habit synchronization, focus, analytics, date boundaries and user isolation. New tests cover transport cancellation/timeouts, safe retries, no write replay, non-JSON errors and routing configuration. No production records were modified.

## Hosting inspection limits

The configured Render backend returned health `database: connected`, and protected recurring-task requests returned JSON 401. GitHub also advertises a separate `studymomentum` Render deployment with a failed deployment status; that hostname timed out during inspection. It is not the Vercel proxy destination and has not been substituted. Private Render logs/environment and Vercel project settings require hosting-dashboard access; these are not established by public smoke tests. Source binds to `0.0.0.0` and Render's `PORT`, with `/api/health` configured as its health check.

Production valid-session/sidebar/login/logout workflows require an authorized signed-in browser or test credentials; isolated regression tests cover these behaviors without adding production users. The production smoke checks separately verify routing, assets and unauthenticated session protection. Cold starts, hosting outages and network interruptions remain possible; bounded retry and clear errors cannot guarantee service availability.
