import { readdir, readFile, writeFile, mkdir, rm, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { transform } from 'esbuild';

const root = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const output = path.join(root, 'dist');
// Only replace this project's generated directory; never follow a directory link.
if (path.dirname(output) !== root) throw new Error('Invalid build directory');
const existing = await lstat(output).catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
if (existing && (existing.isSymbolicLink() || await realpath(output) !== output)) {
  throw new Error('Build directory must be a regular directory inside the project');
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const files = new Map();
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && (/\.html$/.test(entry.name) || ['favicon.ico', 'robots.txt', 'sitemap.xml'].includes(entry.name))) {
    files.set(entry.name, await readFile(path.join(root, entry.name)));
  }
}
for (const directory of ['assets', 'css', 'public']) {
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    const allowed = directory === 'public'
      ? /^paysera-verify-[a-f0-9]+\.txt$/.test(entry.name)
      : /\.(?:js|css|svg|png|jpe?g|webp|ico|woff2?|ttf|mp4|webm)$/.test(entry.name) && !entry.name.includes('.example.');
    if (entry.isFile() && allowed) files.set(relative, await readFile(path.join(root, relative)));
  }
}

const compiled = new Map();
const versions = new Map();
const processing = new Set();
const version = data => createHash('sha256').update(data).digest('hex').slice(0, 12);
const assetReference = /(["'])((?:assets|css)\/[a-z0-9_.-]+\.(?:js|css))(?:\?v=[a-z0-9-]+)?\1/gi;

async function compile(relative) {
  if (compiled.has(relative)) return compiled.get(relative);
  if (processing.has(relative)) throw new Error(`Circular asset reference: ${relative}`);
  if (!files.has(relative)) throw new Error(`Missing public asset: ${relative}`);
  processing.add(relative);
  const input = files.get(relative);
  let data = input;
  if (/\.(js|css)$/.test(relative)) {
    const text = input.toString('utf8');
    for (const match of text.matchAll(assetReference)) await compile(match[2]);
    const rewritten = text.replace(assetReference, (_match, quote, asset) => `${quote}${asset}?v=${versions.get(asset)}${quote}`);
    const result = await transform(rewritten, {
      loader: relative.endsWith('.css') ? 'css' : 'js',
      target: ['es2020', 'chrome90', 'firefox90', 'safari15'],
      minify: true,
      charset: 'utf8',
      legalComments: 'inline',
      sourcefile: relative
    });
    if (result.warnings.length) throw new Error(result.warnings.map(warning => `${relative}: ${warning.text}`).join('\n'));
    data = Buffer.from(result.code);
  }
  compiled.set(relative, data);
  versions.set(relative, version(data));
  processing.delete(relative);
  return data;
}

for (const relative of files.keys()) if (!relative.endsWith('.html')) await compile(relative);
for (const [relative, input] of files) {
  let data = compiled.get(relative);
  if (relative.endsWith('.html')) {
    const html = input.toString('utf8').replace(assetReference, (_match, quote, asset) => {
      if (!versions.has(asset)) throw new Error(`${relative}: missing asset ${asset}`);
      return `${quote}${asset}?v=${versions.get(asset)}${quote}`;
    });
    data = Buffer.from(html);
  }
  const destination = path.join(output, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, data);
}

const code = [...compiled].filter(([relative]) => /\.(js|css)$/.test(relative));
const bytes = code.reduce((sum, [relative]) => sum + files.get(relative).length, 0);
const optimized = code.reduce((sum, [, data]) => sum + data.length, 0);
const gzipBefore = code.reduce((sum, [relative]) => sum + gzipSync(files.get(relative)).length, 0);
const gzipAfter = code.reduce((sum, [, data]) => sum + gzipSync(data).length, 0);
console.log(`Built ${files.size} public files in dist/`);
console.log(`JS/CSS: ${bytes} → ${optimized} bytes (${Math.round((1 - optimized / bytes) * 100)}% smaller)`);
console.log(`JS/CSS with gzip: ${gzipBefore} → ${gzipAfter} bytes (${Math.round((1 - gzipAfter / gzipBefore) * 100)}% smaller)`);
