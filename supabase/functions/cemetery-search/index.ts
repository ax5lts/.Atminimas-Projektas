const DATA_BASE_URL = "https://get.data.gov.lt/datasets/gov/kapines/registras";
const MAX_PAGE = 5;
const MAX_PAGE_SIZE = 50;
const MODEL_CONCURRENCY = 8;
const UPSTREAM_TIMEOUT_MS = 15000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SearchInput = {
  p_query?: string | null;
  p_first_name?: string | null;
  p_last_name?: string | null;
  p_birth_year?: number | null;
  p_death_year?: number | null;
  p_municipality?: string | null;
  p_cemetery?: string | null;
  p_page?: number;
  p_page_size?: number;
};

type Model = { code: string; title: string };
let modelCache: { expires: number; models: Model[] } | null = null;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function text(value: unknown, max = 160): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function literal(value: string): string {
  return JSON.stringify(value);
}

function variants(value: string): string[] {
  if (/[ĄČĘĖĮŠŲŪŽ]/i.test(value)) return [value.toUpperCase()];
  const choices: Record<string, string[]> = {
    A: ["A", "Ą"], C: ["C", "Č"], E: ["E", "Ę", "Ė"], I: ["I", "Į"],
    S: ["S", "Š"], U: ["U", "Ų", "Ū"], Z: ["Z", "Ž"],
  };
  let result = [""];
  for (const char of value.toUpperCase()) {
    const next: string[] = [];
    for (const prefix of result) {
      for (const replacement of choices[char] || [char]) {
        next.push(prefix + replacement);
        if (next.length >= 32) break;
      }
      if (next.length >= 32) break;
    }
    result = next;
  }
  return [...new Set(result)];
}

function containsEither(token: string): string {
  const expressions: string[] = [];
  for (const value of variants(token)) {
    expressions.push(`vardas.contains(${literal(value)})`, `pavarde.contains(${literal(value)})`);
  }
  return `(${expressions.join("|")})`;
}

function containsField(field: string, value: string): string {
  const expressions = variants(value).map((item) => `${field}.contains(${literal(item)})`);
  return expressions.length === 1 ? expressions[0] : `(${expressions.join("|")})`;
}

function yearRange(field: string, year: number): string[] {
  return [`${field}>=${literal(`${year}-01-01`)}`, `${field}<${literal(`${year + 1}-01-01`)}`];
}

function upstreamHeaders(): HeadersInit {
  return { Accept: "application/json", "User-Agent": "Atminimas-cemetery-search/1.0" };
}

