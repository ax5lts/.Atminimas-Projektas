const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/login.js'), 'utf8');
const settle = () => new Promise(setImmediate);

function setup(user) {
  const button = { disabled: false };
  const status = { textContent: '' };
  const handlers = {};
  const form = { querySelector: () => button, addEventListener: (name, fn) => { handlers[name] = fn; } };
  const calls = [];
  let signedIn = false;
  const location = { search: '?next=redaktorius.html%3Fproduct%3Dmetal', replace: url => calls.push(['replace', url]) };
  const context = {
    location, URLSearchParams,
    sessionStorage: { getItem: () => null, removeItem() {} },
    document: { getElementById: id => id === 'login-form' ? form : status, querySelectorAll: () => [] },
    FormData: class { entries() { return [['email', ' qa@example.test '], ['password', 'test-password']]; } },
    AtminimasAuth: {
      accessToken: () => 'saved-token',
      user: () => signedIn ? Promise.resolve({ id: 'user' }) : user(),
      needsMfa: () => false, isAdmin: async () => false,
      signOut: () => calls.push(['signOut']),
      signIn: async (...args) => { calls.push(['signIn', ...args]); signedIn = true; }
    }
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return { button, status, handlers, calls, location };
}

for (const failure of ['network', 'expired']) {
  test(`login remains usable after ${failure} saved-session verification failure`, async () => {
    const ui = setup(() => failure === 'network' ? Promise.reject(new Error('Network failure')) : Promise.resolve(null));
    await settle();
    assert.equal(ui.calls.some(call => call[0] === 'replace'), false, 'invalid sessions must not redirect');
    assert.match(ui.status.textContent, /Prisijunkite dar kartą/);
    assert.equal(ui.button.disabled, false);
    assert.equal(typeof ui.handlers.submit, 'function');
    await ui.handlers.submit({ preventDefault() {} });
    assert.deepEqual(ui.calls.find(call => call[0] === 'signIn'), ['signIn', 'qa@example.test', 'test-password']);
    assert.equal(ui.location.href, 'redaktorius.html?product=metal');
  });
}

test('saved-session verification prevents overlapping login and preserves the destination', async () => {
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const ui = setup(() => pending);
  assert.equal(ui.button.disabled, true);
  await ui.handlers.submit({ preventDefault() {} });
  assert.equal(ui.calls.length, 0);
  resolve({ id: 'user' });
  await settle();
  assert.deepEqual(ui.calls, [['replace', 'redaktorius.html?product=metal']]);
});
