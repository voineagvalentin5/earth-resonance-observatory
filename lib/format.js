export function fmt(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

export function fmtInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

export function fmtFlux(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toExponential(2);
}

export function fmtTemp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n >= 10000) return `${Math.round(n).toLocaleString('en-US')} K`;
  return `${Math.round(n)} K`;
}

export function signed(value, digits = 1, unit = '') {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const core = `${n < 0 ? '−' : n > 0 ? '+' : ''}${Math.abs(n).toFixed(digits)}`;
  return unit ? `${core} ${unit}` : core;
}

export function scaleHours(timeScale) {
  if (timeScale === '1 Hour') return 1;
  if (timeScale === '6 Hours') return 6;
  if (timeScale === '7 Days') return 24 * 7;
  return 24;
}

export function sliceHistory(points, timeScale) {
  if (!Array.isArray(points) || !points.length) return [];
  const hours = scaleHours(timeScale);
  const last = points[points.length - 1];
  const end = Date.parse(last.t);
  if (!Number.isFinite(end)) return points;
  const start = end - hours * 3600 * 1000;
  return points.filter((p) => Date.parse(p.t) >= start);
}

export function windowBounds(payload, timeScale) {
  const hours = scaleHours(timeScale);
  const endIso = payload?.dataTime || payload?.generatedAt;
  const end = endIso ? new Date(endIso) : null;
  if (!end || Number.isNaN(end.getTime())) return { start: null, end: null, hours };
  return { start: new Date(end.getTime() - hours * 3600 * 1000), end, hours };
}
