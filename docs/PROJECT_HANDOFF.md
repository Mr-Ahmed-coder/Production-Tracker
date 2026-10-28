# StudyMomentum — Project Handoff Document

**Application Name:** StudyMomentum (formerly ProdTrack)  
**Tagline:** Focus Today. Grow Every Day.  
**Description:** A personal productivity platform for students, professionals, and lifelong learners.  
**Project Location:** `C:\Users\HP\OneDrive\Desktop\Production Track\ProdTrack`  
**Current Milestone:** StudyMomentum Rebranding & Phase 5 Completed & Verified  

---

## 1. Application Architecture

StudyMomentum is a full-stack personal productivity web application built using the MERN stack with modern standards and strict user data isolation.

### Technology Stack:
- **Frontend**:
  - React 19 (`react`, `react-dom`)
  - TypeScript 5.9 with strict type checking
  - Vite 7 with development proxy to `/api`
  - Tailwind CSS 4 with custom cream-and-lime styling
  - Lucide React icons
  - Recharts for data visualizations (habits, focus trends, analytics)
  - React Router 7 for client-side routing
  - Web Audio API synthesizer for local zero-dependency notification chimes
- **Backend**:
  - Node.js 22+ / 24+ (ESM modules: `"type": "module"`)
  - Express 5.1.0
  - Mongoose 8.18.2 with strict schema validation and optimistic concurrency control (`optimisticConcurrency: true`)
  - Native Node crypto for scrypt password hashing and SHA-256 session token hashing
  - `mongodb-memory-server` for zero-side-effect automated integration testing
- **Workspace Architecture**:
  - npm workspaces with root `package.json` managing `frontend` and `backend`.

### Security Architecture:
- **Authentication**: Random 256-bit opaque session tokens stored exclusively in HTTP-only, SameSite=Lax cookies with a 7-day TTL. In production mode, automatically upgraded to Secure, host-only `__Host-prodtrack_session`. Tokens are never exposed to JavaScript or stored in localStorage.
- **CSRF Protection**: Mutation requests enforce exact `Origin` matching against `CLIENT_ORIGIN` and require custom header `X-ProdTrack-Request: 1`.
- **Authorization**: All CRUD operations, analytics, reviews, insights, exports, and focus tracking are strictly scoped to the authenticated `req.user._id`. Owner fields cannot be supplied or modified by the client. Cross-user data leaks are verified impossible.
- **Rate Limiting**: In-memory bounded per-IP rate limiter on sensitive authentication routes (30 attempts per 15 minutes).

---

## 2. Completed Phases

### Phase 1: Core UI & Local Task Prototype
- Built responsive cream-and-lime application shell, navigation, dashboard layout, and modal dialogs.
- Prototype task management in browser storage.

### Phase 2: MongoDB Foundation, Auth & Tasks
- Transitioned backend to MongoDB with Mongoose.
- Implemented user registration, salted scrypt password hashing, session tokens, secure cookie management, and CSRF protection.
- Built MongoDB-backed task management (CRUD, priorities, due dates, categories, search, filtering).
- Added safe, idempotent, user-reviewed Phase 1 browser task import.
- Established automated test suite with isolated MongoDB memory servers.

### Phase 3: Notes, Journals, Goals & Habits
- **Notes & Journals**: Markdown-friendly private notes with pinning, tagging, and one-journal-per-day enforcement.
- **Goals & Milestones**: Measurable goals with progress tracking calculated from milestone target ratios, archive/restore capabilities, and task linking.
- **Habits & Calendars**: Timezone-aware habit tracking, scheduled weekday rules, streak calculations with grace periods, 8-week completion charts, and normalized habit name uniqueness.
- Local MongoDB configuration with persistent Windows service support.

### Phase 4: Focus Sessions, Analytics & Daily Reviews
- **Server-Timed Focus Sessions**: Active session state machine (`running`, `paused`, `finished`, `discarded`), connection lease mechanism (45s lease with 15s heartbeats), persistence across refreshes and restarts, and optional task/goal association.
- **Productivity Analytics**: Timezone-aware date splitting (DST and fractional-hour offset safe), planned vs. completed task cohorts, legacy task exclusion, and target attainment tracking without fabricated scores.
- **Daily Reviews**: Reflection text storage ("Went well", "Challenges", "Tomorrow's priority") coupled with live dynamic activity summaries and optimistic locking.
- **Settings**: Configurable daily target minutes and analytics IANA timezone.
- **Regression Suite**: Expanded to 52 automated tests covering all edge cases, date boundaries, and failure recoveries.

### Phase 5: Personal Insights, Focus Presets, Data Export & Pagination
- **Personal Productivity Insights (`/insights`)**:
  - Week-over-week performance comparisons (focus hours, task completions, habit consistency).
  - Peak productivity day of week analysis based on 60-day historical intervals.
  - Daily focus target attainment streaks (current and longest) and weekday vs. weekend distribution.
  - Task completion patterns (velocity, priority breakdown, overdue backlog tracking).
  - Habit adherence and streak risk alerts (missed scheduled habits).
  - Goal milestones highlights (milestones achieved, upcoming targets, near-completion goals).
  - Practical, rule-based improvement suggestions with direct action links.
  - Data sufficiency check (< 3 active days) with progress guidance.
  - Transparent "How this is calculated" footnotes on all metrics.
- **Focus Experience Improvements (`/focus`)**:
  - Pomodoro presets: 25/5 min (Classic), 50/10 min (Deep Work), 15/3 min (Sprint), Custom, and Open-ended.
  - Visual target progress bar and completion status.
  - Dedicated client-side Break Mode countdown timer (does not record focus time or pollute database).
  - Offline synthesized Web Audio chime and desktop notifications on reaching targets.
  - Session history filtering by linked task or linked goal.
