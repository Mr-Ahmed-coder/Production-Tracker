// Intentionally no CacheStorage, IndexedDB, precaching or background sync.
// Never intercept APIs, assets or mutations. Authenticated HTML is network-only.
const offlinePage = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#eff1e7"><title>StudyMomentum · Connection needed</title>
<style>body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;background:#eff1e7;color:#272a23;font:16px/1.6 system-ui,sans-serif;box-sizing:border-box;padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))}main{max-width:28rem;background:#fafbf5;padding:28px;border:1px solid #e0e5d4;border-radius:24px}h1{font-size:1.5rem}button{font:inherit;background:#d6fa34;color:inherit;border:0;border-radius:24px;padding:12px 22px;cursor:pointer}button:focus-visible{outline:3px solid #6b8617;outline-offset:4px}</style>
</head><body><main><strong>StudyMomentum</strong><h1>Let’s reconnect.</h1><p>Your workspace needs an internet connection. No private records are stored for offline access, and no changes have been sent from this page.</p><button onclick="location.reload()">Try again</button></main></body></html>`;
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    url.origin !== self.location.origin ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/")
  )
    return;
  event.respondWith(
    fetch(request, { cache: "no-store" }).catch(
      () =>
        new Response(offlinePage, {
          status: 503,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        }),
    ),
  );
});
// Keep normal waiting-worker lifecycle: no forced activation, page reloads or discarded forms.
