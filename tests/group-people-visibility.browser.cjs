// Run against python serve.py. PLAYWRIGHT_PATH may point to the bundled runtime.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const width = Number(process.env.TEST_WIDTH || 390);
    const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:5000';
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!['GET', 'HEAD'].includes(request.method())) {
        writes.push(request.method() + ' ' + url.pathname);
        return route.abort();
      }
      if (url.origin === baseUrl) return route.continue();
      if (url.pathname === '/functions/v1/business-profile') {
        return route.fulfill({ contentType: 'application/json', body: '{"business":{}}' });
      }
      if (url.pathname === '/rest/v1/product_catalog') {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify([
          { id: 'metal', name: 'Plieninė QR lentelė', price_cents: 6000, plain_price_cents: 5000, currency: 'EUR', enabled: true }
        ]) });
      }
      return route.fulfill({ status: 204, body: '' });
    });

    const names = ['Pirmasis', 'Antrasis', 'Trečiasis', 'Ketvirtasis', 'Penktasis', 'Šeštasis', 'Septintasis', 'Aštuntasis'];
    async function expectSaved(count) {
      await page.waitForFunction(expected => {
        const draft = JSON.parse(localStorage.getItem('atminimas.editor.draft.v1') || 'null');
        return draft && draft.group && draft.group.enabled &&
          JSON.stringify(draft.group.people.map(person => person.form.vardas)) === JSON.stringify(expected);
      }, names.slice(0, count));
    }
    async function addPerson(index) {
      await page.locator('#editor-person-add').click();
      await page.waitForFunction(count => document.querySelectorAll('#editor-people button').length === count &&
        document.querySelector('[name=vardas]').value === '' && !document.querySelector('#editor-person-add').disabled,
      index + 1);
      await page.locator('[name=vardas]').fill(names[index]);
      await expectSaved(index + 1);
    }
    async function expectAllCardsVisible(count) {
      const result = await page.locator('#editor-people').evaluate(container => {
        const bounds = container.getBoundingClientRect();
        return {
          horizontalOverflow: container.scrollWidth > container.clientWidth + 1,
          cards: Array.from(container.children).map(card => {
            const rect = card.getBoundingClientRect();
            return {
              label: card.textContent,
              inside: rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 &&
                rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1,
              width: rect.width,
              height: rect.height
            };
          })
        };
      });
      assert.equal(result.cards.length, count);
      assert.equal(result.horizontalOverflow, false, 'all people must be visible without horizontal scrolling');
      for (const card of result.cards) {
        assert.equal(card.inside, true, 'person card must fit inside the selector: ' + card.label);
        assert.ok(card.width > 0 && card.height > 0);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    }

    await page.goto(baseUrl + '/redaktorius.html?product=digital');
    await page.waitForFunction(() => document.querySelectorAll('#editor-people button').length === 1);
    await page.locator('#editor-group-type').selectOption('group');
    await page.locator('[name=vardas]').fill(names[0]);
    await expectSaved(1);
    for (let index = 1; index < 5; index++) await addPerson(index);
    await expectAllCardsVisible(5);
    await page.locator('#editor-people button').nth(3).click();
    await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Ketvirtasis');
    names[3] = 'Ketvirtasis pakeistas';
    await page.locator('[name=vardas]').fill(names[3]);
    await expectSaved(5);
    await page.locator('#editor-people button').nth(4).click();
    await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Penktasis');
    await page.locator('#editor-people button').nth(3).click();
    await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Ketvirtasis pakeistas');
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#editor-people button').length === 5 &&
      document.querySelector('[name=vardas]').value === 'Ketvirtasis pakeistas');
    await expectSaved(5);
    await expectAllCardsVisible(5);
    fs.mkdirSync('tmp', { recursive: true });
    await page.locator('.editor-group').screenshot({ path: 'tmp/group-people-visibility-' + width + '.png' });

    for (let index = 5; index < 8; index++) {
      await page.locator('#editor-person-add').click();
      await page.waitForFunction(count => document.querySelectorAll('#editor-people button').length === count &&
        document.querySelector('[name=vardas]').value === '' && !document.querySelector('#editor-form').inert,
      index + 1);
      await page.locator('[name=vardas]').fill(names[index]);
      await expectSaved(index + 1);
    }
    assert.equal(await page.locator('#editor-person-add').isDisabled(), true, 'the eight-person limit remains enforced');
    await expectAllCardsVisible(8);
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#editor-people button').length === 8);
    await expectSaved(8);
    await expectAllCardsVisible(8);
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, [], 'all edits stay in the isolated local draft');
    console.log('PASS: all five/eight editor cards visible, fourth/fifth independent, local reload retained, eight-person limit (' + width + 'px)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