- **Data Ownership & Export (`/settings`)**:
  - Authenticated export in JSON format containing all user entities (tasks, notes, goals, habits, completions, focus sessions, reviews, settings) excluding secrets and tokens.
  - Authenticated CSV downloads for Tasks, Focus Sessions, Notes, Habits, Daily Reviews, and Goals.
- **Collection Pagination**:
  - Added optional `page` and `limit` query parameters to `GET /api/tasks` and `GET /api/notes`.
  - Added accessible `PaginationBar` component to `/tasks` and `/notes` pages while maintaining backward-compatible unpaginated responses when omitted.
- **Premium Authentication UI Redesign (`/login` & `/register`)**:
  - Tablet-inspired dark device enclosure with 38px rounded frame and subtle ambient elevation.
  - Left panel: Soft sage pastel gradient, original 3D claymorphism SVG illustration depicting a focused workspace (laptop with dashboard metrics, potted snake plant, desk clock, coffee mug, and 25-minute deep focus badge), motivational copy, and feature tags.
  - Right panel: Clean white card container with ProdTrack brand header, exact headings ("Welcome back" / "Create your account"), icons for Name, Email, Password, interactive show/hide password visibility toggle, lime pill submit button, accessible error banner, and seamless switch links.
  - Fully responsive: Side-by-side on desktop/tablet, automatically collapsing to a full-width mobile card layout below 768px with zero horizontal scroll.
- **Regression Suite**: Expanded to 59 passing automated integration tests.

---

## 3. Database Setup & Collections

ProdTrack connects to a persistent local MongoDB instance:
- **Default URI:** `mongodb://127.0.0.1:27017/prodtrack` (configured in `backend/.env`)
- **Status:** Verified active and responsive (`ping: { ok: 1 }`).

### Active Collections (10 Total):
1. `users`: Normalized email, salted scrypt hash.
2. `sessions`: SHA-256 token hashes, user ID, expiration TTL index.
3. `tasks`: Title, priority, category, dueDate, completed, completedAt, importKey, user.
4. `notes`: Title, content, pinned, tags, journalDate, user.
5. `goals`: Title, description, status, archived, targetDate, milestones (with `achievedAt`), user.
6. `habits`: Title, titleKey, timeZone, schedule, archived, user.
7. `habitcompletions`: Habit reference, date, user.
8. `focussessions`: Active flag, state, segments, leaseUntil, runningSince, taskId, goalId, user.
9. `productivitysettings`: TimeZone, dailyTargetMinutes, user.
10. `dailyreviews`: Date, wentWell, challenges, tomorrow, version (`__v`), user.

---

## 4. Development & Verification Commands

All commands can be executed from the root workspace directory `C:\Users\HP\OneDrive\Desktop\Production Track\ProdTrack`:

| Command | Action | Notes |
| :--- | :--- | :--- |
| `npm run dev` | Starts frontend & backend concurrently | Frontend: `http://127.0.0.1:5173`, API: `http://127.0.0.1:4000` |
| `npm run dev -w frontend` | Starts frontend only | Vite dev server with proxy to port 4000 |
| `npm run dev -w backend` | Starts backend only | Node with `--watch` mode |
| `npm run dev:isolated -w backend` | Starts isolated QA API | Uses `mongodb-memory-server`; no local DB needed |
| `npm test` | Runs complete regression suite | Executes 59 tests against isolated in-memory DB |
| `npm run lint` | Runs ESLint across frontend | Enforces React hooks & TypeScript lint rules |
| `npm run typecheck` | Strict TypeScript verification | `tsc --noEmit` on frontend |
| `npm run build` | Builds production frontend | Generates optimized output in `frontend/dist` |

---

## 5. Current Git Status

- **Repository Status:** Not currently initialized as a Git repository (clean directory workspace).
- **File System State:** Clean; all source files compile, lint without warnings, and build successfully.
- **Artifacts & Logs:**
  - Full automated tests: 59 passing.
  - Production build: `frontend/dist` ready.
  - Verification reports: `docs/PHASE4-VERIFICATION.md` and `docs/PHASE5-VERIFICATION.md` present.
  - UI Screenshots: `docs/login-desktop.png`, `docs/login-mobile.png`, `docs/register-desktop.png`, `docs/register-mobile.png`.

---

## 6. Outstanding Work & Operational Considerations

1. **Production Deployment Configuration**:
   - Production hosting requires a reverse proxy (e.g., Nginx, Caddy, or Cloudflare) configured to serve `frontend/dist` with SPA route fallback (redirecting 404s to `index.html`).
   - Reverse proxy must forward `/api/*` to the backend Express service.
   - HTTPS is required in production to allow browser acceptance of `__Host-` Secure cookies.
   - `CLIENT_ORIGIN` in `backend/.env` must match the production domain exactly.

2. **Distributed Infrastructure Considerations**:
   - Authentication limiter is currently per-process in-memory; for clustered deployments, integrate Redis.

---

## 7. Recommended Future Scope (Phase 6 Roadmap)

For future development phases, recommended enhancements include:

1. **Automated Database Backups & Snapshots**:
   - Scheduled database dump cron / script with AES-256 encryption.
2. **PWA & Offline Synchronization**:
   - Service worker caching for the app shell and local IndexedDB queue for offline focus interval recording.
3. **Cross-Tab Live Synchronization**:
   - Utilize `BroadcastChannel` or WebSockets so starting or pausing a focus session in one tab updates all open tabs instantly.
4. **Containerization**:
   - Dockerfile and `docker-compose.yml` for simplified multi-environment deployment.
