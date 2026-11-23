# Mobile stability and install support — 2026-11-23

Implemented in the existing StudyMomentum application. No deployment, push, paid service, API modification, authentication change or Atlas data change was made. Pre-existing uncommitted email-reminder work was preserved. No new package dependencies were added.

## Audit findings and changes

| Finding | Change |
| --- | --- |
| Authentication fields used 14.5px; filters/editors inherited 11–14px text | Mobile and coarse-pointer inputs, selects, textareas and editable text use at least 16px, with a 16px fallback and a root-relative minimum. Desktop mouse layouts retain their previous fonts. |
| `100vh` page floors and sidebar heights could depend on hidden browser chrome | Use `svh` as the stable mobile page floor, with existing `vh` fallback. Dialogs use the current VisualViewport height rather than a fixed screen height. |
| Keyboard can reduce only the visible viewport, leaving fixed elements below it | Add `interactive-widget=resizes-content` for supporting Android browsers and a VisualViewport adapter for other resize behavior. A touch/editable/height-drop heuristic identifies keyboard obstruction, constrains/repositions dialogs, hides phone bottom navigation while typing and scrolls an obscured field only when necessary. It never blurs or refocuses fields. |
| Pinch zoom also changes VisualViewport dimensions | Ignore keyboard sizing during pinch zoom. No zoom limits, gesture cancellation, orientation lock or global scroll lock were introduced. |
| Edge-to-edge installed mode lacked notch/home-indicator spacing | Add `viewport-fit=cover` and safe-area padding for content, authentication pages, dialogs and phone navigation. Reserve footer/toast space above the navigation. |
| Narrow forms and native selects could enforce intrinsic widths | Constrain flex/grid children, filters, popovers and fields; stack two-column forms on phones. A real long-title test exposed an approximately 891px Focus page caused by the history select. The filter row now wraps and the select cannot widen its parent. |
| Eleven bottom navigation icons became very small on phones | Preserve all destinations in a horizontally scrollable navigation strip with 44×44px targets. Reserve enough height for a native scrollbar and the home indicator. Navigation and calendar/table scrolling remain local to their own containers; document overflow is not hidden. |
| Manifest only supplied an SVG | Supply 192px and 512px PNGs, a separate 512px full-bleed maskable icon, and a 180px iOS touch icon derived from the existing book-and-spark mark. Preserve existing branding and colors. |
| iOS install metadata and production worker were missing | Add iOS standalone/title/status-bar tags, manifest identity/scope/start URL and Android standalone display configuration. Register a production-only root service worker in secure contexts. |

`svh`/`dvh` alone do not solve software keyboard resizing. Chrome's explanation of layout versus visual viewport behavior supports the separate adapter: [Chrome viewport resizing](https://developer.chrome.com/blog/viewport-resize-behavior/). Edge-to-edge layouts require explicit inset handling: [WebKit safe areas](https://webkit.org/blog/7929/designing-websites-for-iphone-x/).

## Privacy, offline behavior and updates

The worker uses **no CacheStorage, IndexedDB, precache list or background sync**. It does not intercept API requests, mutations, assets or cross-origin traffic. Same-origin page navigations use the network with `cache: no-store`. Existing HTTP-only cookie authentication, CSRF checks, API cache headers and task persistence are untouched.

A failed navigation receives a static, non-cacheable **HTTP 503 reconnect page**, containing no account information or saved activities. Real HTTP error responses pass through unchanged. There is no offline account-data mode or replay queue. An already-open page still uses its existing API loading/error handling and transient React state. Previously stored Phase 1 import data is not deleted or changed.

Normal browser caching of public static files and installed worker code is separate from private data storage. `sw.js` is configured with `Cache-Control: no-store`, and registration uses `updateViaCache: none`. The manifest revalidates. The worker follows the browser's normal waiting lifecycle: it never forces an activation, reload or form loss during an update. Closing all open app windows/tabs and reopening allows a waiting update to take over.

## Installation after an approved release

The implementation is local; the production site will not receive these changes until a separately approved deployment.

- Serve the existing frontend over HTTPS, retaining the current API-first Vercel rewrites. Public manifest, worker and icon files must be present in `frontend/dist`.
- **iPhone Safari:** open the released site, use Share → Add to Home Screen, and enable Open as Web App if that option is offered. Launch from the new home-screen icon. The dedicated Apple touch icon and standalone metadata are supplied.
- **Android Chrome:** open the released site, use the browser's Install app/Add to Home screen option. Native install promotion depends on browser engagement and whether the application is already installed; no custom prompt is forced.
- Sign in normally if the installed application's cookie/session store differs from the browser's. No cookie-copying or authentication bypass is added.

