// Repository orientation only: reads source files, never env values or services.
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const functionRoot = path.join(root, 'supabase', 'functions');
const destination = path.join(root, 'docs', 'GENERATED_MAP.md');
const arguments_ = process.argv.slice(2);
if (arguments_.length > 1 || (arguments_.length && arguments_[0] !== '--check')) {
  throw new Error('Usage: node scripts/project-map.mjs [--check]');
}
const check = arguments_[0] === '--check';
const read = relative => readFile(path.join(root, relative), 'utf8');
const normalize = content => content.replace(/\r\n/g, '\n');
const link = (label, relative) => `[${label}](../${relative.split('/').map(encodeURIComponent).join('/')})`;
const functionsLink = relative => link(relative, `supabase/functions/${relative}`);
const lines = [
  '# Generuojamas kodo žemėlapis',
  '',
  'Šis failas generuojamas iš vietinių HTML, JavaScript, Edge importų ir `supabase/config.toml`. Atnaujinkite su `pnpm docs:map`; `pnpm docs:check` aptinka pasenusį žemėlapį. Jo neredaguokite ranka.',
  '',
  'Tai šaltinių katalogas, ne produkcijos versijų ar visų galimų vykdymo kelių įrodymas. Dinamiškai įkeliamus skriptus ir veiksmų sutartis aiškina [FRONTEND.md](FRONTEND.md) bei [BACKEND.md](BACKEND.md).',
  '',
  '## HTML ir tiesioginių skriptų tvarka',
  '',
  'Eilutėje išlaikyta tikra HTML įkėlimo tvarka. Užklausų versijų žymos praleistos; išoriniai skriptai neįtraukti.',
  '',
  '| Puslapis | Vietiniai skriptai iš eilės |',
  '| --- | --- |',
];
const entries = await readdir(root, { withFileTypes: true });
const pages = entries.filter(entry => entry.isFile() && entry.name.endsWith('.html')).map(entry => entry.name).sort();
for (const page of pages) {
  const html = await read(page);
  const scripts = [];
  for (const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)) {
    const source = match[2];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(source)) continue;
    const relative = decodeURIComponent(new URL(source, 'https://source.invalid/').pathname).replace(/^\//, '');
    await read(relative); // Missing linked source must fail the check.
    scripts.push(link(relative, relative));
  }
  lines.push(`| ${link(page, page)} | ${scripts.join('<br>') || '—'} |`);
}

lines.push('', '## Bendri naršyklės objektai', '',
  'Statiniu būdu aptiktos vardinių `window`, `global`, `globalThis` ir `root` objektų priskyrimo vietos. Tai nėra visų įvykių ar funkcijų iškvietimų grafas.', '',
  '| Failas | Eksportuojami vardai |', '| --- | --- |');
for (const name of (await readdir(path.join(root, 'assets'))).filter(name => name.endsWith('.js') && !name.includes('.example.')).sort()) {
  const content = await read(`assets/${name}`);
  const exports = [...new Set([...content.matchAll(/\b(?:window|global|globalThis|root)\.([A-Z][\w]*)\s*=/g)].map(match => match[1]))].sort();
  if (exports.length) lines.push(`| ${link(name, `assets/${name}`)} | ${exports.map(name => '`' + name + '`').join(', ')} |`);
}

const config = new Map();
let current = '';
for (const line of (await read('supabase/config.toml')).split(/\r?\n/)) {
  const section = line.match(/^\[([^\]]+)\]\s*$/);
  if (section) current = section[1].startsWith('functions.') ? section[1].slice(10) : '';
  const flag = line.match(/^verify_jwt\s*=\s*(true|false)\s*(?:#.*)?$/);
  if (current && flag) config.set(current, flag[1]);
}
const sources = new Map();
async function dependencies(relative, visited = new Set()) {
  if (visited.has(relative)) return visited;
  const absolute = path.resolve(functionRoot, relative);
  const inside = path.relative(functionRoot, absolute);
  if (inside.startsWith('..') || path.isAbsolute(inside)) throw new Error(`Import outside functions/: ${relative}`);
  visited.add(relative);
  let content = sources.get(relative);
  if (content === undefined) {
    content = await readFile(absolute, 'utf8');
    sources.set(relative, content);
  }
  for (const match of content.matchAll(/\b(?:from|import)\s*(?:\(\s*)?["'](\.[^"']+)["']/g)) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1]));
    await dependencies(target, visited);
  }
  return visited;
}
lines.push('', '## Vietinės Edge Functions ir jų priklausomybės', '',
  '`verify_jwt` nurodomas tik iš vietinio config.toml. `false` nereiškia, kad funkcija neturi vidinės autorizacijos; nenustatytas laukas nepatvirtina produkcijos nustatymo. Įdiegta funkcija gali turėti kitą versiją — tikrinkite paslaugą.', '',
  '| Funkcija | Vietinis verify_jwt | Santykinės priklausomybės, įskaitant netiesiogines |', '| --- | --- | --- |');
const reverse = new Map();
const endpoints = [];
for (const entry of await readdir(functionRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
  const index = await stat(path.join(functionRoot, entry.name, 'index.ts')).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (index?.isFile()) endpoints.push(entry.name);
}
endpoints.sort();
for (const name of endpoints) {
  const entrypoint = `${name}/index.ts`;
  const deps = [...await dependencies(entrypoint)].filter(relative => relative !== entrypoint).sort();
  for (const dependency of deps) {
    if (!reverse.has(dependency)) reverse.set(dependency, []);
    reverse.get(dependency).push(name);
  }
  lines.push(`| ${functionsLink(entrypoint)} | ${config.has(name) ? '`' + config.get(name) + '`' : 'nenurodyta'} | ${deps.map(functionsLink).join('<br>') || '—'} |`);
}
lines.push('', '## Bendrų serverio failų vartotojai', '',
  'Pakeitus bendrą failą, šis sąrašas padeda rasti funkcijas, kurių diegimo kopiją gali reikėti atnaujinti. Taip pat vertinkite pasikeitusio elgesio ir testų apimtį.', '',
  '| Priklausomybė | Funkcijos, pasiekiančios ją per importus |', '| --- | --- |');
for (const [dependency, users] of [...reverse].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  lines.push(`| ${functionsLink(dependency)} | ${users.map(name => '`' + name + '`').join(', ')} |`);
}
lines.push('');
const output = lines.join('\n');
if (check) {
  const existing = await readFile(destination, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  if (normalize(existing) !== output) {
    console.error('Project map is stale or missing. Run: pnpm docs:map');
    process.exitCode = 1;
  } else console.log(`Project map is current (${pages.length} pages, ${endpoints.length} local Edge Functions).`);
} else {
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, output, 'utf8');
  console.log(`Updated docs/GENERATED_MAP.md (${pages.length} pages, ${endpoints.length} local Edge Functions).`);
}
