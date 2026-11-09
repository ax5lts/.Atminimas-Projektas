// Isolated browser regression: every request is fulfilled locally or mocked.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      const calls = [], errors = [];
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.pathname === '/functions/v1/profile-content') {
          calls.push({ method: request.method(), url: request.url(), body: request.postDataJSON() });
          if (request.method() === 'GET') return route.fulfill({ status: 403, json: { code: 'access_code_required', error: 'Reikalingas prieigos kodas.' } });
          const body = request.postDataJSON();
          if (body.access_code !== '58371') return route.fulfill({ status: 403, json: { code: 'access_code_invalid', error: 'Neteisingas prieigos kodas.' } });
          return route.fulfill({ json: { atminimas: { id: 'test-profile', vardas: 'Apsaugota istorija', tekstas_200: 'Tik patvirtinus kodą.' }, access_code_protected: true } });
        }
        if (url.origin === 'https://viewer.example.test') {
          const relative = url.pathname.replace(/^\//, '');
          assert.ok(/^(?:sablonas-viskas\.html|(?:assets|css)\/[a-z0-9_.-]+)$/.test(relative));
          const file = path.join(root, relative);
          const contentType = relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.html') ? 'text/html' : 'image/png';
          return route.fulfill({ contentType, body: fs.readFileSync(file) });
        }
        throw new Error('Unexpected network request: ' + request.url());
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('https://viewer.example.test/sablonas-viskas.html?slug=test-profile');
      await page.locator('#memorial-access').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#turinys').isVisible(), false);
      assert.equal(await page.getByText('Apsaugota istorija').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      const buttonBox = await page.locator('#memorial-access-form button').boundingBox();
      assert.ok(buttonBox.height >= 44 && buttonBox.x >= 0 && buttonBox.x + buttonBox.width <= width);
      if (width === 320) {
        fs.mkdirSync(path.join(root, '.codex-qa'), { recursive: true });
        await page.screenshot({ path: path.join(root, '.codex-qa/security-access-320.png') });
      }
      await page.locator('[name=access_code]').fill('58370');
      await page.locator('#memorial-access-form button').click();
      await page.getByText('Neteisingas prieigos kodas.').waitFor();
      assert.equal(await page.locator('#turinys').isVisible(), false);
      assert.equal(await page.locator('[name=access_code]').inputValue(), '');
      await page.locator('[name=access_code]').fill('58371');
      await page.locator('#memorial-access-form button').click();
      await page.locator('#turinys').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#memorial-access').isVisible(), false);
      assert.equal(await page.locator('#memorial-community').isVisible(), false);
      assert.equal(await page.locator('[name=access_code]').inputValue(), '');
      assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes('58371')), false);
      assert.equal(calls.length, 3);
      assert.ok(calls.every(call => !call.url.includes('58371') && !call.url.includes('access_code')));
      assert.deepEqual(calls[2].body, { profile_id: 'test-profile', access_code: '58371' });
      assert.deepEqual(errors, []);
      await context.close();
      console.log('PASS: protected viewer, failed/successful unlock, no code URL/storage, mobile width ' + width);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
