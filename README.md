# StudyMomentum — Focus Today. Grow Every Day.

A personal productivity platform for students, professionals, and lifelong learners.

Personal productivity insights, Pomodoro focus presets, offline chime alerts, data ownership exports, collection pagination, and verification are documented in the [Phase 5 verification report](docs/PHASE5-VERIFICATION.md). The complete project architecture and master guide is in the [Project handoff](docs/PROJECT_HANDOFF.md). Previous module verifications remain in [Phase 4 verification](docs/PHASE4-VERIFICATION.md) and [Phase 3 local verification](docs/PHASE3-LOCAL-VERIFICATION.md).

StudyMomentum (formerly ProdTrack) is a personal MERN productivity application with cookie authentication, MongoDB-backed tasks, private notes and daily journals, measurable goals, timezone-aware habit tracking, server-timed focus sessions, and productivity analytics. The signature cream-and-lime aesthetic is preserved.

See [Phase 3 implementation, API reference, changed files and verification](docs/PHASE3.md) for the preceding module handoff.

**Current database: persistent local MongoDB**, configured in `backend/.env`. Atlas is not required. See [Local MongoDB setup](docs/LOCAL_MONGODB.md).

## Requirements and startup

Use Node.js 22.12+ and npm (verified on Node 24). Normal development uses the installed local MongoDB Windows service.

From PowerShell:

```powershell
cd "C:\Users\HP\OneDrive\Desktop\Production Track\ProdTrack"
npm install
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (!(Test-Path frontend/.env)) { Copy-Item frontend/.env.example frontend/.env }
```

Edit `backend/.env` with your MongoDB configuration:

```dotenv
PORT=4000
NODE_ENV=development
CLIENT_ORIGIN=http://127.0.0.1:5173
MONGODB_URI=mongodb://127.0.0.1:27017/prodtrack
```

This URI uses your local MongoDB service and the persistent `prodtrack` database. Keep configuration in the ignored `backend/.env`. Atlas is not needed for the current setup.

Start both frontend and backend:

```powershell
npm run dev
```

Or use two terminals from the project root:

```powershell
npm run dev -w frontend
npm run dev -w backend
```

Open **http://127.0.0.1:5173**. The API runs at **http://127.0.0.1:4000/api/health**. Register a new account through the UI; no predefined user accounts or passwords exist.

The frontend uses the Vite same-origin `/api` proxy by default. Leave `VITE_API_URL` blank for local development. If the API port changes, update the Vite proxy target too. If the browser origin changes, update `CLIENT_ORIGIN` exactly, including scheme and port. Use the same hostname consistently: `localhost` and `127.0.0.1` are different cookie hosts.

Startup fails when the database URI is absent or the connection cannot be established; there is no localStorage fallback. Runtime database failures return JSON errors and HTTP 503.

## Development without a personal MongoDB URI

A disposable QA server is available using the **test-only** dependency `mongodb-memory-server`:

```powershell
# Terminal 1, from the project root
npm run dev:isolated -w backend
# Terminal 2
npm run dev -w frontend
```

This starts an actual isolated MongoDB process and the local API. It requires no credentials, ignores a personal URI, and removes its QA data when stopped. **Use dummy test data only; do not use this command for personal records.** Stop the normal backend before using it, because both use port 4000. The first run may download a MongoDB binary. Normal app startup never invokes this helper.

## Implemented features

