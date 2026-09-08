const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/plaque-design.js'), 'utf8');
function setup(search = '', saved = '{}') {
  const storage = new Map([['atminimas.plaque-design.v1', saved]]);
  const context = { URLSearchParams, location: { search }, sessionStorage: {
    getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)
  } };
  context.window = context;
  vm.runInNewContext(source, context);
  return { api: context.AtminimasPlaqueDesign, storage };
}
test('all twelve designs have unique labels and round-trip through order URLs', () => {
  const { api } = setup();
  const labels = new Set();
  for (const color of Object.keys(api.colors)) for (const pattern of Object.keys(api.patterns)) {
    const design = { color, pattern };
    labels.add(api.label(design));
    const next = setup('?' + api.query(design)).api.read();
    assert.equal(next.color, color);
    assert.equal(next.pattern, pattern);
  }
  assert.equal(labels.size, 12);
});
test('explicit link wins over saved choice, invalid and malformed values use defaults', () => {
  const { api } = setup('?color=silver&pattern=plain', '{"color":"black","pattern":"wings"}');
  assert.equal(api.read().color, 'silver');
  assert.equal(api.read().pattern, 'plain');
  const invalid = setup('?color=__proto__&pattern=constructor', 'broken').api.read();
  assert.equal(invalid.color, 'gold');
  assert.equal(invalid.pattern, 'tree');
  const persisted = setup('', '{"color":"black","pattern":"heart"}').api.read();
  assert.equal(persisted.pattern, 'heart');
});

test('old fourth-choice links select plain QR while historical order labels remain truthful', () => {
  const { api } = setup('?color=gold&pattern=star');
  assert.equal(api.read().pattern, 'plain');
  assert.match(api.label(api.read()), /Tik QR kodas/);
  assert.match(api.label({color:'gold',pattern:'star'}), /Žvaigždė ir šakelė/);
  assert.equal(Object.keys(api.patterns).length, 4);
});
