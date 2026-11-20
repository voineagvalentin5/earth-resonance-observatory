/**
 * Readings history: real NOAA SWPC samples only.
 *
 * Live windows (verified 20 Nov 2026): official 3-hour Kp ~7 days,
 * propagated solar wind ~7 days, GOES X-ray / protons / electrons 7-day files,
 * 1-minute estimated Kp ~6 hours. Longer history is grown by the scheduled
 * Action that appends deduplicated snapshots to /data/history/*.json.
 * Empty bins are left empty — no interpolation, no back-fill.
 */
import { toIso, parseStamp } from './time.js';

export const CAP_DAYS = 90;
export const THIN_AFTER_DAYS = 8;
export const THIN_MINUTES = 15;
export const ARCHIVE_META = '/data/history/meta.json';
export const ARCHIVE_BASES = [
  '', // same-origin (static site)
  'https://ero.codex-hive.com',
  'https://voineagvalentin5.github.io/earth-resonance-observatory',
];

const NOAA = 'https://services.swpc.noaa.gov';
const UA = 'EarthResonanceObservatory/1.0 (local research dashboard; public NOAA SWPC data)';

export const METRICS = [
  { id: 'kp', label: 'Kp', unit: '', color: '#ffd84d', cadenceMs: 3 * 3600 * 1000, scale: 'kp', thin: false, file: 'kp.json' },
  { id: 'kp1m', label: 'Kp 1-min', unit: '', color: '#ffe9a0', cadenceMs: 60 * 1000, scale: 'kp', thin: true, file: 'kp1m.json', hidden: true },
  { id: 'speed', label: 'Wind speed', unit: 'km/s', color: '#5fd4ff', cadenceMs: 60 * 1000, scale: 'linear', thin: true, file: 'speed.json' },
  { id: 'density', label: 'Density', unit: 'p/cm³', color: '#3fe0c5', cadenceMs: 60 * 1000, scale: 'linear', thin: true, file: 'density.json' },
  { id: 'bz', label: 'Bz', unit: 'nT', color: '#b48cff', cadenceMs: 60 * 1000, scale: 'signed', thin: true, file: 'bz.json' },
  { id: 'xray', label: 'X-ray', unit: 'W/m²', color: '#ffa94d', cadenceMs: 60 * 1000, scale: 'log', thin: true, file: 'xray.json' },
  { id: 'proton', label: 'Protons', unit: 'pfu', color: '#ff6b6b', cadenceMs: 5 * 60 * 1000, scale: 'log', thin: true, file: 'proton.json' },
  { id: 'electron', label: 'Electrons', unit: 'efu', color: '#6fa8ff', cadenceMs: 5 * 60 * 1000, scale: 'log', thin: true, file: 'electron.json' },
];

export const PICKABLE = METRICS.filter((m) => !m.hidden);

const FEEDS = {
  kp: { path: '/products/noaa-planetary-k-index.json', kind: 'kpOfficial' },
  kp1m: { path: '/json/planetary_k_index_1m.json', kind: 'kp1m' },
  wind: { path: '/products/geospace/propagated-solar-wind.json', kind: 'wind' },
  xray: { path: '/json/goes/primary/xrays-7-day.json', kind: 'xray' },
  xray1d: { path: '/json/goes/primary/xrays-1-day.json', kind: 'xray' },
  proton: { path: '/json/goes/primary/integral-protons-7-day.json', kind: 'proton' },
  proton1d: { path: '/json/goes/primary/integral-protons-1-day.json', kind: 'proton' },
  electron: { path: '/json/goes/primary/integral-electrons-7-day.json', kind: 'electron' },
  electron1d: { path: '/json/goes/primary/integral-electrons-1-day.json', kind: 'electron' },
};

