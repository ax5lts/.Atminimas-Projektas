const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/auth.js'), 'utf8');
const key = 'atminimas.auth.session.v1';
const token = (sub, suffix = '') => `e30.${Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.${suffix}`;
const currentSession = (suffix = 'old', sub = 'user-1') => ({ access_token: token(sub, suffix), refresh_token: `refresh-${suffix}`, expires_at: Math.floor(Date.now() / 1000) + 3600 });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function storage() { const values = new Map(); return { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }; }
function setup(fetch, session = currentSession(), apiKey = 'legacy-anon') {
  const sessionStorage = storage();
  if (session) sessionStorage.setItem(key, JSON.stringify(session));
  const context = { fetch, Headers, URL, URLSearchParams, Uint8Array, atob, Date,
    sessionStorage, localStorage: storage(), setTimeout: () => 1, clearTimeout() {},
    location: { href: 'https://site.example/prisijungti.html', search: '', hash: '' },
    ATMINIMAS_CONFIG: { SUPABASE_URL: 'https://api.example', SUPABASE_ANON_KEY: apiKey }
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return { auth: context.AtminimasAuth, sessionStorage };
}

test('late 401 responses reuse a refreshed token without rotating it again', async () => {
  const a = deferred(), b = deferred();
  let refreshes = 0;
  const sent = [];
  const next = currentSession('new');
  const { auth } = setup(async (url, options) => {
    if (url.includes('grant_type=refresh_token')) { refreshes++; return json(next); }
    sent.push([url, options.headers.Authorization]);
    if (options.headers.Authorization === `Bearer ${next.access_token}`) return json({ ok: true });
    return url.endsWith('/a') ? a.promise : b.promise;
  });
  const requestA = auth.authorizedFetch('https://api.example/a');
  const requestB = auth.authorizedFetch('https://api.example/b');
  await new Promise(setImmediate);
  a.resolve(json({}, 401));
  assert.equal((await requestA).status, 200);
  b.resolve(json({}, 401));
  assert.equal((await requestB).status, 200);
  assert.equal(refreshes, 1);
  assert.equal(sent.length, 4);
});

test('overlapping user checks share one request, later checks remain fresh', async () => {
  const gate = deferred(); let calls = 0;
  const { auth } = setup(async () => { calls++; return gate.promise; });
  const one = auth.user(), two = auth.user();
  await new Promise(setImmediate);
  assert.equal(calls, 1);
  gate.resolve(json({ id: 'user-1' }));
  assert.equal((await one).id, 'user-1');
  assert.equal((await two).id, 'user-1');
});

test('already verified admin identity skips a redundant user request', async () => {
  const urls = [];
  const { auth } = setup(async url => { urls.push(url); return json([{ role: 'admin' }]); });
  assert.equal(await auth.isAdmin({ id: 'user-1' }), true);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /\/rest\/v1\/user_roles\?/);
});

test('signing out while refresh is pending never replays a write anonymously', async () => {
  const gate = deferred(); let writes = 0;
  const { auth } = setup(async url => {
    if (url.includes('grant_type=refresh_token')) return gate.promise;
    if (url.endsWith('/logout')) return json({});
    writes++; return json({}, 401);
  });
  const request = auth.authorizedFetch('https://api.example/write', { method: 'POST', body: '{}' });
  await new Promise(setImmediate);
  auth.signOut();
  gate.resolve(json(currentSession('new')));
  assert.equal((await request).status, 401);
  assert.equal(writes, 1);
  assert.equal(auth.session(), null);
});

test('an old account failure does not clear or retry with a newer account session', async () => {
  const gate = deferred(); let calls = 0;
  const { auth, sessionStorage } = setup(async () => { calls++; return gate.promise; });
  const request = auth.user();
  await new Promise(setImmediate);
  sessionStorage.setItem(key, JSON.stringify(currentSession('other', 'user-2')));
  gate.resolve(json({}, 401));
  assert.equal(await request, null);
  assert.equal(auth.userId(), 'user-2');
  assert.equal(calls, 1);
});

test('Headers input preserves custom fields and replaces stale authorization', async () => {
  let sent;
  const { auth } = setup(async (_url, options) => { sent = new Headers(options.headers); return json({}); });
  await auth.authorizedFetch('https://api.example/data', { headers: new Headers({ authorization: 'Bearer stale', 'X-Trace': 'trace', 'Content-Type': 'application/json' }) });
  assert.equal(sent.get('authorization'), `Bearer ${auth.accessToken()}`);
  assert.equal(sent.get('x-trace'), 'trace');
  assert.equal(sent.get('content-type'), 'application/json');
});

test('publishable keys are sent as apikey and never as an invalid bearer token', async () => {
  let sent;
  const { auth } = setup(async (_url, options) => { sent = new Headers(options.headers); return json({}); }, null, 'sb_publishable_test');
  await auth.authorizedFetch('https://api.example/public');
  assert.equal(sent.get('apikey'), 'sb_publishable_test');
  assert.equal(sent.get('authorization'), null);
});

test('non-JSON auth errors keep HTTP status and show a readable message', async () => {
  const { auth } = setup(async () => new Response('<html>Bad gateway</html>', { status: 502 }), null);
  await assert.rejects(auth.signIn('test@example.com', 'password'), error => error.status === 502 && /laikinai nepasiekiama/.test(error.message));
});
