// Isolated search-to-editor regression; no production requests or orders.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origin = 'https://atminimokodas.lt';
const person = {
  full_name: 'Ona Marija Žukauskaitė', first_name: 'Ona Marija', last_name: 'Žukauskaitė',
  birth_date: '1935-04-12', death_date: '2020-02-29',
  cemetery: 'Vilniaus kapinės', municipality: 'Vilnius', source_model: 'test', id: 'test-grave'
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      const errors = [], unexpected = [];
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/functions/v1/cemetery-search') return route.fulfill({ json: { items: [person], hasMore: false } });
        if (url.pathname === '/rest/v1/rpc/ieskoti_kapavieciu') return route.fulfill({ json: [] });
        if (url.pathname === '/functions/v1/grave-photo') return route.fulfill({ status: 404, body: '' });
        if (url.pathname === '/rest/v1/product_catalog') return route.fulfill({ json: [{ id: 'metal', enabled: true, price_cents: 6000, plain_price_cents: 5000, currency: 'EUR' }] });
        if (url.pathname === '/functions/v1/business-profile') return route.fulfill({ json: {} });
        if (url.origin === origin) {
          const relative = url.pathname.replace(/^\//, '');
          if (relative === 'assets/auth.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.AtminimasAuth={accessToken:()=>null,userId:()=>null};' });
          if (/^(?:[a-z-]+\.html|(?:assets|css)\/[a-zA-Z0-9_.-]+)$/.test(relative)) {
            const file = path.join(root, relative);
            if (fs.existsSync(file)) {
              const contentType = relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.html') ? 'text/html' : 'image/webp';
              return route.fulfill({ contentType, body: fs.readFileSync(file) });
            }
          }
        }
        unexpected.push(route.request().url());
        return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      let editorHref;
      for (const source of ['index.html', 'kapu-ieskojimas.html']) {
        await page.goto(origin + '/' + source);
        if (source === 'index.html') await page.locator('details').filter({ has: page.locator('[data-grave-search-form]') }).locator(':scope > summary').click();
        await page.locator('[data-grave-search-form] [name=q]').fill('Ona');
        await page.locator('[data-grave-search-form] button[type=submit]').click();
        await page.locator('.grave-list-item > summary').click();
        const link = page.locator('[data-grave-memorial-order]');
        await link.waitFor({ state: 'visible' });
        editorHref = await link.getAttribute('href');
        const box = await link.boundingBox();
        assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= width + 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        if (source === 'kapu-ieskojimas.html' && width === 390) {
          fs.mkdirSync(path.join(root, '.codex-qa'), { recursive: true });
          await page.locator('.grave-list-item').screenshot({ path: path.join(root, '.codex-qa/grave-memorial-order-390.png') });
        }
      }
      await page.locator('[data-grave-memorial-order]').click();
      await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Ona Marija');
      assert.equal(await page.locator('[name=pavarde]').inputValue(), 'Žukauskaitė');
      assert.equal(await page.locator('[name=gimimo_data]').inputValue(), person.birth_date);
      assert.equal(await page.locator('[name=mirties_data]').inputValue(), person.death_date);
      await page.waitForFunction(() => !location.search.includes('graveName'));
      assert.equal(new URL(page.url()).searchParams.get('product'), 'metal');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.locator('[name=vardas]').fill('Išsaugotas vardas');
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('atminimas.editor.draft.v1')).form.vardas === 'Išsaugotas vardas');
      await page.goto(origin + '/' + editorHref);
      await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Išsaugotas vardas');
      assert.match(await page.locator('#editor-status').textContent(), /ankstesnis jūsų juodraštis/);
      await page.reload();
      await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Išsaugotas vardas');
      if (width === 320) {
        page.once('dialog', dialog => dialog.dismiss());
        await page.locator('[data-grave-start-new]').click();
        assert.equal(await page.locator('[name=vardas]').inputValue(), 'Išsaugotas vardas');
        page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-grave-start-new]').click();
        await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Ona Marija');
        assert.equal(await page.locator('[name=pavarde]').inputValue(), 'Žukauskaitė');
      }
      if (width === 390) {
        await page.evaluate(() => localStorage.clear());
        const params = new URLSearchParams({ product: 'metal', from: 'grave-search', graveName: 'Vardas <ir> Pavardė', graveBirthDate: '1935', graveDeathDate: '2020-02-30' });
        await page.goto(origin + '/redaktorius.html?' + params);
        await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Vardas <ir> Pavardė');
        assert.equal(await page.locator('[name=pavarde]').inputValue(), '');
        assert.equal(await page.locator('[name=gimimo_data]').inputValue(), '');
        assert.equal(await page.locator('[name=mirties_data]').inputValue(), '');
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(unexpected, []);
      await context.close();
      console.log('PASS: search CTA, prefilled editor, preserved draft, viewport ' + width);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
