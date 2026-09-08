const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const hash = data => createHash('sha256').update(data).digest('hex').slice(0, 12);

test('deployment contains every page and no private project directories', () => {
  const pages = fs.readdirSync(root).filter(file => file.endsWith('.html')).sort();
  assert.deepEqual(fs.readdirSync(dist).filter(file => file.endsWith('.html')).sort(), pages);
  const allowed = new Set([...pages, 'assets', 'css', 'public', 'robots.txt', 'sitemap.xml', 'favicon.ico']);
  for (const file of fs.readdirSync(dist)) assert.ok(allowed.has(file), `Unexpected public file: ${file}`);
  assert.ok(!fs.existsSync(path.join(dist, 'assets/supabase-config.example.js')));
  assert.ok(fs.readFileSync(path.join(dist, 'public/paysera-verify-0c92a4c0084e58746594a9df8face37c.txt')).equals(
    fs.readFileSync(path.join(root, 'public/paysera-verify-0c92a4c0084e58746594a9df8face37c.txt'))));
});

test('HTML and dynamically loaded scripts reference the exact compiled asset versions', () => {
  const pages = fs.readdirSync(dist).filter(file => file.endsWith('.html'));
  let checked = 0;
  for (const file of pages.concat(['assets/site-ui.js'])) {
    const content = fs.readFileSync(path.join(dist, file), 'utf8');
    for (const [, asset, version] of content.matchAll(/["']((?:assets|css)\/[a-z0-9_.-]+\.(?:js|css))(?:\?v=([^"']+))?["']/gi)) {
      assert.equal(version, hash(fs.readFileSync(path.join(dist, asset))), `${file} → ${asset}`);
      checked++;
    }
  }
  assert.ok(checked > pages.length * 2);
});

test('production code is smaller and original sources remain readable', () => {
  for (const file of ['css/styles.css', 'assets/redaktorius.js', 'assets/home.js']) {
    const original = fs.readFileSync(path.join(root, file), 'utf8');
    const built = fs.readFileSync(path.join(dist, file), 'utf8');
    assert.ok(Buffer.byteLength(built) < Buffer.byteLength(original) * 0.85, file);
    assert.ok(original.split('\n').length > 100, file);
  }
});