- Registration, login, logout, persistent sessions, and protected application routes.
- User name and email shown in the welcome message and profile panel.
- Salted asynchronous scrypt password hashing using Node's built-in crypto API. Passwords must contain 8–128 characters.
- Random opaque session tokens in HTTP-only, SameSite=Lax cookies, with seven-day expiration. Only SHA-256 token hashes are stored in MongoDB. Authentication tokens are never stored in localStorage or returned in JSON.
- Production mode automatically uses Secure, host-only `__Host-prodtrack_session` cookies. Local HTTP development uses a separate non-Secure cookie; production requires HTTPS.
- MongoDB-backed sessions with TTL cleanup, expiration checks on every request, and server-side revocation on logout. Login rotates the current session.
- Exact-origin and custom-header CSRF protection on all mutations, credentialed CORS, a bounded per-IP authentication limiter (30 attempts per 15 minutes), generic invalid-login errors, JSON error responses, and request size limits.
- Task creation, editing, deletion with confirmation, completion/uncompletion, category, priority and due date. All API reads and writes are scoped to the authenticated user; owner fields cannot be assigned by the client.
- Search, status/priority/date filters in the frontend and API. The frontend filters the account's loaded task dataset; API query filters are also implemented and tested.
- Real daily open/completed task counts, focused hours and daily focus target progress. New accounts start with no tasks. Failed loads show retry states, not seeded examples.
- Loading, saving, success, validation, error and empty states. Mutations wait for server confirmation and prevent simultaneous task changes.
- Notes, goals and habits are fully MongoDB-backed. The dashboard shows real goal, task and habit counts, a saved-goal timeline, habit activity and recent notes. Focus charts and analytics now use server-recorded focus intervals; there is no fabricated productivity score.
- Persistent focus start/pause/resume/finish/discard with owned task/goal links, bounded connection leases, calendar history and configurable daily target/timezone.
- Separate activity analytics and editable daily reviews with real task/habit/milestone summaries.

