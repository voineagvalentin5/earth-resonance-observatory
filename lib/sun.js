/** Approximate subsolar point (deg) for a date. Standard low-precision solar
 * position formulas (about 0.1° accuracy) — astronomy, not a measurement feed. */
export function subsolarPoint(date = new Date()) {
  const rad = Math.PI / 180;
  const d = date.getTime() / 86400000 - 10957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad;
  const gmstHours = (18.697374558 + 24.06570982441908 * d) % 24;
  let lon = ra - gmstHours * 15;
  lon = ((lon + 540) % 360) - 180;
  return { lat: dec / rad, lon };
}