Manifest identity, scope, standalone display and correctly sized PNGs are supplied for native install support. Browser requirements and install promotion vary: [Chrome install criteria](https://web.dev/articles/install-criteria), [Apple web app configuration](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html).

## Modified and created files for this task

- `frontend/index.html`: viewport, iOS standalone/status metadata and Apple touch icon link.
- `frontend/public/manifest.json`: stable identity/scope, standalone launch and PNG/maskable icons.
- `frontend/public/sw.js`: network-only navigation and private-data-free reconnect page.
- `frontend/public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`; `frontend/public/apple-touch-icon.png`: generated platform icons.
- `frontend/src/mobile.css`: isolated mobile/touch overrides; existing desktop styles stay in `styles.css`.
- `frontend/src/lib/mobileViewport.js` and `.d.ts`: viewport/keyboard helper and TypeScript interface.
- `frontend/src/lib/registerPwa.ts`: secure production registration with normal update lifecycle and non-sensitive failure logging.
- `frontend/src/main.tsx`: load mobile styles and initialize the independent viewport/PWA helpers; dispose viewport listeners during Vite hot updates.
- `frontend/eslint.config.js`: lint the new JS helper and service-worker environment.
- `frontend/vercel.json`: worker/manifest headers; existing API proxy and SPA fallback remain unchanged.
- `scripts/generate-pwa-icons.ps1`: repeatable native Windows rendering of the existing vector brand mark. Run `powershell -File scripts/generate-pwa-icons.ps1` from the project root when regenerating icons.
- `backend/test/mobile-pwa.test.js`: seven automated tests for metadata, PNG dimensions, keyboard/zoom distinctions, listener cleanup and worker privacy/error behavior.
- `README.md`, this report and `docs/verification/mobile-pwa-tasks.jpg`: handoff and local visual evidence.

## Verification results

### Automated

The full suite passed **114 tests**, including the existing authentication, user isolation, task/recurring calendar, notes, goals, habits, focus, analytics and email-reminder regressions. Seven new tests cover mobile/PWA behavior. An initial baseline run had an isolated MongoDB startup exceed its existing 10-second timeout; the complete rerun passed after the UI test servers were stopped. No database timeout configuration or authentication tests were changed to hide that failure.

ESLint, TypeScript and production build were run. Commands from the project root:

```powershell
npm run lint
npm run typecheck
npm run build
node --test --test-concurrency=1 backend/test/*.test.js
```

### Browser and HTTP checks actually performed

Testing used the local production build in the available **desktop Chromium browser**, a disposable account and isolated MongoDB. These are responsive checks, not device emulation or real iPhone/Android results.

- Login fields computed to 16px at 320×568, 390×844, 412×915 and 844×390. Desktop login retained 14.5px at 1280×800.
- Dashboard, tasks, notes, goals, habits, analytics, insights, daily review, Settings and calendar had document scroll width equal to client width at 320px and 390px. Focus initially failed with a long native-select option; after the fix it also fit at 320px, 390px and 412px.
- Task, note and repeating-task editors had 16px controls and fit the narrow viewport. Reducing the viewport to 390×440 constrained the task dialog to 408px with internal scrolling; restoring it retained the entered task title. This simulated a shorter viewport, not an actual software keyboard.
- Created a task with a long unbroken title, checked it in the weekly calendar, refreshed, edited it in Tasks, unchecked it and refreshed again. Changes persisted and calendar/Tasks stayed synchronized.
- Registered, signed out, opened a protected calendar direct link, reached login, signed in again and restored saved data. No authentication changes were required.
- Final bottom navigation targets measured 44px high, with its client/scroll heights both 48px, eliminating its accidental vertical scrollbar. All eleven destinations remain accessible by horizontal scrolling.
- At 1280px, the original 83px sticky desktop sidebar, 11px search font and cream/lime dashboard layout were retained.
- Production preview served worker/manifest and all four PNGs with HTTP 200 and appropriate JavaScript/JSON/PNG MIME types. `/api/health` returned 200 JSON, and unauthenticated `/api/auth/me` returned 401 JSON. Vercel-specific headers are configuration-tested; they are not claimed to be verified on a new production deployment.
- Browser console reported no errors/warnings during the recorded local task workflow. The generated maskable icon was inspected visually. Screenshot shows disposable QA data only.

### Required real-device checks — not performed here

| Target | Status |
| --- | --- |
| Real iPhone Safari | Not available; not tested |
| Installed iOS home-screen PWA | Not available; not tested |
| Real Android Chrome/installed Android app | Not available; not tested |
| Native notch/home indicator and physical keyboard interaction | CSS/logic and short viewport tested; actual device behavior unverified |
| Native installation prompt/icon rendering and standalone relaunch | Manifest/icons/configuration tested; native install not performed |

Before release, run on each real device: install and relaunch; sign in/out; focus email/password/search and modal fields; open/close the keyboard repeatedly; rotate with the keyboard open; expand/collapse browser toolbars; scroll to the last form button; pinch zoom and use larger text; verify safe-area spacing and all navigation destinations; refresh a direct link; go offline and confirm the generic reconnect page; reconnect and ensure the API still restores the actual saved records. Close/reopen an installed app after an update to verify waiting-worker behavior. Check a running focus session across background/foreground transitions using the existing server-backed behavior.

## Remaining limitations

Real iOS/Android keyboard, notch and standalone behavior needs the device checks above. Keyboard detection is intentionally conservative and bypassed during zoom; a floating keyboard or unusual native picker may not trigger its navigation-hiding heuristic. Native scrolling and dialog bounds remain available. Intentional calendar-month/table/navigation horizontal scrolling is preserved inside containers. The application requires a network connection for private records; installability is not a promise of offline task access. No push notifications, background writes or new backend services were added.
