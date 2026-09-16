// Run against python serve.py. PLAYWRIGHT_PATH may point to the bundled runtime.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const width = Number(process.env.TEST_WIDTH || 390);
    const baseUrl = 'http://127.0.0.1:5000';
    // Fast back-to-back navigations should not race decorative cross-page transitions.
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    page.on('pageerror', error => errors.push(error.message));

    // Exercise the real catalog reader while keeping all requests in this test local.
    // No profile, account, order, payment, or email can be created by this test.
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!['GET', 'HEAD'].includes(request.method())) {
        writes.push(request.method() + ' ' + url.pathname);
        return route.abort();
      }
      if (url.origin === baseUrl) return route.continue();
      if (url.pathname === '/rest/v1/product_catalog') {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify([
          { id: 'metal', name: 'Plieninė QR lentelė', price_cents: 6000, plain_price_cents: 5000, currency: 'EUR', enabled: true }
        ]) });
      }
      if (url.pathname === '/functions/v1/business-profile') {
        return route.fulfill({ contentType: 'application/json', body: '{"business":{}}' });
      }
      return route.fulfill({ status: 204, body: '' });
    });

    async function shop(query = '') {
      await page.goto(baseUrl + '/parduotuve.html' + query);
      await page.waitForFunction(() => document.querySelector('#product-create-link').getAttribute('aria-disabled') === 'false');
    }
    async function choose(name, value) {
      const input = page.locator('input[name="' + name + '"][value="' + value + '"]');
      await input.locator('..').click();
      assert.equal(await input.isChecked(), true);
    }
    async function expectPrice(amount) {
      assert.match(await page.locator('#product-price').textContent(), new RegExp(amount + ',00'));
      assert.match(await page.locator('#product-total').textContent(), new RegExp((amount + 3) + ',00'));
      assert.match(await page.locator('#product-create-link').textContent(), new RegExp(amount + ',00'));
    }
    async function editor() {
      await page.locator('#product-create-link').click();
      await page.waitForURL('**/redaktorius.html?**');
      await page.waitForFunction(() => document.querySelectorAll('#editor-people button').length > 0 && !new URL(location.href).searchParams.has('memorial'));
      assert.equal(new URL(page.url()).searchParams.get('product'), 'metal');
      assert.equal(new URL(page.url()).searchParams.get('color'), 'silver');
      assert.equal(new URL(page.url()).searchParams.get('pattern'), 'plain');
    }
    async function expectDraft(enabled, names) {
      await page.waitForFunction(({ enabled, names }) => {
        const draft = JSON.parse(localStorage.getItem('atminimas.editor.draft.v1') || 'null');
        return draft && draft.group && draft.group.enabled === enabled &&
          JSON.stringify(draft.group.people.map(person => person.form.vardas)) === JSON.stringify(names);
      }, { enabled, names });
    }
    async function expectNoOverflow() {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    }

    await shop();
    assert.equal(await page.locator('input[name="plaque_color"][value="silver"]').isChecked(), true, 'fresh visits start with silver');
    assert.equal(await page.locator('#product-image').getAttribute('data-color'), 'silver');
    assert.equal(await page.locator('#product-image').getAttribute('data-pattern'), 'plain');
    await expectPrice(50);
    for (const type of ['single', 'group']) {
      await choose('memorial_type', type);
      for (const pattern of ['tree', 'heart', 'wings', 'plain']) {
        await choose('plaque_pattern', pattern);
        await expectPrice(pattern === 'plain' ? 50 : 60);
        assert.equal(new URL(await page.locator('#product-create-link').getAttribute('href'), baseUrl).searchParams.get('memorial'), type);
      }
    }
    await expectNoOverflow();
    fs.mkdirSync('tmp', { recursive: true });
    await page.screenshot({ path: 'tmp/shop-group-' + width + '.png', fullPage: true });

    await shop('?color=gold&pattern=heart&memorial=single');
    assert.equal(await page.locator('#product-image').getAttribute('data-color'), 'gold', 'explicit gold selection is respected');
    await expectPrice(60);
    await shop();
    assert.equal(await page.locator('#product-image').getAttribute('data-color'), 'gold', 'saved gold selection is respected');
    await choose('plaque_color', 'silver');
    await choose('plaque_pattern', 'plain');
    await choose('memorial_type', 'group');
    await editor();
    assert.equal(await page.locator('#editor-group-type').inputValue(), 'group');
    assert.equal(await page.locator('#editor-group-controls').isVisible(), true);
    await page.locator('[name=vardas]').fill('Jonas');
    await page.locator('[name=pavarde]').fill('Pirmasis');
    await expectDraft(true, ['Jonas']);

    // The shop parameter is consumed once, so later editor choices survive reload.
    await page.locator('#editor-group-type').selectOption('single');
    await expectDraft(false, ['Jonas']);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Jonas' && document.querySelectorAll('#editor-people button').length === 1);
    assert.equal(await page.locator('#editor-group-type').inputValue(), 'single');
    assert.equal(new URL(page.url()).searchParams.has('memorial'), false);

    // A new explicit group choice upgrades an existing single-person draft without losing fields.
    await shop();
    await choose('memorial_type', 'group');
    await editor();
    assert.equal(await page.locator('#editor-group-type').inputValue(), 'group');
    assert.equal(await page.locator('[name=vardas]').inputValue(), 'Jonas');
    assert.equal(await page.locator('[name=pavarde]').inputValue(), 'Pirmasis');
    await page.locator('#editor-person-add').click();
    await page.waitForFunction(() => document.querySelectorAll('#editor-people button').length === 2 && document.querySelector('[name=vardas]').value === '');
    await page.locator('[name=vardas]').fill('Ona');
    await page.locator('[name=pavarde]').fill('Antroji');
    await expectDraft(true, ['Jonas', 'Ona']);

    // Returning through a single-person shop choice must not hide or discard a group draft.
    await shop();
    await choose('memorial_type', 'single');
    await expectPrice(50);
    await editor();
    assert.equal(await page.locator('#editor-group-type').inputValue(), 'group');
    assert.equal(await page.locator('#editor-people button').count(), 2);
    await page.locator('#editor-people button').first().click();
    await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Jonas');
    assert.equal(await page.locator('[name=pavarde]').inputValue(), 'Pirmasis');
    await page.locator('#editor-people button').nth(1).click();
    await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Ona');
    assert.equal(await page.locator('[name=pavarde]').inputValue(), 'Antroji');
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#editor-people button').length === 2 && document.querySelector('[name=vardas]').value === 'Ona');
    assert.equal(await page.locator('#editor-group-type').inputValue(), 'group');
    assert.equal(await page.locator('#editor-group-controls').isVisible(), true);
    await expectNoOverflow();
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, [], 'browser flow never sends a write request');
    console.log('PASS: silver default, explicit/saved gold, unchanged single/group prices, shop-to-editor group mode, retained drafts, consumed URL preference, responsive layout (' + width + 'px)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
