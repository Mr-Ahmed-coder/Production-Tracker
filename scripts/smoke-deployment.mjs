import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Read-only production checks. The sole POST deliberately fails Origin validation.
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = option('--base', 'https://production-tracker-navy.vercel.app');
const local = option('--local-build', null);
const marker = args.includes('--require-routing');
const routes = ['/', '/login', '/calendar', '/tasks', '/notes', '/goals', '/habits', '/focus', '/analytics', '/insights', '/settings'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const failures = [];
async function check(label, run) {
  try { console.log(JSON.stringify({ check: label, ok: true, ...await run() })); }
  catch (error) { failures.push(label); console.log(JSON.stringify({ check: label, ok: false, error: error.message })); }
}
async function get(path, options = {}) {
  return fetch(new URL(path, base), { cache: 'no-store', signal: AbortSignal.timeout(25000), ...options });
}
let index;
for (const route of routes) {
  await check(route, async () => {
    for (let pass = 0; pass < 2; pass++) {
      const response = await get(route);
      assert.equal(response.status, 200, `HTTP ${response.status}`);
      assert.match(response.headers.get('content-type') || '', /text\/html/);
      if (marker) assert.equal(response.headers.get('x-studymomentum-routing'), 'spa-fallback-v2');
      const html = await response.text();
      assert.match(html, /id="root"/);
      if (route === '/') index = html;
      else assert.equal(html, index, 'Route must serve the same SPA entry');
    }
    return { requests: 2, status: 200 };
  });
}
if (index) {
  if (local) await check('local index matches deployed index', async () => {
    assert.equal(index, await readFile(resolve(local, 'index.html'), 'utf8'));
    return { sha256: digest(index) };
  });
  const assets = [...new Set(index.match(/\/assets\/[^"'\s>]+\.(?:js|css)/g) || [])];
  assert.ok(assets.length, 'No built assets found');
  for (const asset of assets) await check(asset, async () => {
    const response = await get(asset);
    assert.equal(response.status, 200);
    const type = response.headers.get('content-type');
    assert.match(type || '', asset.endsWith('.css') ? /text\/css/ : /javascript/);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (local) assert.equal(digest(bytes), digest(await readFile(resolve(local, asset.slice(1)))));
    return { status: 200, type, sha256: digest(bytes) };
  });
}
for (const [path, status, options] of [
  ['/api/health', 200], ['/api/auth/me', 401],
  ['/api/auth/me', 401, { headers: { Cookie: '__Host-prodtrack_session=' + '0'.repeat(64) } }],
  ['/api/not-a-route', 404], ['/api', 404], ['/api/', 404],
  ['/api/auth/logout', 403, { method: 'POST', headers: { Origin: 'https://invalid.example', 'X-ProdTrack-Request': '1' } }],
]) await check(`${options?.method || 'GET'} ${path}${options?.headers?.Cookie ? ' invalid session' : ''}`, async () => {
  const response = await get(path, options);
  assert.equal(response.status, status, `HTTP ${response.status}`);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  const body = await response.json();
  if (path === '/api/health') assert.equal(body.database, 'connected');
  return { status, ...(path === '/api/health' ? { database: body.database, commit: body.commit ?? null } : {}) };
});
console.log(JSON.stringify({ base, failures, passed: failures.length === 0 }));
process.exitCode = failures.length ? 1 : 0;