function num(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function msOf(value) {
  const d = parseStamp(value);
  return d ? d.getTime() : null;
}

function pointsFrom(rows, getT, getV) {
  const points = [];
  for (const row of rows || []) {
    const t = msOf(getT(row));
    const v = num(getV(row));
    if (t != null && v != null) points.push({ t, v });
  }
  points.sort((a, b) => a.t - b.t);
  return points;
}

function parseKpOfficial(data) {
  const rows = Array.isArray(data) ? data.filter((r) => r && typeof r === 'object' && 'Kp' in r) : [];
  return pointsFrom(rows, (r) => r.time_tag, (r) => r.Kp);
}

function parseKp1m(data) {
  const rows = Array.isArray(data) ? data.filter((r) => r && typeof r === 'object') : [];
  return pointsFrom(rows, (r) => r.time_tag, (r) => r.estimated_kp ?? r.kp_index);
}

function parseWindTable(data) {
  const rows = Array.isArray(data) ? data.slice() : [];
  const out = { speed: [], density: [], bz: [] };
  if (!rows.length || !Array.isArray(rows[0])) return out;
  const header = rows[0].map((h) => String(h).toLowerCase());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const t = msOf(row[idx.time_tag]);
    if (t == null) continue;
    const speed = num(row[idx.speed]);
    const density = num(row[idx.density]);
    const bz = num(row[idx.bz]);
    // Drop obvious NOAA fill/error values (e.g. speed 17,000 km/s). Not interpolation — the bin is left empty.
    if (speed != null && speed >= 100 && speed <= 3000) out.speed.push({ t, v: speed });
    if (density != null && density >= 0 && density <= 500) out.density.push({ t, v: density });
    if (bz != null && Math.abs(bz) <= 200) out.bz.push({ t, v: bz });
  }
  out.speed.sort((a, b) => a.t - b.t);
  out.density.sort((a, b) => a.t - b.t);
  out.bz.sort((a, b) => a.t - b.t);
  return out;
}

function parseEnergy(data, energy, field = 'flux') {
  const rows = (Array.isArray(data) ? data : []).filter((r) => r && r.energy === energy);
  return pointsFrom(rows, (r) => r.time_tag, (r) => r[field]);
}

