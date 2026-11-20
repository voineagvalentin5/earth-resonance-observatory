const BASE = 'https://services.swpc.noaa.gov';
const USER_AGENT = 'EarthResonanceObservatory/1.0 (local research dashboard; public NOAA SWPC data)';

// Current public SWPC paths as of 2026-11-20. The historic
// /products/solar-wind/plasma-1-day.json and mag-1-day.json URLs return 404.
const PATHS = {
  kpOfficial: '/products/noaa-planetary-k-index.json',
  kp1m: '/json/planetary_k_index_1m.json',
  solarWind: '/products/geospace/propagated-solar-wind.json',
  solarWindSpeedSummary: '/products/summary/solar-wind-speed.json',
  solarWindMagSummary: '/products/summary/solar-wind-mag-field.json',
  xrays: '/json/goes/primary/xrays-1-day.json',
  protons: '/json/goes/primary/integral-protons-1-day.json',
  electrons: '/json/goes/primary/integral-electrons-1-day.json',
  flares: '/json/goes/primary/xray-flares-7-day.json',
  flareLatest: '/json/goes/primary/xray-flares-latest.json',
  ovation: '/json/ovation_aurora_latest.json',
};

import { gScale, protonSScale, xrayClass, flareClassRank, solarWindSpeedLabel, bzLabel } from './classify';
import { toIso, parseStamp } from './time';

function urlFor(path) {
  return `${BASE}${path}`;
}

function num(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function downsample(points, maxPoints = 180) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points || [];
  const last = points.length - 1;
  const out = [];
  let prev = -1;
  for (let i = 0; i < maxPoints; i += 1) {
    const idx = Math.round((i * last) / (maxPoints - 1));
    if (idx !== prev) out.push(points[idx]);
    prev = idx;
  }
  return out;
}

function seriesFrom(rows, getT, getV, maxPoints) {
  const points = [];
  for (const row of rows || []) {
    const t = toIso(getT(row));
    const v = num(getV(row));
    if (t && v != null) points.push({ t, v });
  }
  points.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  return downsample(points, maxPoints);
}

const IS_BROWSER = typeof window !== 'undefined';
export const STATIC_SITE = process.env.NEXT_PUBLIC_STATIC_EXPORT === '1';
// In the browser (static site) the larger feeds are re-downloaded every 5 minutes
// instead of every poll, to keep phones' data use reasonable. Values still come
// straight from NOAA with their own timestamps.
const BROWSER_TTL_MS = {
  [PATHS.solarWind]: 300_000,
  [PATHS.xrays]: 300_000,
  [PATHS.protons]: 300_000,
  [PATHS.ovation]: 300_000,
};
const browserCache = new Map();

async function fetchJson(path, timeoutMs = 18000) {
  if (IS_BROWSER) {
    const hit = browserCache.get(path);
    const ttl = BROWSER_TTL_MS[path] || 0;
    if (hit && hit.ok && Date.now() - hit.at < ttl) return hit.result;
    const result = await fetchJsonNow(path, timeoutMs);
    browserCache.set(path, { ok: result.ok, at: Date.now(), result });
    return result;
  }
  return fetchJsonNow(path, timeoutMs);
}

async function fetchJsonNow(path, timeoutMs = 18000) {
  const url = urlFor(path);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      // Browsers may not set User-Agent (it would also force a CORS preflight).
      headers: IS_BROWSER ? { Accept: 'application/json' } : { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      cache: IS_BROWSER ? 'no-cache' : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return {
      ok: true,
      url,
      status: res.status,
      lastModified: res.headers.get('last-modified'),
      data: JSON.parse(text),
    };
  } catch (err) {
    return {
      ok: false,
      url,
      status: null,
      lastModified: null,
      data: null,
      error: err.name === 'AbortError' ? `Timeout fetching ${url}` : (err.message || String(err)),
    };
  } finally {
    clearTimeout(timer);
  }
}

function lastOf(rows) {
  return Array.isArray(rows) && rows.length ? rows[rows.length - 1] : null;
}

function parseKpOfficial(data) {
  const rows = Array.isArray(data) ? data.filter((r) => r && typeof r === 'object' && 'Kp' in r) : [];
  const history = seriesFrom(rows, (r) => r.time_tag, (r) => r.Kp, 80);
  const latest = lastOf(rows);
  return {
    history,
    latest: latest
      ? {
          value: num(latest.Kp),
          time: toIso(latest.time_tag),
          aRunning: num(latest.a_running),
          stationCount: num(latest.station_count),
        }
      : null,
  };
}