Security implementation references: [Node crypto](https://nodejs.org/api/crypto.html) and [Mongoose validation](https://mongoosejs.com/docs/validation.html).

## Safe Phase 1 import

Open **Settings → Review browser tasks** when legacy data is detected. Review the titles/dates and select only records that belong to your account. Browser data may include Phase 1 demo tasks or another person's records on a shared device.

Import occurs only after pressing **Import selected tasks into my account**. The original `prodtrack.tasks.v1` browser data is never modified or deleted. No import is performed automatically. The API validates each batch before writing and uses a unique per-user import key derived from the original task ID. Retrying a partial/failed import does not duplicate already-imported records or overwrite edits. Batches are limited to 100 records and the frontend sends larger imports in batches.

Old unowned MongoDB task documents, if any exist from manual Phase 1 experiments, are not exposed or automatically assigned to a user. No database records are silently removed. Phase 1 did not provide backend task-writing endpoints.

## API

All mutations require `Content-Type: application/json`, `X-ProdTrack-Request: 1`, and an `Origin` matching `CLIENT_ORIGIN`. The frontend API client sets these through standard browser requests. Task routes also require a valid session cookie.

| Method | Endpoint           | Behavior                                                             |
| ------ | ------------------ | -------------------------------------------------------------------- |
| POST   | /api/auth/register | Register with name, email, password; starts session                  |
| POST   | /api/auth/login    | Authenticate email/password; rotates session                         |
| POST   | /api/auth/logout   | Revoke current session and clear cookie                              |
| GET    | /api/auth/me       | Current user's safe profile                                          |
| GET    | /api/tasks         | List current user's tasks; search, status, priority, dueDate filters |
| POST   | /api/tasks         | Create task                                                          |
| PATCH  | /api/tasks/:id     | Edit allowed task fields                                             |
| DELETE | /api/tasks/:id     | Delete owned task                                                    |
| POST   | /api/tasks/import  | Idempotent import of selected legacy tasks                           |
| GET    | /api/health        | 200 when connected; 503 when disconnected                            |

Models/indexes: unique normalized user email; unique session token hash, indexed session user and TTL expiration; task user/due-date/creation index; unique partial user/import-key index. Index initialization completes before normal server startup.

## Phase 2 foundation structure (Phase 3 additions are listed in docs/PHASE3.md)

```text
ProdTrack/
  frontend/
    src/
      auth/
        context.ts          User/auth state types and hook (new)
        AuthProvider.tsx    Session check, sign-in/out (new)
        AuthGate.tsx        Protected app and auth pages (new)
      lib/api.ts            Credentialed JSON client/error handling (new)
      components/
        TaskDialog.tsx      Reused create/edit form; deletion dialog
        DashboardCards.tsx  Reused list; edit/delete controls and demo labels
        LegacyImport.tsx    Explicit legacy review/import (new)
      hooks/useTasks.ts     MongoDB task API integration
      App.tsx               Profile, task filters, real counts, dialogs, settings
      main.tsx              Auth provider/gate wiring
      styles.css            Matching auth/forms/loading/import styles
      vite-env.d.ts         Vite environment types (new)
    vite.config.ts          Same-origin development API proxy
    package.json            Explicit typecheck script
    .env.example            Optional API origin configuration
  backend/
    src/
      models/
        User.js             Identity and password hash (new)
        Session.js          Persistent hashed sessions (new)
        Task.js             Owned tasks and import keys
      routes/
        auth.js             Cookie authentication and protection (new)
        tasks.js            Validated user-scoped CRUD/import (new)
      security.js           Hashing and validation helpers (new)
      config/database.js    Required URI and index initialization
      app.js                Middleware, routers, health/errors
      server.js             Existing environment/startup/shutdown entry
    test/
      health.test.js        Missing-URI startup and health
      integration.test.js   Isolated MongoDB integration coverage (new)
    scripts/dev-isolated.js Disposable local QA API (new)
    package.json            Test database dev dependency/helper command
    .env.example            MongoDB, origin and cookie-mode configuration
  docs/phase2-*.png          Browser verification screenshots (new)
  package.json              Root typecheck command
  package-lock.json         Locked test dependency
  .gitignore                Test cache and TypeScript build metadata
  README.md                 Phase 2 setup, behavior and verification
```

No additional runtime dependency was needed. `mongodb-memory-server` is the only new dependency and is development/test-only.

## Verification — 22 October 2026

Run from the project root:

```powershell
npm run lint
npm run typecheck
npm run build
npm test
```

Verified:

- ESLint, strict TypeScript checking and Vite production build.
- 59 passing backend checks against an isolated real MongoDB process, including registration/login validation, password hashes, cookie flags/rotation, route protection, CSRF rejection, task CRUD/search/filters, logout/login persistence, database reconnection, cross-user isolation, idempotent imports, expired sessions, production cookie settings, malformed/oversized requests, invalid IDs, throttling, outage errors, personal insights calculations, data export (JSON & CSV), and tasks/notes pagination.
- Local API startup using the existing connection function with the isolated database.
- Browser registration, authenticated reload, create/edit/complete/delete, logout/login restoration, search/filtering, and login errors.
- All application navigation destinations (including new `/insights`), desktop layout, and mobile dashboard/login layouts with no horizontal overflow.
- Session-only focus preview replaced with saved server-timed sessions, real analytics, and Pomodoro presets with break mode; notes/goals/habits remain backed by real records.
- Phase 3, Phase 4, and Phase 5 integration tests passed.
- Browser screenshots use a disposable dummy account and test records. They do not contain personal data.

The Windows sandbox requires approved local socket access for these HTTP/database tests. Tests were actually run successfully with that access. The initial isolated test launch timed out; a corrected Windows cache path allowed the full suite to pass. No tests were skipped.

## Remaining limitations

The installed local MongoDB service, `prodtrack` database connection, model/index initialization, database ping, and normal backend health response were verified on 22 October 2026. Backup/restore and production HTTPS behavior remain untested. Atlas is not configured. Secure-cookie attributes are covered by integration tests; no HTTPS deployment was made.

No password reset, email verification, MFA, account editing, global logout, or cross-tab live synchronization is included. The authentication limiter is per process; a multi-instance service needs a shared limiter. Persisted focus, activity analytics, personal insights, daily reviews, data exports, and paginated tasks/notes are live; calculation rules and current limits are documented in docs/PHASE5-VERIFICATION.md. Notes, goals and habits retain their Phase 3 behavior.

The production frontend output is in `frontend/dist`. A future production host needs SPA route fallback, a same-origin API/reverse proxy, HTTPS, and an exact production `CLIENT_ORIGIN`; Vite's proxy is for development only.

No deployment, GitHub push or merge was performed.