async function upstreamJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: upstreamHeaders(), signal: controller.signal });
    if (!response.ok) throw new Error(`data.gov.lt HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function models(): Promise<Model[]> {
  if (modelCache && modelCache.expires > Date.now()) return modelCache.models;
  const payload = await upstreamJson(`${DATA_BASE_URL}/velioniai/:format/json`);
  const prefix = "datasets/gov/kapines/registras/velioniai/";
  const found = (payload?._data || []).flatMap((row: any) => {
    const name = text(row.name, 300);
    const code = name.startsWith(prefix) ? name.slice(prefix.length) : "";
    return /^[A-Za-z0-9]+$/.test(code) ? [{ code, title: text(row.title) }] : [];
  });
  if (!found.length) throw new Error("data.gov.lt negrąžino savivaldybių modelių");
  modelCache = { expires: Date.now() + 6 * 60 * 60 * 1000, models: found };
  return found;
}

function geometryPoint(value: unknown): { latitude: number | null; longitude: number | null } {
  const pairs = [...text(value, 10000).matchAll(/([-+0-9.eE]+)\s+([-+0-9.eE]+)/g)]
    .map((match) => [Number(match[1]), Number(match[2])])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (!pairs.length) return { latitude: null, longitude: null };

  // Poligono centro pakanka nuorodai į konkrečią kapavietę; POINT atveju ribos sutampa.
  const xs = pairs.map(([x]) => x);
  const ys = pairs.map(([, y]) => y);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  const candidates: Array<{ latitude: number; longitude: number }> = [];
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) candidates.push({ longitude: x, latitude: y });
  if (Math.abs(y) <= 180 && Math.abs(x) <= 90) candidates.push({ longitude: y, latitude: x });

  function fromWebMercator(easting: number, northing: number) {
    const longitude = easting / 20037508.34 * 180;
    const projectedLatitude = northing / 20037508.34 * 180;
    const latitude = 180 / Math.PI * (2 * Math.atan(Math.exp(projectedLatitude * Math.PI / 180)) - Math.PI / 2);
    return { latitude, longitude };
  }
  candidates.push(fromWebMercator(x, y), fromWebMercator(y, x));
  const valid = candidates.filter((point) => Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180);
  return valid.find((point) => point.latitude >= 53 && point.latitude <= 57 && point.longitude >= 20 && point.longitude <= 27)
    || valid[0]
    || { latitude: null, longitude: null };
}

function resultRow(row: any, code: string) {
  const point = geometryPoint(row.geometrija);
  const firstName = text(row.vardas);
  const lastName = text(row.pavarde);
  const birthDate = text(row.gimimo_data) || null;
  const deathDate = text(row.mirties_data) || null;
  const burialDate = text(row.laidojimo_data) || null;
  return {
    id: text(row._id || row.vda_id || `${code}:${firstName}:${lastName}`, 300),
    first_name: firstName || null,
    last_name: lastName || null,
    full_name: [firstName, lastName].filter(Boolean).join(" "),
    birth_date: birthDate,
    birth_year: birthDate ? Number(birthDate.slice(0, 4)) || null : null,
    death_date: deathDate,
    death_year: deathDate ? Number(deathDate.slice(0, 4)) || null : null,
    burial_date: burialDate,
    burial_year: burialDate ? Number(burialDate.slice(0, 4)) || null : null,
    municipality: text(row.savivaldybe || row.savivaldybė || row.municipality) || code,
    cemetery: text(row.kapines || row.kapinės || row.kapiniu_pavadinimas || row.cemetery) || null,
    section: text(row.sektorius || row.kvartalas || row.section) || null,
    row_name: text(row.eile || row.eilė || row.row) || null,
    place_number: text(row.kapaviete || row.kapavietė || row.vietos_numeris || row.place_number) || null,
    latitude: point.latitude,
    longitude: point.longitude,
    source_model: code,
  };
}

async function searchModel(model: Model, filters: string[], limit: number) {
  // Savivaldybių modelių pasirenkami laukai skiriasi, todėl neprašome bendro
  // select sąrašo: API grąžintą įrašą žemiau sutraukiame iki viešų laukų.
  const query = [...filters, `limit(${limit})`].join("&");
  const url = `${DATA_BASE_URL}/velioniai/${model.code}?${encodeURI(query).replace(/#/g, "%23")}`;
  const payload = await upstreamJson(url);
  return { rows: (payload?._data || []).map((row: any) => resultRow(row, model.code)), hasMore: Boolean(payload?._page?.next) };
}

async function pooled<T, R>(values: T[], worker: (value: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const output: PromiseSettledResult<R>[] = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      try { output[index] = { status: "fulfilled", value: await worker(values[index]) }; }
      catch (reason) { output[index] = { status: "rejected", reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MODEL_CONCURRENCY, values.length) }, run));
  return output;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Leidžiamas tik POST metodas." }, 405);

  let input: SearchInput;
  try { input = await request.json(); }
  catch { return jsonResponse({ error: "Neteisingas JSON." }, 400); }

  const query = text(input.p_query, 220);
  const firstName = text(input.p_first_name, 100);
  const lastName = text(input.p_last_name, 120);
  const municipality = text(input.p_municipality, 160);
  const cemetery = text(input.p_cemetery, 200);
  if (![query, firstName, lastName].some((value) => value.length >= 2)) {
    return jsonResponse({ error: "Įveskite bent 2 raides." }, 400);
  }
  const page = Math.min(Math.max(Number(input.p_page) || 1, 1), MAX_PAGE);
  const pageSize = Math.min(Math.max(Number(input.p_page_size) || 20, 1), MAX_PAGE_SIZE);
  const target = page * pageSize;
  const filters: string[] = [];
  for (const token of query.split(" ").filter((item) => item.length >= 2).slice(0, 4)) filters.push(containsEither(token));
  if (firstName) filters.push(containsField("vardas", firstName));
  if (lastName) filters.push(containsField("pavarde", lastName));
  const birthYear = Number(input.p_birth_year);
  const deathYear = Number(input.p_death_year);
  if (Number.isInteger(birthYear) && birthYear >= 1000 && birthYear <= 2200) filters.push(...yearRange("gimimo_data", birthYear));
  if (Number.isInteger(deathYear) && deathYear >= 1000 && deathYear <= 2200) filters.push(...yearRange("mirties_data", deathYear));

  try {
    let available = await models();
    if (municipality) {
      const wanted = normalized(municipality);
      const narrowed = available.filter((model) => normalized(`${model.code} ${model.title}`).includes(wanted));
      available = narrowed;
    }
    const perModelLimit = cemetery ? MAX_PAGE * MAX_PAGE_SIZE : Math.min(target, MAX_PAGE * MAX_PAGE_SIZE);
    const responses = await pooled(available, (model) => searchModel(model, filters, perModelLimit));
    const rows: any[] = [];
    let failedModels = 0;
    let upstreamHasMore = false;
    for (const response of responses) {
      if (response.status === "fulfilled") {
        rows.push(...response.value.rows);
        upstreamHasMore ||= response.value.hasMore;
      } else failedModels += 1;
    }
    const filteredRows = cemetery
      ? rows.filter((row) => normalized(row.cemetery || "").includes(normalized(cemetery)))
      : rows;
    filteredRows.sort((a, b) => `${a.last_name || ""}\0${a.first_name || ""}\0${a.municipality || ""}\0${a.id}`.localeCompare(
      `${b.last_name || ""}\0${b.first_name || ""}\0${b.municipality || ""}\0${b.id}`, "lt"));
    const seen = new Set<string>();
    const unique = filteredRows.filter((row) => {
      const key = `${row.source_model}:${row.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const start = (page - 1) * pageSize;
    const items = unique.slice(start, start + pageSize);
    return jsonResponse({ items, page, pageSize, hasMore: unique.length > start + pageSize || upstreamHasMore, matched: unique.length, failedModels, source: "data.gov.lt" });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Oficiali kapaviečių paieška šiuo metu nepasiekiama." }, 502);
  }
});
