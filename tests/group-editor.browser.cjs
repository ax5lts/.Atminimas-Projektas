// Run against python serve.py. PLAYWRIGHT_PATH may point to the bundled runtime.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const width = Number(process.env.TEST_WIDTH || 390);
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    await context.addInitScript(() => {
      const open = indexedDB.open.bind(indexedDB);
      indexedDB.open = (...args) => {
        if (sessionStorage.getItem('test-idb-failure')) throw new Error('Simulated IndexedDB failure');
        return open(...args);
      };
    });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
    await page.route('**/assets/auth.js*', route => route.fulfill({ contentType: 'application/javascript', body:
      'window.AtminimasAuth={accessToken:()=>"test",userId:()=>"test",isAdmin:async()=>false,ensureFreshSession:async()=>true};' }));
    await page.route('**/assets/atminimas-duomenys.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
      var db=JSON.parse(localStorage.getItem('test-profiles')||'{}');
      function persist(){localStorage.setItem('test-profiles',JSON.stringify(db));}
      async function save(id,data,options){
        var media=(options.files.photos||[]).filter(Boolean).map((f,i)=>({type:'image',order:i+1,path:id+'/'+f.name,url:location.origin+'/assets/qr-plienas-480.webp'}));
        if(Array.isArray(options.photoItems))media=options.photoItems.map((item,i)=>item.file?({type:'image',order:i+1,path:id+'/'+crypto.randomUUID()+'.webp',url:location.origin+'/assets/qr-plienas-480.webp'}):({...item.media,order:i+1,url:location.origin+'/assets/qr-plienas-480.webp'}));
        else if(!media.length)media=options.existingMedia||[];
        db[id]={...data,id,media_json:media,layout_json:options.layout,story_blocks_json:options.storyBlocks,members:db[id]?.members||[]};persist();return{identifier:id,media};
      }
      window.AtminimasApi={
        createAtminimas:async(data,options)=>save('person-'+(Object.keys(db).length+1),data,options),
        updateAtminimas:save,
        setGroupMembers:async(id,members)=>{if(localStorage.getItem('test-fail-link')){localStorage.removeItem('test-fail-link');throw new Error('Simulated link failure');}db[id].members=members;persist();},
        loadAtminimasBySlug:async(id)=>({atminimas:db[id],members:(db[id].members||[]).map(id=>db[id]),can_manage:true}),
        getPageSlug:()=>new URLSearchParams(location.search).get('slug'),qrImageUrl:()=>''
      };` }));
    await page.goto('http://127.0.0.1:5000/redaktorius.html?product=digital');
    await page.locator('#editor-group-type').selectOption('group');
    await page.locator('[name=vardas]').fill('Jonas');
    await page.locator('[name=pavarde]').fill('Pirmasis');
    await page.locator('[data-story-text]').first().fill('Mylėjo šeimą.');
    await page.locator('#editor-photos').setInputFiles('assets/qr-plienas-480.webp');
    await page.waitForFunction(() => document.querySelector('#editor-draft-state').dataset.state === 'saved');
    // Gallery edits preserve existing content and support every ready layout.
    await page.locator('#editor-photos').setInputFiles('assets/qr-atminimo-lentele-480.webp');
    await page.waitForFunction(() => document.querySelectorAll('[data-library-action="remove"]').length === 2 && !document.querySelector('#editor-photos').disabled);
    await page.locator('[data-library-action="portrait"]').nth(1).click();
    await page.waitForFunction(() => !document.querySelector('#editor-photos').disabled);
    assert.match(await page.locator('[data-photo-order-index="0"]').textContent(), /qr-atminimo/);
    await page.locator('[data-library-action="replace"]').first().evaluate(button => button.click());
    await page.locator('#editor-replace-photo').setInputFiles('assets/qr-plienas-480.webp');
    await page.waitForFunction(() => !document.querySelector('#editor-photos').disabled);
    assert.equal(await page.locator('[data-library-action="remove"]').count(), 2);
    for (const template of ['album', 'family', 'portrait']) {
      await page.locator('[data-editor-template="' + template + '"]').evaluate(button => button.click());
      assert.match(await page.locator('#editor-preview-story').textContent(), /Mylėjo šeimą/);
      assert.equal(await page.locator('[data-library-action="remove"]').count(), 2);
    }
    await page.locator('[data-library-action="remove"]').nth(1).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-library-action="remove"]').length === 1 && !document.querySelector('#editor-photos').disabled);
    assert.equal(await page.locator('#editor-save-location').getAttribute('data-state'), 'local');
    await page.locator('[data-editor-step-button="colors"]').click();
    await page.locator('.editor-templates').screenshot({ path: 'tmp/editor-templates-' + width + '.png' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.locator('[data-editor-step-button="text"]').click();
    await page.evaluate(() => {
      window.testPersonButton=document.querySelector('#editor-people button');
      window.testPreviewPhoto=document.querySelector('#editor-preview-story img');
    });
    await page.locator('[data-story-text]').first().fill('Mylėjo šeimą ir savo gimtinę.');
    await page.waitForFunction(() => document.querySelector('#editor-preview-story').textContent.includes('savo gimtinę'));
    assert.equal(await page.evaluate(() => window.testPreviewPhoto===document.querySelector('#editor-preview-story img')), true, 'typing must not recreate photos');
    await page.locator('[name=pavarde]').fill('Pirmasis pakeistas');
    await page.waitForFunction(() => document.querySelector('#editor-draft-state').dataset.state === 'saved');
    assert.equal(await page.evaluate(() => window.testPersonButton===document.querySelector('#editor-people button')), true, 'autosave preserves card DOM');
    await page.locator('[name=pavarde]').fill('Pirmasis');
    await page.locator('#editor-person-add').evaluate(button => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('[name=vardas]').value === '');
    assert.equal(await page.locator('#editor-people button').count(), 2, 'rapid clicks add one person');
    await page.locator('[name=vardas]').fill('Ona');
    await page.locator('[name=pavarde]').fill('Antroji');
    await page.locator('#editor-photos').setInputFiles('assets/qr-atminimo-lentele-480.webp');
    await page.waitForFunction(() => document.querySelector('#editor-draft-state').dataset.state === 'saved');
    await page.locator('[name=vardas]').fill('Ona laikina');
    await page.waitForFunction(() => document.querySelector('#editor-draft-state').dataset.state === 'saved');
    await page.evaluate(() => sessionStorage.setItem('test-idb-failure', '1'));
    await page.locator('#editor-people button').first().click();
    await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Jonas');
    assert.equal(await page.locator('[name=pavarde]').inputValue(), 'Pirmasis');
    await page.locator('#editor-people button').nth(1).click();
    await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Ona laikina');
    await page.locator('#editor-undo').click();
    await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Ona');
    await page.evaluate(() => sessionStorage.removeItem('test-idb-failure'));
    await page.waitForFunction(() => document.querySelectorAll('#editor-people button')[1].getAttribute('aria-pressed') === 'true');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Ona');
    assert.equal(await page.locator('#editor-people button').count(), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: 'tmp/group-editor-mobile.png', fullPage: true });
    await page.locator('.editor-group').screenshot({ path: 'tmp/group-editor-selector-' + width + '.png' });
    // Submit through the real handler after checking the required consents.
    await page.evaluate(() => {
      localStorage.setItem('test-fail-link','1');
      document.querySelectorAll('#editor-form input[type=checkbox][required]').forEach(el => el.checked=true);
      document.querySelector('#editor-form').requestSubmit();
    });
    await page.waitForFunction(() => document.querySelector('#editor-status').dataset.state === 'error');
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('test-profiles'))).length), 2);
    await page.evaluate(() => document.querySelector('#editor-form').requestSubmit());
    await page.waitForFunction(() => document.querySelector('#editor-success-dialog').open);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('test-profiles')));
    assert.equal(Object.keys(saved).length, 2);
    assert.equal(saved['person-1'].vardas, 'Jonas');
    assert.equal(saved['person-2'].vardas, 'Ona');
    assert.equal(saved['person-1'].media_json.length, 1, 'inactive person photos survive reload and save');
    assert.equal(saved['person-2'].media_json.length, 1);
    assert.deepEqual(saved['person-1'].members, ['person-2']);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#editor-people').children.length === 2);
    await page.locator('#editor-people button').nth(1).click();
    await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Ona');
    await page.locator('[name=vardas]').fill('Onutė');
    await page.evaluate(() => { document.querySelectorAll('#editor-form input[type=checkbox][required]').forEach(el => el.checked=true); document.querySelector('#editor-form').requestSubmit(); });
    await page.waitForFunction(() => document.querySelector('#editor-success-dialog').open);
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('test-profiles'))).length), 2);
    assert.equal(await page.locator('#editor-save-location').getAttribute('data-state'), 'account');
    await page.locator('[data-editor-success-close]').click();
    const savedPhoto = await page.evaluate(() => JSON.parse(localStorage.getItem('test-profiles'))['person-2'].media_json[0].path);
    await page.locator('#editor-photos').setInputFiles('assets/qr-plienas-480.webp');
    await page.waitForFunction(() => document.querySelectorAll('[data-library-action="remove"]').length === 2 && !document.querySelector('#editor-photos').disabled);
    await page.locator('[data-library-action="portrait"]').nth(1).click();
    await page.waitForFunction(() => !document.querySelector('#editor-photos').disabled);
    await page.evaluate(() => document.querySelector('#editor-form').requestSubmit());
    await page.waitForFunction(() => document.querySelector('#editor-success-dialog').open);
    const mixed = await page.evaluate(() => JSON.parse(localStorage.getItem('test-profiles'))['person-2']);
    assert.equal(mixed.media_json.length, 2);
    assert.equal(mixed.media_json[1].path, savedPhoto, 'adding and choosing portrait keeps saved photo');
    assert.equal(mixed.story_blocks_json[0].photoOrder, 1);
    await page.locator('[data-editor-success-close]').click();
    await page.locator('[data-library-action="remove"]').nth(1).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-library-action="remove"]').length === 1 && !document.querySelector('#editor-photos').disabled);
    await page.locator('[data-library-action="remove"]').first().click();
    await page.waitForFunction(() => !document.querySelector('#editor-photos').disabled);
    await page.evaluate(() => document.querySelector('#editor-form').requestSubmit());
    await page.waitForFunction(() => document.querySelector('#editor-success-dialog').open);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('test-profiles'))['person-2'].media_json.length), 0, 'last photo deletion persists');
    await page.goto('http://127.0.0.1:5000/sablonas-viskas.html?slug=person-1');
    await page.waitForFunction(() => document.querySelectorAll('#memorial-group-selector button').length===2);
    await page.locator('#memorial-group-selector button').nth(1).click();
    assert.match(await page.locator('#builder-view h1').textContent(), /Onutė/);
    assert.match(page.url(), /slug=person-1.*person=person-2/);
    await page.screenshot({ path: 'tmp/group-public-mobile.png', fullPage: true });
    await page.goto('http://127.0.0.1:5000/redaktorius.html?edit=person-1&product=digital');
    await page.waitForFunction(() => document.querySelectorAll('#editor-people button').length===2);
    await page.locator('#editor-people button').nth(1).click();
    await page.waitForFunction(() => !document.querySelector('#editor-person-remove').disabled);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#editor-person-remove').click();
    await page.waitForFunction(() => document.querySelectorAll('#editor-people button').length===1);
    await page.locator('#editor-group-type').selectOption('single');
    await page.evaluate(() => { document.querySelectorAll('#editor-form input[type=checkbox][required]').forEach(el => el.checked=true); document.querySelector('#editor-form').requestSubmit(); });
    await page.waitForFunction(() => document.querySelector('#editor-success-dialog').open);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('test-profiles'))['person-1'].members), []);
    await page.locator('[data-editor-success-close]').click();
    await page.locator('[name=vardas]').fill('Paskutinė raidė');
    // Reload immediately, before the autosave debounce expires.
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Paskutinė raidė');
    const draftKey = 'atminimas.editor.edit.person-1.v1';
    const recoverable = await page.evaluate(key => localStorage.getItem(key), draftKey);
    await page.evaluate(() => sessionStorage.setItem('test-idb-failure', '1'));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#editor-form').inert);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), draftKey), recoverable, 'failed restoration keeps the original draft');
    await page.evaluate(() => sessionStorage.removeItem('test-idb-failure'));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[name=vardas]').value === 'Paskutinė raidė');
    assert.equal(await page.locator('.editor-step-actions').first().evaluate(el => getComputedStyle(el).position), 'static');
    assert.deepEqual(errors, []);
    console.log('PASS: stable typing/photos/cards, independent undo, in-memory switching, immediate reload, failed draft recovery, group save/retry/edit/removal, public QR selection, responsive layout');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