function parseKp1m(data) {
  const rows = Array.isArray(data) ? data.filter((r) => r && typeof r === 'object') : [];
  const history = seriesFrom(rows, (r) => r.time_tag, (r) => r.estimated_kp ?? r.kp_index, 180);
  const latest = lastOf(rows);
  return {
    history,
    latest: latest
      ? {
          value: num(latest.estimated_kp ?? latest.kp_index),
          kpIndex: num(latest.kp_index),
          kpText: latest.kp ?? null,
          time: toIso(latest.time_tag),
        }
      : null,
  };
}

function parseSolarWind(data) {
  const rows = Array.isArray(data) ? data.slice() : [];
  if (rows.length && Array.isArray(rows[0])) {
    const header = rows[0].map((h) => String(h).toLowerCase());
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    const objects = [];
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      objects.push({
        time_tag: row[idx.time_tag],
        speed: row[idx.speed],
        density: row[idx.density],
        temperature: row[idx.temperature],
        bx: row[idx.bx],
        by: row[idx.by],
        bz: row[idx.bz],
        bt: row[idx.bt],
        propagated_time_tag: row[idx.propagated_time_tag],
      });
    }
    const latest = lastOf(objects);
    return {
      historySpeed: seriesFrom(objects, (r) => r.time_tag, (r) => r.speed, 220),
      historyDensity: seriesFrom(objects, (r) => r.time_tag, (r) => r.density, 220),
      historyTemp: seriesFrom(objects, (r) => r.time_tag, (r) => r.temperature, 220),
      historyBz: seriesFrom(objects, (r) => r.time_tag, (r) => r.bz, 220),
      historyBt: seriesFrom(objects, (r) => r.time_tag, (r) => r.bt, 220),
      latest: latest
        ? {
            speed: num(latest.speed),
            density: num(latest.density),
            temperature: num(latest.temperature),
            bx: num(latest.bx),
            by: num(latest.by),
            bz: num(latest.bz),
            bt: num(latest.bt),
            time: toIso(latest.time_tag),
            propagatedTime: toIso(latest.propagated_time_tag),
            source: 'NOAA SWPC geospace propagated solar wind',
          }
        : null,
    };
  }
  return { historySpeed: [], historyDensity: [], historyTemp: [], historyBz: [], historyBt: [], latest: null };
}

function unwrapSummary(data) {
  if (Array.isArray(data) && data[0] && typeof data[0] === 'object') return data[0];
  if (data && typeof data === 'object') return data;
  return null;
}

function parseXrays(data) {
  const rows = (Array.isArray(data) ? data : []).filter((r) => r && r.energy === '0.1-0.8nm');
  const history = seriesFrom(rows, (r) => r.time_tag, (r) => r.flux, 220);
  const latest = lastOf(rows);
  const flux = latest ? num(latest.flux) : null;
  return {
    history,
    latest: latest
      ? {
          flux,
          class: xrayClass(flux),
          energy: latest.energy,
          satellite: latest.satellite ?? null,
          time: toIso(latest.time_tag),
        }
      : null,
  };
}

function parseEnergySeries(data, energy) {
  const rows = (Array.isArray(data) ? data : []).filter((r) => r && r.energy === energy);
  const history = seriesFrom(rows, (r) => r.time_tag, (r) => r.flux, 220);
  const latest = lastOf(rows);
  return {
    history,
    latest: latest
      ? {
          flux: num(latest.flux),
          energy: latest.energy,
          satellite: latest.satellite ?? null,
          time: toIso(latest.time_tag),
        }
      : null,
  };
}

function parseFlares(data) {
  const rows = (Array.isArray(data) ? data : []).filter((r) => r && r.max_class);
  rows.sort((a, b) => String(a.begin_time || a.time_tag).localeCompare(String(b.begin_time || b.time_tag)));
  return rows.map((r) => ({
    begin: toIso(r.begin_time || r.time_tag),
    max: toIso(r.max_time),
    end: toIso(r.end_time),
    beginClass: r.begin_class || null,
    maxClass: r.max_class || null,
    endClass: r.end_class || null,
    satellite: r.satellite ?? null,
  }));
}

function parseFlareLatest(data) {
  const row = unwrapSummary(data);
  if (!row) return null;
  return {
    currentClass: row.current_class || null,
    beginClass: row.begin_class || null,
    maxClass: row.max_class || null,
    endClass: row.end_class || null,
    begin: toIso(row.begin_time),
    max: toIso(row.max_time),
    end: toIso(row.end_time),
    satellite: row.satellite ?? null,
    time: toIso(row.time_tag),
  };
}

