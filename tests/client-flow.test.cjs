const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = name => fs.readFileSync(path.join(__dirname, '..', 'assets', name), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function element() {
  return {
    disabled: false, hidden: false, value: '', textContent: '', dataset: {}, listeners: {},
    classList: { toggle() {} },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute() {}, removeAttribute() {}, reset() {}, focus() {}, scrollIntoView() {},
    querySelector() { return null; }, querySelectorAll() { return []; }
  };
}
function page() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const storage = new Map();
  const context = {
    URL, URLSearchParams, console,
    document: { getElementById: get, querySelector: get, querySelectorAll: () => [] },
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    location: { href: 'https://example.test/parduotuve.html', search: '', pathname: '/parduotuve.html', assign(url) { this.assigned = url; } },
    requestAnimationFrame: fn => fn(),
    FormData: class { constructor(form) { this.values = form.values || {}; } entries() { return Object.entries(this.values); } get(key) { return this.values[key]; } }
  };
  context.window = context;
  return { context, get, storage };
}

test('shop replaces removed product and keeps the latest design when catalog finishes', async () => {
  const p = page();
  const pending = deferred();
  p.storage.set('atminimas.selected-product.v1', 'asa');
  vm.runInNewContext(source('product-catalog.js'), p.context);
  p.context.AtminimasProductCatalog.load = () => pending.promise;
  vm.runInNewContext(source('plaque-design.js'), p.context);
  vm.runInNewContext(source('shop.js'), p.context);
  assert.match(p.get('product-create-link').href, /product=metal/);
  p.get('product-selector').listeners.change({ target: { name: 'plaque_color', value: 'black' } });
  pending.resolve({ remote: true, metal: { available: true, price_cents: 6000, plain_price_cents: 5000, currency: 'EUR' } });
  await tick();
  assert.match(p.get('product-create-link').href, /product=metal/);
  assert.match(p.get('product-price').textContent, /50,00/);
  assert.match(p.get('product-total').textContent, /53,00/);
  assert.match(p.get('product-create-link').href, /color=black/);
  assert.equal(p.get('product-image').dataset.color, 'black');
  for (const pattern of ['tree', 'heart', 'wings', 'plain']) {
    p.get('product-selector').listeners.change({ target: { name: 'plaque_pattern', value: pattern } });
    assert.match(p.get('product-price').textContent, pattern === 'plain' ? /50,00/ : /60,00/);
    assert.match(p.get('product-total').textContent, pattern === 'plain' ? /53,00/ : /63,00/);
    assert.match(p.get('product-create-link').textContent, pattern === 'plain' ? /50,00/ : /60,00/);
    assert.equal(p.get('product-image').dataset.pattern, pattern);
    assert.match(p.get('product-create-link').href, new RegExp('pattern=' + pattern));
  }
});

test('shop handles unavailable storage and a rejected catalog without an unhandled error', async () => {
  const p = page();
  p.context.sessionStorage.getItem = p.context.sessionStorage.setItem = () => { throw new Error('blocked'); };
  vm.runInNewContext(source('product-catalog.js'), p.context);
  p.context.AtminimasProductCatalog.load = async () => { throw new Error('offline'); };
  vm.runInNewContext(source('plaque-design.js'), p.context);
  vm.runInNewContext(source('shop.js'), p.context);
  await tick();
  assert.equal(p.get('shop-catalog-retry').disabled, false);
  assert.equal(p.get('shop-catalog-retry').hidden, false);
});

test('preorder sends once during submission and remains locked while navigating', async () => {
  const p = page();
  const pending = deferred();
  let calls = 0;
  p.context.ATMINIMAS_CONFIG = { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'test' };
  p.context.fetch = () => { calls++; return pending.promise; };
  const form = p.get('preorder-form');
  const button = element();
  form.querySelector = selector => selector.startsWith('button') ? button : null;
  form.values = { customer_name: 'Test', customer_email: 'test@example.test', consent: 'yes' };
  vm.runInNewContext(source('preorder.js'), p.context);
  const first = form.listeners.submit({ preventDefault() {} });
  await form.listeners.submit({ preventDefault() {} });
  assert.equal(calls, 1);
  pending.resolve({ ok: true, json: async () => ({ reference_code: 'TEST' }) });
  await first;
  await form.listeners.submit({ preventDefault() {} });
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
});

test('preorder failure releases submission lock for a deliberate retry', async () => {
  const p = page();
  let calls = 0;
  p.context.ATMINIMAS_CONFIG = { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'test' };
  p.context.fetch = async () => { calls++; throw new Error('offline'); };
  const form = p.get('preorder-form');
  const button = element();
  form.querySelector = selector => selector.startsWith('button') ? button : null;
  vm.runInNewContext(source('preorder.js'), p.context);
  await form.listeners.submit({ preventDefault() {} });
  await form.listeners.submit({ preventDefault() {} });
  assert.equal(calls, 2);
  assert.equal(button.disabled, false);
});

