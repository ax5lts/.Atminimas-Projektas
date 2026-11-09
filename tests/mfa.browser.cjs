const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origin = 'https://mfa.example.test';
const apiOrigin = 'https://mfa-test.supabase.co';
const sessionKey = 'atminimas.auth.session.v1';
const tokenExpiry = Math.floor(Date.now()/1000)+3600;
const token = aal => 'e30.' + Buffer.from(JSON.stringify({ sub: 'test-user', aal, exp: tokenExpiry })).toString('base64url') + '.test';

async function scenario(browser, entry, savedSession) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (savedSession) await context.addInitScript(({ key, value }) => {
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(value));
  }, { key: sessionKey, value: { access_token: token('aal1'), refresh_token: 'test-refresh' } });
  const errors = [], adminReads = [];
  let verified = false, attempts = 0;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) {
      const relative = url.pathname.replace(/^\//, '');
      if (relative === 'assets/supabase-config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.ATMINIMAS_CONFIG = ' + JSON.stringify({ SUPABASE_URL: apiOrigin, SUPABASE_ANON_KEY: 'sb_publishable_mock', PUBLIC_SITE_URL: origin + '/' }) });
      assert.ok(/^(?:[a-z0-9-]+\.html|(?:assets|css)\/[a-z0-9_.-]+)$/.test(relative), 'only local static files are allowed');
      const contentType = relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.html') ? 'text/html' : 'image/png';
      return route.fulfill({ contentType, body: fs.readFileSync(path.join(root, relative)) });
    }
    assert.equal(url.origin, apiOrigin, 'no network request may leave the isolated mock');
    let body = {}, status = 200;
    if (url.pathname === '/auth/v1/token') body = { access_token: token('aal1'), refresh_token: 'test-refresh', expires_in: 3600 };
    else if (url.pathname === '/auth/v1/user') body = { id: 'test-user', email: 'admin@example.test', factors: verified ? [{ id: 'test-factor', status: 'verified', factor_type: 'totp' }] : [] };
    else if (url.pathname === '/auth/v1/factors') body = { id: 'test-factor', totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="white"/><rect x="20" y="20" width="200" height="200" fill="black"/></svg>', secret: 'TEST-ONLY-SECRET' } };
    else if (url.pathname.endsWith('/challenge')) body = { id: 'test-challenge' };
    else if (url.pathname.endsWith('/verify')) {
      if (++attempts === 1) { status = 400; body = { msg: 'Invalid code' }; }
      else { verified = true; body = { access_token: token('aal2'), refresh_token: 'verified-refresh', expires_in: 3600 }; }
    } else if (url.pathname === '/rest/v1/user_roles') body = [{ role: 'admin' }];
    else if (url.pathname.startsWith('/rest/v1/') || url.pathname === '/functions/v1/service-flow') {
      assert.equal(request.headers().authorization, 'Bearer ' + token('aal2'), 'admin data must not be requested before aal2');
      adminReads.push(url.pathname);
      body = url.pathname === '/functions/v1/service-flow' ? { settings: {} } : [];
    } else throw new Error('Unexpected mock API request: ' + url.pathname);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  // Chromium can cancel its own cross-document transition during auth redirects.
  // Keep reporting application exceptions; this cancellation has no app handler.
  page.on('pageerror', error => {
    if (error.name === 'InvalidStateError' && error.message === 'Transition was aborted because of invalid state. ViewTransition opt-in disabled') return;
    errors.push(error.message);
  });
  await page.goto(origin + entry);
  if (!savedSession) {
    await page.locator('#login-email').fill('admin@example.test');
    await page.locator('#login-password').fill('test-only-password');
    await page.locator('#login-form button[type=submit]').click();
  }
  await page.waitForURL(url => url.pathname === '/saugumas.html');
  await page.waitForFunction(() => document.querySelector('#mfa-status').textContent.includes('Administratoriaus veiksmams'));
  assert.equal(await page.locator('#mfa-continue').isVisible(), false, 'unenrolled admin cannot continue before MFA');
  assert.equal(adminReads.length, 0, 'an aal1 admin may read only its own role before enrolling');
  return { context, page, errors, adminReads };
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const { context, page, errors, adminReads } = await scenario(browser, '/prisijungti.html', false);
    await page.locator('#mfa-enroll').click();
    await page.locator('#mfa-qr').waitFor({ state: 'visible' });
    assert.match(await page.locator('#mfa-qr').getAttribute('src'), /^data:image\/svg\+xml/);
    await page.locator('#mfa-code').fill('000000'); await page.locator('button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#mfa-status').textContent.includes('Invalid code'));
    assert.equal(await page.locator('#mfa-setup').isVisible(), true);
    await page.locator('#mfa-code').fill('123456'); await page.locator('button[type=submit]').click();
    await page.waitForFunction(() => window.AtminimasAuth.assuranceLevel() === 'aal2');
    await page.locator('#mfa-continue').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#mfa-secret').textContent(), '');
    assert.equal(await page.locator('#mfa-qr').getAttribute('src'), null);
    assert.equal(await page.evaluate(() => JSON.stringify(sessionStorage).includes('TEST-ONLY-SECRET') || JSON.stringify(localStorage).includes('TEST-ONLY-SECRET')), false);
    assert.equal(await page.locator('#mfa-continue').getAttribute('href'), 'admin.html');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'tmp/mfa-mobile-verified.png'), fullPage: true });
    await page.locator('#mfa-continue').click();
    await page.waitForURL(url => url.pathname === '/admin.html');
    await page.waitForFunction(() => document.querySelector('#admin-status').textContent === 'Administravimo duomenys atnaujinti.');
    assert.ok(adminReads.includes('/rest/v1/profiliai'), 'verified admin must regain access to administration');
    assert.deepEqual(errors, []);
    await context.close();
    for (const entry of ['/admin.html', '/prisijungti.html?next=admin.html']) {
      const existing = await scenario(browser, entry, true);
      assert.deepEqual(existing.errors, []);
      await existing.context.close();
    }
    console.log('PASS: new login and existing aal1 admin sessions require MFA with no factors; enrollment/retry upgrades to aal2 and enables admin; secrets cleaned. Fully isolated mocks.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