function parseOvation(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.coordinates)) return null;
  let maxIntensity = 0;
  const coords = data.coordinates;
  for (let i = 0; i < coords.length; i += 1) {
    const v = num(coords[i] && coords[i][2]);
    if (v != null && v > maxIntensity) maxIntensity = v;
  }
  return {
    maxIntensity,
    observationTime: toIso(data['Observation Time']),
    forecastTime: toIso(data['Forecast Time']),
    note: 'Peak cell value from the NOAA OVATION aurora forecast grid (0–100). Not a hemispheric power index.',
  };
}

function dailyStrongestFlares(flares) {
  const byDay = new Map();
  for (const flare of flares) {
    const day = (flare.max || flare.begin || '').slice(0, 10);
    if (!day) continue;
    const prev = byDay.get(day);
    if (!prev || flareClassRank(flare.maxClass) > flareClassRank(prev.maxClass)) {
      byDay.set(day, flare);
    }
  }
  return [...byDay.values()].sort((a, b) => String(a.max || a.begin).localeCompare(String(b.max || b.begin)));
}

function newestTime(values) {
  const stamps = values.map((v) => parseStamp(v)).filter(Boolean).sort((a, b) => a - b);
  return stamps.length ? stamps[stamps.length - 1].toISOString() : null;
}