async function fetchJson(path, { timeoutMs = 25000 } = {}) {
  const url = path.startsWith('http') ? path : `${NOAA}${path}`;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  const headers = { Accept: 'application/json' };
  if (typeof window === 'undefined') headers['User-Agent'] = UA;
  try {
    const res = await fetch(url, { signal: ctrl?.signal, headers, cache: typeof window !== 'undefined' ? 'no-cache' : undefined });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return { ok: true, url, data: await res.json() };
  } catch (err) {
    return { ok: false, url, data: null, error: err.message || String(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function mergePoints(a, b) {
  const map = new Map();
  for (const p of a || []) if (p && p.t != null && p.v != null) map.set(p.t, p);
  for (const p of b || []) if (p && p.t != null && p.v != null) map.set(p.t, p);
  return [...map.values()].sort((x, y) => x.t - y.t);
}

const VALID_RANGE = {
  speed: [100, 3000],
  density: [0, 500],
  bz: [-200, 200],
};

function inRange(id, v) {
  const r = VALID_RANGE[id];
  return !r || (v >= r[0] && v <= r[1]);
}

export function capAndThin(points, { now = Date.now(), capDays = CAP_DAYS, thinAfterDays = THIN_AFTER_DAYS, thinMinutes = THIN_MINUTES, thin = true, metric = null } = {}) {
  const cut = now - capDays * 86400000;
  const kept = (points || []).filter((p) => p.t >= cut && inRange(metric, p.v));
  if (!thin) return kept;
  const thinBefore = now - thinAfterDays * 86400000;
  const fine = []; const old = [];
  for (const p of kept) (p.t >= thinBefore ? fine : old).push(p);
  if (!old.length) return kept;
  const bin = thinMinutes * 60000;
  const byBin = new Map();
  for (const p of old) {
    const k = Math.floor(p.t / bin);
    const prev = byBin.get(k);
    if (!prev || p.t >= prev.t) byBin.set(k, p);
  }
  return [...byBin.values(), ...fine].sort((a, b) => a.t - b.t);
}

export function packPoints(points) {
  return (points || []).map((p) => [Math.round(p.t / 1000), p.v]);
}

export function unpackPoints(packed) {
  const out = [];
  for (const row of packed || []) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const t = Number(row[0]) * 1000;
    const v = Number(row[1]);
    if (Number.isFinite(t) && Number.isFinite(v)) out.push({ t, v });
  }
  return out;
}

function seriesSpan(points) {
  if (!points || !points.length) return null;
  return { from: points[0].t, to: points[points.length - 1].t, count: points.length };
}

export function overallSpan(series) {
  let from = Infinity; let to = -Infinity; let count = 0;
  Object.values(series || {}).forEach((pts) => {
    if (!pts || !pts.length) return;
    from = Math.min(from, pts[0].t);
    to = Math.max(to, pts[pts.length - 1].t);
    count += pts.length;
  });
  if (!Number.isFinite(from)) return null;
  const days = (to - from) / 86400000;
  return { from, to, count, days };
}

export function formatHistoryFrom(span) {
  if (!span) return 'No history yet';
  const d = new Date(span.from);
  const date = d.toLocaleString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
  const n = span.days >= 1.5 ? `${Math.round(span.days)} days` : span.days >= 0.9 ? '1 day' : `${Math.max(1, Math.round(span.days * 24))} hours`;
  return `History from ${date} (${n})`;
}

function parseFeed(kind, data) {
  if (kind === 'kpOfficial') return { kp: parseKpOfficial(data) };
  if (kind === 'kp1m') return { kp1m: parseKp1m(data) };
  if (kind === 'wind') return parseWindTable(data);
  if (kind === 'xray') return { xray: parseEnergy(data, '0.1-0.8nm') };
  if (kind === 'proton') return { proton: parseEnergy(data, '>=10 MeV') };
  if (kind === 'electron') return { electron: parseEnergy(data, '>=2 MeV') };
  return {};
}

export async function fetchLiveWindows({ short = false } = {}) {
  const keys = short
    ? ['kp', 'kp1m', 'xray1d', 'proton1d', 'electron1d']
    : ['kp', 'kp1m', 'wind', 'xray', 'proton', 'electron'];
  // When we only need a tail, still grab official Kp (tiny) and 1-min Kp.
  // Solar wind has no short file; the 7-day product is fetched only on a full load.
  if (short) {
    // include wind only if we have no archive covering it — caller decides
  }
  const jobs = keys.map(async (key) => {
    const feed = FEEDS[key];
    const res = await fetchJson(feed.path);
    return { key, feed, res };
  });
  const series = emptySeries();
  const sources = [];
  for (const { key, feed, res } of await Promise.all(jobs)) {
    if (!res.ok) {
      sources.push({ key, ok: false, url: res.url, error: res.error });
      continue;
    }
    sources.push({ key, ok: true, url: res.url });
    const parsed = parseFeed(feed.kind, res.data);
    Object.entries(parsed).forEach(([id, pts]) => {
      series[id] = mergePoints(series[id], pts);
    });
  }
  return { series, sources };
}

export function emptySeries() {
  return Object.fromEntries(METRICS.map((m) => [m.id, []]));
}


async function rawFetch(url, timeoutMs = 20000) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  const headers = { Accept: 'application/json' };
  if (typeof window === 'undefined') headers['User-Agent'] = UA;
  try {
    const res = await fetch(url, { signal: ctrl?.signal, headers, cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, url, data: await res.json() };
  } catch (err) {
    return { ok: false, url, data: null, error: err.message || String(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function loadArchiveFiles(bases = ARCHIVE_BASES) {
  for (const base of bases) {
    const metaUrl = `${base || ''}${ARCHIVE_META}`;
    const res = await rawFetch(metaUrl);
    if (!res.ok || !res.data || res.data.ok === false) continue;
    const meta = res.data;
    const series = emptySeries();
    await Promise.all(METRICS.map(async (m) => {
      const file = (meta.metrics && meta.metrics[m.id] && meta.metrics[m.id].file) || m.file;
      const url = `${base || ''}/data/history/${file}`;
      const part = await rawFetch(url);
      if (part.ok && part.data) series[m.id] = unpackPoints(part.data.points);
    }));
    const hasAny = Object.values(series).some((p) => p.length);
    if (!hasAny) continue;
    return { ok: true, meta, series, base: base || '(same origin)' };
  }
  return { ok: false, meta: null, series: emptySeries(), base: null };
}

export async function loadHistory() {
  const archive = await loadArchiveFiles();
  const live = await fetchLiveWindows({ short: archive.ok });
  if (!archive.ok) {
    // No archive: need the 7-day solar wind too (short fetch skips it).
    if (!live.series.speed.length) {
      const full = await fetchLiveWindows({ short: false });
      Object.keys(full.series).forEach((id) => { live.series[id] = mergePoints(live.series[id], full.series[id]); });
      live.sources = full.sources;
    }
  } else if (!live.series.speed.length && archive.series.speed.length) {
    // short fetch skipped wind; archive covers it. Latest tail arrives on the next snapshot.
  }
  const series = emptySeries();
  METRICS.forEach((m) => {
    series[m.id] = capAndThin(mergePoints(archive.series[m.id], live.series[m.id]), { thin: m.thin, metric: m.id });
  });
  const span = overallSpan(series);
  const metricSpans = {};
  METRICS.forEach((m) => { metricSpans[m.id] = seriesSpan(series[m.id]); });
  return {
    series,
    span,
    metricSpans,
    label: formatHistoryFrom(span),
    archive: archive.ok,
    archiveUpdatedAt: archive.meta?.updatedAt || null,
    sources: live.sources,
  };
}

export function buildArchive(existingSeries, liveSeries, { now = Date.now() } = {}) {
  const series = emptySeries();
  const metrics = {};
  METRICS.forEach((m) => {
    const merged = capAndThin(mergePoints(existingSeries?.[m.id], liveSeries?.[m.id]), { now, thin: m.thin, metric: m.id });
    series[m.id] = merged;
    const sp = seriesSpan(merged);
    metrics[m.id] = {
      file: m.file,
      count: merged.length,
      from: sp ? new Date(sp.from).toISOString() : null,
      to: sp ? new Date(sp.to).toISOString() : null,
      bytesEstimate: JSON.stringify(packPoints(merged)).length,
    };
  });
  const span = overallSpan(series);
  const meta = {
    ok: true,
    updatedAt: new Date(now).toISOString(),
    capDays: CAP_DAYS,
    thinAfterDays: THIN_AFTER_DAYS,
    thinMinutes: THIN_MINUTES,
    note: 'Real NOAA SWPC samples only. Gaps are left as gaps. Points older than 8 days may be thinned to at most one real sample per 15 minutes; no interpolation or back-fill.',
    span: span ? { from: new Date(span.from).toISOString(), to: new Date(span.to).toISOString(), days: Number(span.days.toFixed(2)), count: span.count } : null,
    metrics,
  };
  return { meta, series };
}

export function filesFromArchive(archive) {
  const files = { 'meta.json': `${JSON.stringify(archive.meta, null, 2)}\n` };
  METRICS.forEach((m) => {
    const pts = archive.series[m.id] || [];
    const body = {
      metric: m.id,
      unit: m.unit,
      updatedAt: archive.meta.updatedAt,
      count: pts.length,
      points: packPoints(pts),
    };
    files[m.file] = `${JSON.stringify(body)}\n`;
  });
  return files;
}

export { NOAA, FEEDS, toIso };