function editor() {
  const p = page();
  const c = p.context;
  c.location.href = 'https://example.test/redaktorius.html?product=digital';
  c.history = { state: {}, replaceState(_state, _title, url) { c.location.href = url; } };
  c.console = { error() {} };
  c.setTimeout = () => {};
  Object.assign(c, {
    form: element(), statusEl: element(), submitButton: element(), videoInput: { files: [] },
    captionsInput: { files: [] }, savedVideoFile: null, savedCaptionsFile: null,
    photoSyncPromise: Promise.resolve(), photoPreparationFailed: false,
    processedPhotos: [{ name: 'photo.jpg' }], uploadedPhotos: [], uploadedVideo: null, uploadedCaptions: null,
    editingMedia: [], editId: '', prototypeRequested: false, isAdminPrototype: false, prototypePublishPending: false,
    productType: 'digital', selectedPlaqueDesign: { color: 'gold', pattern: 'tree' }, physicalOrderPending: false, MAX_PHOTOS: 8, MAX_VIDEO_BYTES: 50 * 1024 * 1024,
    resultBox: element(), previewCode: element(), openLink: element(), preorderLink: element(),
    clientLink: element(), qrLink: element(), orderCode: element(), saveProgressEl: element(),
    isSignedIn: () => true, validateDatePickers: () => true, formData: () => ({ vardas: 'Test' }),
    waitForAuxiliaryMediaPersistence: async () => {}, discardSavedDraft: async () => {},
    collectLayout: () => ({}), collectStoryBlocks: () => [], syncLegacyStoryText: () => '',
    fitStageToContent() {}, showSaveProgress() {}, hideSaveProgress() {},
    limitStoryBlocksToWords() {}, showSaveSuccess() {}, setDraftState() {}
  });
  const creates = [], updates = [];
  c.AtminimasApi = {
    createAtminimas: async (data, options) => {
      creates.push(options);
      return { identifier: 'created-page', media: [{ type: 'image', path: 'saved-photo.jpg' }] };
    },
    updateAtminimas: async (id, data, options) => {
      updates.push({ id, options });
      return { identifier: id, media: options.existingMedia };
    }
  };
  // Run the production submit handler with its dependencies stubbed, avoiding unrelated canvas setup.
  const text = source('redaktorius.js');
  const start = text.indexOf('  form.addEventListener("submit", async function (event)');
  const end = text.indexOf('\n  async function initEditor()', start);
  vm.runInNewContext(text.slice(start, end), c);
  return { ...p, creates, updates, submit: () => c.form.listeners.submit({ preventDefault() {} }) };
}

test('editor saves again to the same profile without uploading unchanged media', async () => {
  const p = editor();
  await p.submit();
  await p.submit();
  assert.equal(p.creates.length, 1);
  assert.equal(p.updates.length, 1);
  assert.equal(p.updates[0].id, 'created-page');
  assert.equal(p.updates[0].options.files.photos.length, 0);
  assert.equal(p.updates[0].options.existingMedia[0].path, 'saved-photo.jpg');
  assert.match(p.context.location.href, /edit=created-page/);
  assert.equal(p.context.location.assigned, undefined);
  p.context.processedPhotos.push({ name: 'new.jpg' });
  await p.submit();
  assert.equal(p.updates[1].options.files.photos.length, 2);
});

test('editor ignores overlapping submits and recovers from photo preparation failure', async () => {
  const p = editor();
  const pending = deferred();
  p.context.photoSyncPromise = pending.promise;
  const first = p.submit();
  await p.submit();
  pending.reject(new Error('photo preparation failed'));
  await first;
  assert.equal(p.creates.length, 0);
  assert.equal(p.context.submitButton.disabled, false);
  assert.match(p.context.statusEl.textContent, /photo preparation failed/);
  p.context.photoSyncPromise = Promise.resolve();
  await p.submit();
  assert.equal(p.creates.length, 1);
});

test('prototype publish retry reuses created profile', async () => {
  const p = editor();
  p.context.isAdminPrototype = true;
  let publications = 0;
  p.context.AtminimasApi.publishAdminPrototype = async () => {
    publications++;
    if (publications === 1) throw new Error('publish unavailable');
    return { page_url: 'https://example.test/page', qr_url: 'https://example.test/qr' };
  };
  await p.submit();
  await p.submit();
  assert.equal(p.creates.length, 1);
  assert.equal(p.updates.length, 1);
  assert.equal(publications, 2);
  assert.equal(p.context.prototypePublishPending, false);
  assert.equal(p.context.location.assigned, undefined);
});

test('checkout script safely ignores pages without its form', () => {
  vm.runInNewContext(source('checkout.js'), { document: { getElementById: () => null } });
});

test('paid product creation retries on the same profile and immediately redirects to checkout', async () => {
  const p = editor();
  p.context.productType = 'metal';
  let orders = 0;
  p.context.AtminimasApi.createUzsakymas = async (id, options) => {
    assert.equal(id, 'created-page');
    assert.equal(options.product_type, 'metal');
    if (++orders === 1) throw new Error('Order unavailable');
    return { id: 'saved-order' };
  };
  await p.submit();
  assert.equal(p.context.physicalOrderPending, true);
  assert.equal(p.context.location.assigned, undefined);
  await p.submit();
  assert.equal(p.creates.length, 1);
  assert.equal(orders, 2);
  assert.equal(p.context.physicalOrderPending, false);
  assert.equal(p.context.preorderLink.href, 'apmokejimas.html?order=saved-order');
  assert.equal(p.context.location.assigned, 'apmokejimas.html?order=saved-order');
  await p.submit();
  assert.equal(orders, 2);
});

test('an existing digital page can receive a physical order without creating another profile', async () => {
  const p = editor();
  p.context.productType = 'metal';
  p.context.selectedPlaqueDesign = { color: 'black', pattern: 'wings' };
  p.context.editId = 'existing-page';
  p.context.physicalOrderPending = true;
  p.context.AtminimasApi.createUzsakymas = async (id, options) => {
    assert.equal(id, 'existing-page');
    assert.equal(options.product_type, 'metal');
    assert.equal(options.product_color, 'black');
    assert.equal(options.product_pattern, 'wings');
    return { id: 'asa-order' };
  };
  await p.submit();
  assert.equal(p.creates.length, 0);
  assert.equal(p.context.preorderLink.href, 'apmokejimas.html?order=asa-order');
  assert.equal(p.context.location.assigned, 'apmokejimas.html?order=asa-order');
});
