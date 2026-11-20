/**
 * Turn the public SOS-70 (Tomsk State University) spectrogram JPEG into a
 * frequency x time grid of RELATIVE intensity (0..1).
 *
 * How: each pixel colour is matched to the nearest colour on the image's own
 * colour bar (top = strongest, bottom = weakest). That gives a position on the
 * colour bar, not a calibrated amplitude, so the result is unitless and must be
 * labelled "relative intensity, not calibrated dB".
 *
 * Layout constants were measured on the 1540x460 image served on 20 Nov 2026:
 * the plot frame is drawn as 1-px white lines at x=59 (left) and y=29 (0 Hz) /
 * y=430 (40 Hz); the data area is x 60..1440, y 30..429. The sampler starts one
 * pixel inside the frame so axis pixels are never read as "strong". Colour bar
 * at x≈1520, y≈118..402 (white/pink at the top = strongest, dark blue = weakest). They are stored as fractions so a resized image still
 * works. If the layout changes and the colour match is poor, `ok` is false and
 * the caller falls back to the labelled reference model.
 */
export const SPEC_LAYOUT = {
  plot: { x0: 61 / 1540, x1: 1439 / 1540, y0: 30 / 460, y1: 429 / 460 },
  bar: { x: 1520 / 1540, y0: 110 / 460, y1: 410 / 460 },
  fMaxHz: 40,
};

function buildLut(px, w, h) {
  const bx = Math.round(SPEC_LAYOUT.bar.x * w);
  const y0 = Math.round(SPEC_LAYOUT.bar.y0 * h);
  const y1 = Math.round(SPEC_LAYOUT.bar.y1 * h);
  const cols = [];
  for (let y = y0; y <= y1; y += 1) {
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (let x = bx - 3; x <= bx + 3; x += 1) {
      const i = (y * w + x) * 4;
      r += px[i]; g += px[i + 1]; b += px[i + 2]; n += 1;
    }
    r /= n; g /= n; b /= n;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    // keep coloured (or near-white top) entries; skip black margins
    if (Math.max(r, g, b) > 90 && (sat > 60 || r + g + b > 600)) cols.push([r, g, b]);
  }
  if (cols.length < 40) return null;
  // index 0 = top of bar (strongest) -> value 1
  return cols.map((c, i) => ({ c, v: 1 - i / (cols.length - 1) }));
}

export function sampleSpectrogram(img, { nf = 80, nt = 160 } = {}) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;
  const lut = buildLut(px, w, h);
  if (!lut) return { ok: false, reason: 'colour bar not found' };

  const cache = new Map();
  const lookup = (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let hit = cache.get(key);
    if (hit) return hit;
    let best = Infinity; let v = 0;
    for (const e of lut) {
      const d = (e.c[0] - r) ** 2 + (e.c[1] - g) ** 2 + (e.c[2] - b) ** 2;
      if (d < best) { best = d; v = e.v; }
    }
    hit = { v, d: best };
    cache.set(key, hit);
    return hit;
  };

  const { x0, x1, y0, y1 } = SPEC_LAYOUT.plot;
  const X0 = Math.round(x0 * w); const X1 = Math.round(x1 * w);
  const Y0 = Math.round(y0 * h); const Y1 = Math.round(y1 * h);
  const grid = new Float32Array(nf * nt);
  let matched = 0; let total = 0;
  const vals = [];
  for (let fi = 0; fi < nf; fi += 1) {
    const ya = Y0 + Math.floor(((Y1 - Y0) * fi) / nf);
    const yb = Math.max(ya + 1, Y0 + Math.floor(((Y1 - Y0) * (fi + 1)) / nf));
    for (let ti = 0; ti < nt; ti += 1) {
      const xa = X0 + Math.floor(((X1 - X0) * ti) / nt);
      const xb = Math.max(xa + 1, X0 + Math.floor(((X1 - X0) * (ti + 1)) / nt));
      vals.length = 0;
      for (let y = ya; y < yb; y += 1) {
        for (let x = xa; x < xb; x += 1) {
          const i = (y * w + x) * 4;
          const r = px[i]; const g = px[i + 1]; const b = px[i + 2];
          total += 1;
          if (r + g + b < 30) continue; // black gap / no data
          const m = lookup(r, g, b);
          if (m.d < 6000) { matched += 1; vals.push(m.v); }
        }
      }
      // median rejects the 1-px white grid line and thin gap columns
      let v = 0;
      if (vals.length) { vals.sort((a, b) => a - b); v = vals[vals.length >> 1]; }
      grid[fi * nt + ti] = v;
    }
  }
  const quality = matched / Math.max(1, total);
  return { ok: quality > 0.6, quality, nf, nt, grid, fMaxHz: SPEC_LAYOUT.fMaxHz, lut: lut.map((e) => e.c) };
}

/** Labelled fallback: textbook harmonics only, flat in time. Not data. */
export function referenceModel(refsHz, { nf = 80, nt = 60, fMaxHz = 40 } = {}) {
  const grid = new Float32Array(nf * nt);
  for (let fi = 0; fi < nf; fi += 1) {
    const f = ((fi + 0.5) / nf) * fMaxHz;
    let v = 0;
    refsHz.forEach((hz, k) => { v += (1 - k * 0.15) * Math.exp(-(((f - hz) / 1.2) ** 2)); });
    for (let ti = 0; ti < nt; ti += 1) grid[fi * nt + ti] = Math.min(1, v);
  }
  return { ok: true, model: true, nf, nt, grid, fMaxHz };
}
