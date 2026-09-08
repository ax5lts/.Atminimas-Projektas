const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor() {
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.children = [];
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
    this.hidden = false;
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  hasAttribute(key) { return key in this.attributes; }
  getAttribute(key) { return this.attributes[key] || null; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  emit(name, event = {}) {
    return Promise.all((this.listeners[name] || []).map(callback => callback({ preventDefault() {}, currentTarget: this, ...event })));
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  prepend(child) { this.children.unshift(child); }
  remove() { this.removed = true; }
  select() {}
  focus() { this.focused = true; }
  scrollIntoView() {}
  closest() { return null; }
  reportValidity() { return true; }
}

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

function browser(page = 'admin.html') {
  const timers = new Map();
  let timerId = 0;
  const document = new Element();
  document.body = new Element();
  document.head = new Element();
  document.createElement = () => new Element();
  document.createTextNode = value => ({ textContent: value });
  document.getElementById = () => null;
  document.execCommand = () => true;
  const context = {
    document, URL, URLSearchParams, AbortController, Intl, Blob,
    navigator: {}, localStorage: storage(), sessionStorage: storage(),
    location: new URL('https://example.test/' + page),
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => fn(), addEventListener() {},
    AtminimasAuth: { headers: () => ({}), user: async () => null, accessToken: () => null },
    ATMINIMAS_CONFIG: { SUPABASE_URL: 'https://api.example.test', SUPABASE_ANON_KEY: 'sb_publishable_test' },
  };
  context.window = context;
  vm.createContext(context);
  return {
    context, document, timers,
    run(file) { vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', file), 'utf8'), context, { filename: file }); },
    fire(delay) { for (const [id, timer] of Array.from(timers)) if (timer.delay === delay) { timers.delete(id); timer.fn(); } },
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const jsonResponse = value => ({ ok: true, json: async () => value });

function servicePage() {
  const b = browser('kapu-prieziura.html');
  const elements = new Map();
  b.document.getElementById = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const form = b.document.getElementById('service-request-form');
  const submit = new Element();
  form.querySelector = selector => selector === "button[type='submit']" ? submit : null;
  form.elements = [];
  for (const name of ['destination_latitude', 'destination_longitude', 'location_source', 'cemetery_name', 'municipality', 'grave_location', 'contact_email']) {
    const field = new Element();
    field.name = name;
    form.elements.push(field);
    form.elements[name] = field;
  }
  const requests = [];
  b.context.fetch = (url, options) => {
    const pending = deferred();
    requests.push({ url, options, ...pending });
    return pending.promise;
  };
  return { ...b, form, requests, elements };
}

test('service initialization sends one estimate and unchanged manual text does not repeat it', async () => {
  const b = servicePage();
  b.run('home.js');
  assert.equal(b.requests.length, 1);
  b.fire(180);
  assert.equal(b.requests.length, 1, 'initial debounced estimate is cancelled by the immediate request');
  b.requests[0].resolve(jsonResponse({ estimate_status: 'manual', reasons: ['coordinates_missing'] }));
  await flush();
  b.form.elements.location_source.value = 'manual';
  b.form.elements.municipality.value = 'Panevėžys';
  await b.form.elements.municipality.emit('input');
  b.fire(180);
  assert.equal(b.requests.length, 1, 'text that does not change the estimate payload needs no network request');
});

test('service estimate invalidates old results immediately, including during the debounce interval', async () => {
  const b = servicePage();
  b.run('home.js');
  b.form.elements.location_source.value = 'manual';
  b.form.elements.destination_latitude.value = '55';
  b.form.elements.destination_longitude.value = '24';
  await b.form.elements.municipality.emit('input');
  assert.equal(b.requests[0].options.signal.aborted, true);
  b.requests[0].resolve(jsonResponse({ estimated_total_min_cents: 9000, estimated_total_max_cents: 9000 }));
  await flush();
  assert.equal(b.elements.get('service-estimate-price').textContent, '–');
  b.fire(180);
  assert.equal(b.requests.length, 2);
  b.requests[1].resolve(jsonResponse({ estimated_total_min_cents: 2000, estimated_total_max_cents: 2000 }));
  await flush();
  assert.match(b.elements.get('service-estimate-price').textContent, /20/);
});

test('service page works when session storage is unavailable', () => {
  const b = servicePage();
  b.context.sessionStorage = { getItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.doesNotThrow(() => b.run('home.js'));
  assert.equal(b.requests.length, 1);
});

function graveSearchPage() {
  const b = browser('kapu-ieskojimas.html');
  const form = new Element();
  form.query = 'Jonas';
  const submit = new Element(), results = new Element(), status = new Element(), count = new Element();
  const pager = new Element(), prev = new Element(), next = new Element(), label = new Element();
  const nodes = { '[data-grave-status]': status, '[data-grave-results]': results, '[data-grave-count]': count, '[data-grave-pagination]': pager };
  b.document.querySelector = selector => nodes[selector] || null;
  b.document.querySelectorAll = selector => selector === '[data-grave-search-form]' ? [form] : [];
  form.querySelector = selector => selector === "button[type='submit']" ? submit : null;
  pager.querySelector = selector => ({ '[data-page-prev]': prev, '[data-page-next]': next, '[data-page-label]': label })[selector];
  b.context.FormData = class { constructor(form) { this.form = form; } get(name) { return name === 'q' ? this.form.query : ''; } };
  const requests = [];
  b.context.fetch = (url, options) => {
    const pending = deferred();
    requests.push({ url, options, ...pending });
    return pending.promise;
  };
  b.run('official-grave-search.js');
  return { ...b, form, results, status, submit, requests, prev, next, label };
}

test('duplicate searches share pending work and obsolete responses cannot replace newer results', async () => {
  const b = graveSearchPage();
  await b.form.emit('submit');
  await b.form.emit('submit');
  assert.equal(b.requests.length, 2, 'one request for each search source');
  assert.equal(b.next.disabled, true);
  b.form.query = 'Petras';
  await b.form.emit('submit');
  assert.equal(b.requests.length, 4);
  assert.equal(b.requests[0].options.signal.aborted, true);
  b.requests[2].resolve(jsonResponse([]));
  b.requests[3].resolve(jsonResponse({ items: [{ full_name: 'Petras' }], hasMore: true }));
  await flush();
  assert.match(b.results.innerHTML, /Petras/);
  assert.equal(b.next.disabled, false);
  b.requests[0].resolve(jsonResponse([]));
  b.requests[1].resolve(jsonResponse({ items: [{ full_name: 'Jonas' }] }));
  await flush();
  assert.match(b.results.innerHTML, /Petras/);
  assert.doesNotMatch(b.results.innerHTML, /Jonas/);
  assert.equal(b.submit.disabled, false);
});

test('a stalled manual search times out without discarding completed official results', async () => {
  const b = graveSearchPage();
  await b.form.emit('submit');
  b.requests[0].options.signal.addEventListener('abort', () => b.requests[0].reject(new DOMException('Aborted', 'AbortError')));
  b.requests[1].resolve(jsonResponse({ items: [{ full_name: 'Jonas' }] }));
  await flush();
  assert.equal(b.submit.disabled, true);
  b.fire(22000);
  await flush();
  assert.match(b.results.innerHTML, /Jonas/);
  assert.equal(b.submit.disabled, false);
  assert.equal(b.results.attributes['aria-busy'], 'false');
});

test('clipboard fallback reports failure and removes its temporary field', async () => {
  const b = browser();
  const previous = new Element();
  b.document.activeElement = previous;
  b.context.navigator.clipboard = { writeText: async () => { throw new Error('permission denied'); } };
  b.document.execCommand = () => false;
  b.run('site-ui.js');
  await assert.rejects(b.context.AtminimasUi.copyText('test'), /nukopijuoti nepavyko/);
  assert.equal(b.document.body.children[0].removed, true);
  assert.equal(previous.focused, true);
  b.document.execCommand = () => true;
  await b.context.AtminimasUi.copyText('test');
});

test('saving a memorial opened through an id alias stores a canonical link and tolerates malformed entries', async () => {
  const b = browser('sablonas-viskas.html?id=abc#gallery');
  const elements = new Map();
  b.document.getElementById = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const saveButton = new Element();
  b.document.querySelector = selector => selector === "[data-memorial-action='save']" ? saveButton : null;
  b.context.localStorage.setItem('atminimas.saved-memorials.v1', '[null,4]');
  b.run('memorial-actions.js');
  b.context.AtminimasMemorialActions.init({ id: 'abc', vardas: 'Jonas' }, { demo: true });
  const target = { closest: () => ({ dataset: { memorialAction: 'save' } }) };
  await elements.get('memorial-action-bar').emit('click', { target });
  const saved = JSON.parse(b.context.localStorage.getItem('atminimas.saved-memorials.v1'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].url, 'https://example.test/sablonas-viskas.html?slug=abc');
  const messages = [];
  b.context.AtminimasUi = { toast: message => messages.push(message) };
  b.context.localStorage.setItem = () => { throw new Error('quota'); };
  await elements.get('memorial-action-bar').emit('click', { target });
  assert.match(messages[0], /nepavyko/);
});

test('saved memorials repair legacy aliases while rejecting conflicting identifiers and external URLs', () => {
  const b = browser('vartotojas.html');
  const list = new Element();
  b.document.querySelector = selector => selector === '[data-saved-memorials-list]' ? list : null;
  b.context.localStorage.setItem('atminimas.saved-memorials.v1', JSON.stringify([
    { id: 'abc', name: 'Jonas', url: 'https://example.test/sablonas-viskas.html?id=abc#gallery' },
    { id: 'bad', url: 'https://outside.test/sablonas-viskas.html?slug=bad' },
    { id: 'bad', url: 'https://example.test/sablonas-viskas.html?id=different&slug=bad' },
  ]));
  b.run('saved-memorials.js');
  assert.equal(list.children.length, 1);
  const actions = list.children[0].children[1];
  assert.equal(actions.children[0].href, 'https://example.test/sablonas-viskas.html?slug=abc');
});
