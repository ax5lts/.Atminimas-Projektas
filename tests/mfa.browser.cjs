const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const token = aal => 'e30.' + Buffer.from(JSON.stringify({ sub: 'test-user', aal, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.test';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(value => sessionStorage.setItem('atminimas.auth.session.v1', JSON.stringify(value)), { access_token: token('aal1'), refresh_token: 'test-refresh' });
    const page = await context.newPage(); const errors = []; let verified = false; let attempts = 0;
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://*.supabase.co/**', async route => {
      const url = new URL(route.request().url()); let body = {}; let status = 200;
      if (url.pathname.endsWith('/auth/v1/user')) body = { id: 'test-user', factors: verified ? [{ id: 'test-factor', status: 'verified', factor_type: 'totp' }] : [] };
      else if (url.pathname.endsWith('/auth/v1/factors')) body = { id: 'test-factor', totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="white"/><rect x="20" y="20" width="200" height="200" fill="black"/></svg>', secret: 'TEST-ONLY-SECRET' } };
      else if (url.pathname.endsWith('/challenge')) body = { id: 'test-challenge' };
      else if (url.pathname.endsWith('/verify')) {
        if (++attempts === 1) { status = 400; body = { msg: 'Invalid code' }; }
        else { verified = true; body = { access_token: token('aal2'), refresh_token: 'verified-refresh', expires_in: 3600 }; }
      } else if (url.pathname.includes('/user_roles')) body = [{ role: 'admin' }];
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('http://127.0.0.1:5000/saugumas.html?next=admin.html');
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
    await page.screenshot({ path: 'tmp/mfa-mobile-verified.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS MFA enrollment, failed verification retry, session upgrade, secret cleanup, local next path, mobile layout. Mock Auth only.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
