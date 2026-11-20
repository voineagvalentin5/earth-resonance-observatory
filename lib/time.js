/** Time formatting and the Fractal Time display transform (not a scientific finding). */

export const DETROIT_TZ = 'America/Detroit';

export function parseStamp(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  const iso = /Z$|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIso(value) {
  const date = value instanceof Date ? value : parseStamp(value);
  return date ? date.toISOString() : null;
}

export function formatUtc(value, opts = {}) {
  const date = value instanceof Date ? value : parseStamp(value);
  if (!date) return '—';
  const datePart = date.toLocaleString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timePart = date.toLocaleString('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    second: opts.seconds === false ? undefined : '2-digit',
    hour12: false,
  });
  return `${datePart} ${timePart} UTC`;
}

export function formatDetroit(value, opts = {}) {
  const date = value instanceof Date ? value : parseStamp(value);
  if (!date) return '—';
  return date.toLocaleString('en-US', {
    timeZone: DETROIT_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: opts.seconds === false ? undefined : '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
}

export function formatBoth(value) {
  return { utc: formatUtc(value), detroit: formatDetroit(value) };
}

/**
 * Display-only axis transform: u = t^(1/e), where t is seconds from the
 * start of the selected window. This remaps sparkline / axis positions.
 * It is not a measurement and is not used to claim findings.
 */
export function fractalProgress(linearProgress) {
  const p = Math.max(0, Math.min(1, Number(linearProgress) || 0));
  return p ** (1 / Math.E);
}

export function fractalU(secondsFromStart) {
  const t = Math.max(0, Number(secondsFromStart) || 0);
  return t ** (1 / Math.E);
}
