/** Honest classifications from official NOAA scales and labeled descriptive thresholds. */

export function gScale(kp) {
  const value = Number(kp);
  if (!Number.isFinite(value)) {
    return { scale: '—', name: 'Unavailable', storm: false, kp: null };
  }
  // NOAA geomagnetic storm scale is defined on planetary Kp.
  if (value >= 9) return { scale: 'G5', name: 'Extreme', storm: true, kp: value };
  if (value >= 8) return { scale: 'G4', name: 'Severe', storm: true, kp: value };
  if (value >= 7) return { scale: 'G3', name: 'Strong', storm: true, kp: value };
  if (value >= 6) return { scale: 'G2', name: 'Moderate', storm: true, kp: value };
  if (value >= 5) return { scale: 'G1', name: 'Minor', storm: true, kp: value };
  return { scale: 'G0', name: 'No geomagnetic storm', storm: false, kp: value };
}

export function protonSScale(fluxPfu) {
  const value = Number(fluxPfu);
  if (!Number.isFinite(value)) {
    return { scale: '—', name: 'Unavailable', storm: false, flux: null };
  }
  // NOAA solar radiation storm scale, integral proton flux >= 10 MeV (pfu).
  if (value >= 100000) return { scale: 'S5', name: 'Extreme', storm: true, flux: value };
  if (value >= 10000) return { scale: 'S4', name: 'Severe', storm: true, flux: value };
  if (value >= 1000) return { scale: 'S3', name: 'Strong', storm: true, flux: value };
  if (value >= 100) return { scale: 'S2', name: 'Moderate', storm: true, flux: value };
  if (value >= 10) return { scale: 'S1', name: 'Minor', storm: true, flux: value };
  return { scale: 'S0', name: 'No solar radiation storm', storm: false, flux: value };
}

export function xrayClass(flux) {
  const value = Number(flux);
  if (!Number.isFinite(value) || value <= 0) return null;
  const bands = [
    ['X', 1e-4],
    ['M', 1e-5],
    ['C', 1e-6],
    ['B', 1e-7],
    ['A', 1e-8],
  ];
  for (const [letter, base] of bands) {
    if (value >= base) {
      const n = value / base;
      const digits = n >= 10 ? n.toFixed(0) : n.toFixed(1);
      return `${letter}${digits}`;
    }
  }
  return `A${(value / 1e-8).toFixed(2)}`;
}

export function flareClassRank(label) {
  if (!label) return 0;
  const m = String(label).trim().match(/^([ABCMX])\s*([0-9.]+)/i);
  if (!m) return 0;
  const letter = m[1].toUpperCase();
  const n = Number(m[2]);
  const base = { A: 1, B: 10, C: 100, M: 1000, X: 10000 }[letter] || 0;
  return base + (Number.isFinite(n) ? n : 0);
}

export function solarWindSpeedLabel(kmps) {
  const value = Number(kmps);
  if (!Number.isFinite(value)) return { label: 'Unavailable', value: null };
  // Descriptive thresholds only — not an official NOAA named scale.
  let label = 'Nominal';
  if (value >= 700) label = 'Very high';
  else if (value >= 500) label = 'High';
  else if (value >= 400) label = 'Elevated';
  return { label, value, note: 'Descriptive speed bands: nominal < 400, elevated 400–500, high 500–700, very high ≥ 700 km/s. Not an official NOAA scale.' };
}

export function bzLabel(nt) {
  const value = Number(nt);
  if (!Number.isFinite(value)) return { label: 'Unavailable', value: null };
  let label = 'Northward';
  if (value <= -10) label = 'Strongly southward';
  else if (value <= -5) label = 'Southward';
  else if (value < 0) label = 'Weakly southward';
  else if (value === 0) label = 'Near zero';
  return {
    label,
    value,
    note: 'Southward IMF Bz (negative GSM) is more geoeffective. Descriptive bands only.',
  };
}