async function buildLivePayload() {
  const keys = Object.keys(PATHS);
  const results = await Promise.all(keys.map((key) => fetchJson(PATHS[key])));
  const raw = Object.fromEntries(keys.map((key, i) => [key, results[i]]));

  const feeds = {};
  for (const [key, result] of Object.entries(raw)) {
    feeds[key] = {
      ok: result.ok,
      url: result.url,
      lastModified: result.lastModified,
      error: result.error || null,
    };
  }

  const kpOfficial = raw.kpOfficial.ok ? parseKpOfficial(raw.kpOfficial.data) : { history: [], latest: null };
  const kp1m = raw.kp1m.ok ? parseKp1m(raw.kp1m.data) : { history: [], latest: null };
  const wind = raw.solarWind.ok ? parseSolarWind(raw.solarWind.data) : {
    historySpeed: [], historyDensity: [], historyTemp: [], historyBz: [], historyBt: [], latest: null,
  };
  const speedSummary = raw.solarWindSpeedSummary.ok ? unwrapSummary(raw.solarWindSpeedSummary.data) : null;
  const magSummary = raw.solarWindMagSummary.ok ? unwrapSummary(raw.solarWindMagSummary.data) : null;
  const xrays = raw.xrays.ok ? parseXrays(raw.xrays.data) : { history: [], latest: null };
  const protons = raw.protons.ok ? parseEnergySeries(raw.protons.data, '>=10 MeV') : { history: [], latest: null };
  const electrons = raw.electrons.ok ? parseEnergySeries(raw.electrons.data, '>=2 MeV') : { history: [], latest: null };
  const flares = raw.flares.ok ? parseFlares(raw.flares.data) : [];
  const flareLatest = raw.flareLatest.ok ? parseFlareLatest(raw.flareLatest.data) : null;
  const aurora = raw.ovation.ok ? parseOvation(raw.ovation.data) : null;

  // Prefer the 7-day propagated series for a consistent latest vector (speed, density, T, B).
  // Cross-fill speed / Bz from the summary product only when the series is missing a field.
  const solarWind = { ...(wind.latest || {}) };
  if (speedSummary) {
    if (solarWind.speed == null) solarWind.speed = num(speedSummary.proton_speed);
    if (!solarWind.time) solarWind.time = toIso(speedSummary.time_tag);
    solarWind.summarySpeed = num(speedSummary.proton_speed);
    solarWind.summarySpeedTime = toIso(speedSummary.time_tag);
  }
  if (magSummary) {
    if (solarWind.bz == null) solarWind.bz = num(magSummary.bz_gsm);
    if (solarWind.bt == null) solarWind.bt = num(magSummary.bt);
    if (!solarWind.time) solarWind.time = toIso(magSummary.time_tag);
    solarWind.summaryBz = num(magSummary.bz_gsm);
    solarWind.summaryBt = num(magSummary.bt);
    solarWind.summaryMagTime = toIso(magSummary.time_tag);
  }

  const kpForScale = kp1m.latest?.value ?? kpOfficial.latest?.value;
  const classification = {
    gScale: gScale(kpForScale),
    gScaleSource: kp1m.latest?.value != null
      ? 'Estimated / nowcast planetary Kp (1-minute product)'
      : 'Official 3-hour planetary Kp',
    officialGScale: gScale(kpOfficial.latest?.value),
    solarWindSpeed: solarWindSpeedLabel(solarWind.speed),
    bz: bzLabel(solarWind.bz),
    xray: {
      class: xrays.latest?.class || flareLatest?.currentClass || null,
      flux: xrays.latest?.flux ?? null,
      note: 'GOES X-ray class from the 0.1–0.8 nm channel, or the latest GOES flare product when shown.',
    },
    proton: protons.latest ? protonSScale(protons.latest.flux) : protonSScale(null),
  };

  const okCount = Object.values(feeds).filter((f) => f.ok).length;
  const feedCount = Object.keys(feeds).length;
  const dataTime = newestTime([
    kpOfficial.latest?.time,
    kp1m.latest?.time,
    solarWind.time,
    xrays.latest?.time,
    protons.latest?.time,
    electrons.latest?.time,
    flareLatest?.time,
    aurora?.observationTime,
  ]);

  return {
    generatedAt: new Date().toISOString(),
    pollSeconds: 60,
    dataTime,
    feedStatus: { ok: okCount, total: feedCount },
    feeds,
    latest: {
      kpOfficial: kpOfficial.latest,
      kpEstimated: kp1m.latest,
      solarWind: Object.keys(solarWind).length ? solarWind : null,
      xray: xrays.latest,
      proton: protons.latest,
      electron: electrons.latest,
      flareCurrent: flareLatest,
      aurora,
    },
    classification,
    history: {
      kpOfficial: kpOfficial.history,
      kpEstimated: kp1m.history,
      solarWindSpeed: wind.historySpeed,
      solarWindDensity: wind.historyDensity,
      solarWindTemp: wind.historyTemp,
      bz: wind.historyBz,
      bt: wind.historyBt,
      xray: xrays.history,
      proton: protons.history,
      electron: electrons.history,
    },
    flares,
    flaresDailyMax: dailyStrongestFlares(flares),
    schumann: {
      live: false,
      note: 'No public numeric Schumann API. Textbook harmonic frequencies are reference values only, not measurements.',
      referenceHz: [7.83, 14.3, 20.8, 27.3, 33.8],
      referenceLabels: ['Fund.', '2nd', '3rd', '4th', '5th'],
      spectrogram: {
        available: true,
        // Static site: a GitHub Action fetches the image about every 30 min and
        // publishes it same-origin with a timestamp file (see .github/workflows/pages.yml).
        proxyUrl: STATIC_SITE ? '/data/shm.jpg' : '/api/schumann-spectrogram',
        snapshotMetaUrl: STATIC_SITE ? '/data/shm-meta.json' : null,
        sourceUrl: 'https://sos70.ru/provider.php?file=shm.jpg',
        credit: 'Space Observing System (SOS-70), Tomsk State University',
        pageUrl: 'https://sos70.ru/',
        note: 'Public spectrogram image, typically covering the last three days. Not a numeric feed. The older sosrff.tsu.ru/new/shm.jpg file stopped updating on 1 Sep 2025 and is not used.',
      },
    },
    lightning: {
      live: false,
      note: 'No free public numeric API for a global lightning rate (WWLLN / Blitzortung). This panel does not invent a rate.',
    },
    sources: [
      { live: true, label: 'Planetary Kp (3-hour official)', url: urlFor(PATHS.kpOfficial) },
      { live: true, label: 'Planetary Kp (1-minute estimated)', url: urlFor(PATHS.kp1m) },
      { live: true, label: 'Propagated solar wind (speed, density, temperature, IMF)', url: urlFor(PATHS.solarWind) },
      { live: true, label: 'Solar wind speed summary', url: urlFor(PATHS.solarWindSpeedSummary) },
      { live: true, label: 'Solar wind IMF summary', url: urlFor(PATHS.solarWindMagSummary) },
      { live: true, label: 'GOES X-ray flux 0.1–0.8 nm (1 day)', url: urlFor(PATHS.xrays) },
      { live: true, label: 'GOES integral protons ≥10 MeV (1 day)', url: urlFor(PATHS.protons) },
      { live: true, label: 'GOES integral electrons ≥2 MeV (1 day)', url: urlFor(PATHS.electrons) },
      { live: true, label: 'GOES X-ray flares (7 day + latest)', url: urlFor(PATHS.flares) },
      { live: true, label: 'OVATION aurora forecast (peak grid value only)', url: urlFor(PATHS.ovation) },
      { live: false, label: 'Schumann spectrogram image, SOS-70 Tomsk State University', url: 'https://sos70.ru/provider.php?file=shm.jpg' },
      { live: false, label: 'Global lightning rate — no live feed' },
    ],
  };
}

export { buildLivePayload, PATHS, BASE, USER_AGENT };
