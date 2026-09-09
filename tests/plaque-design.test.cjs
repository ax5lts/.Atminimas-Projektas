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
  assert.equal(invalid.pattern, 'plain');
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

test('store starts with plain QR at 50 EUR, followed by three 60 EUR ornaments without the yellow notice', () => {
  const html = fs.readFileSync(path.join(__dirname, '../parduotuve.html'), 'utf8');
  const choices = [...html.matchAll(/name="plaque_pattern" value="([^"]+)"( checked)?/g)];
  assert.deepEqual(choices.map(match => match[1]), ['plain', 'tree', 'heart', 'wings']);
  assert.equal(choices[0][2], ' checked');
  for (let i=1; i<choices.length; i++) assert.equal(choices[i][2], undefined);
  assert.match(html, /Variantas 1 · 50 €/);
  assert.equal((html.match(/Variantas [234] · 60 €/g) || []).length, 3);
  assert.doesNotMatch(html, /<aside class="legal-notice shop-legal-notice/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'shop element IDs must be unique');
});
