import React, { useEffect, useMemo, useRef, useState } from 'react';
import HudPanel from './HudPanel';
import { formatUtc, formatDetroit } from '../lib/time';
import { xrayClass } from '../lib/classify';
import {
  PICKABLE, loadHistory, formatHistoryFrom,
} from '../lib/history';

const DEFAULT_ON = new Set(['kp', 'speed', 'density', 'bz', 'xray', 'proton', 'electron']);
const PRESETS = [
  { id: '1d', label: '1d', ms: 1 * 86400000 },
  { id: '3d', label: '3d', ms: 3 * 86400000 },
  { id: '7d', label: '7d', ms: 7 * 86400000 },
  { id: 'all', label: 'All', ms: null },
];

function fmtValue(id, v) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (id === 'kp' || id === 'kp1m') return v.toFixed(2);
  if (id === 'speed') return `${Math.round(v)} km/s`;
  if (id === 'density') return `${v >= 10 ? v.toFixed(1) : v.toFixed(2)} p/cm³`;
  if (id === 'bz') return `${v >= 0 ? '+' : ''}${v.toFixed(1)} nT`;
  if (id === 'xray') {
    const cls = xrayClass(v);
    return `${v.toExponential(2)} W/m²${cls ? ` (${cls})` : ''}`;
  }
  if (id === 'proton') return `${v >= 10 ? v.toFixed(1) : v.toFixed(2)} pfu`;
  if (id === 'electron') return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} efu`;
  return String(v);
}

function kpColor(v) {
  if (v >= 9) return '#a020f0';
  if (v >= 8) return '#c04bff';
  if (v >= 7) return '#e05050';
  if (v >= 6) return '#ff6b6b';
  if (v >= 5) return '#ffa94d';
  if (v >= 4) return '#ffd84d';
  if (v >= 3) return '#c6d94e';
  if (v >= 2) return '#6fbf4a';
  return '#2e7d4f';
}

function yMap(scale, v, y0, h, lo, hi) {
  if (scale === 'log') {
    const a = Math.log10(Math.max(lo, 1e-12));
    const b = Math.log10(Math.max(hi, lo * 10));
    const u = (Math.log10(Math.max(v, lo)) - a) / ((b - a) || 1);
    return y0 + h - u * h;
  }
  const u = (v - lo) / ((hi - lo) || 1);
  return y0 + h - u * h;
}

function rangeOf(points, t0, t1, scale) {
  let lo = Infinity; let hi = -Infinity; let n = 0;
  for (const p of points) {
    if (p.t < t0 || p.t > t1) continue;
    n += 1;
    if (p.v < lo) lo = p.v;
    if (p.v > hi) hi = p.v;
  }
  if (!n) return null;
  if (scale === 'kp') return { lo: 0, hi: 9 };
  if (scale === 'signed') {
    const m = Math.max(4, Math.abs(lo), Math.abs(hi)) * 1.15;
    return { lo: -m, hi: m };
  }
  if (scale === 'log') {
    const floor = lo > 0 ? lo / 4 : 1e-9;
    return { lo: Math.max(floor, 1e-9), hi: hi * 3 };
  }
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.08 || 1;
  return { lo: lo - pad, hi: hi + pad };
}

function nearest(points, t, maxDt) {
  if (!points || !points.length) return null;
  let lo = 0; let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < t) lo = mid + 1; else hi = mid;
  }
  let best = points[lo];
  if (lo > 0 && Math.abs(points[lo - 1].t - t) < Math.abs(best.t - t)) best = points[lo - 1];
  if (Math.abs(best.t - t) > maxDt) return null;
  return best;
}

export default function ReadingsHistory() {
  const [on, setOn] = useState(() => new Set(DEFAULT_ON));
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [view, setView] = useState(null); // {t0,t1}
  const [preset, setPreset] = useState('all');
  const [hover, setHover] = useState(null);
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const viewRef = useRef(view);
  const drawRef = useRef(() => {});
  viewRef.current = view;

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    loadHistory()
      .then((h) => {
        if (!alive) return;
        setData(h);
        setStatus(h.span ? 'ok' : 'empty');
        if (h.span) setView({ t0: h.span.from, t1: h.span.to });
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message || String(err));
        setStatus('error');
      });
    const id = setInterval(() => {
      loadHistory().then((h) => {
        if (!alive || !h.span) return;
        setData(h);
        setStatus('ok');
      }).catch(() => {});
    }, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const lanes = useMemo(() => PICKABLE.filter((m) => on.has(m.id)), [on]);
  const span = data?.span || null;

  const applyPreset = (id) => {
    if (!span) return;
    setPreset(id);
    const p = PRESETS.find((x) => x.id === id);
    if (!p || !p.ms) { setView({ t0: span.from, t1: span.to }); return; }
    const t1 = span.to;
    setView({ t0: Math.max(span.from, t1 - p.ms), t1 });
  };

  const zoomBy = (factor, anchor) => {
    const v = viewRef.current;
    if (!v || !span) return;
    const mid = anchor == null ? (v.t0 + v.t1) / 2 : anchor;
    const dur = Math.max(2 * 3600000, Math.min(span.to - span.from, (v.t1 - v.t0) * factor));
    let t0 = mid - (mid - v.t0) / (v.t1 - v.t0) * dur;
    let t1 = t0 + dur;
    if (t0 < span.from) { t0 = span.from; t1 = Math.min(span.to, t0 + dur); }
    if (t1 > span.to) { t1 = span.to; t0 = Math.max(span.from, t1 - dur); }
    setPreset(null);
    setView({ t0, t1 });
  };

  const panBy = (dt) => {
    const v = viewRef.current;
    if (!v || !span) return;
    const dur = v.t1 - v.t0;
    let t0 = v.t0 + dt;
    let t1 = v.t1 + dt;
    if (t0 < span.from) { t0 = span.from; t1 = t0 + dur; }
    if (t1 > span.to) { t1 = span.to; t0 = t1 - dur; }
    setPreset(null);
    setView({ t0, t1 });
  };

  useEffect(() => { drawRef.current(); }, [view, lanes]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas || !data || !lanes.length) return undefined;
    const ctx = canvas.getContext('2d');
    let hoverT = null;

    const layout = () => {
      const cssW = host.clientWidth;
      const cssH = host.clientHeight;
      if (!cssW || !cssH) return null;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const left = 36;
      const right = 10;
      const top = 6;
      const axis = 22;
      const plotW = Math.max(40, cssW - left - right);
      const laneGap = 8;
      const usable = Math.max(40, cssH - top - axis);
      const laneH = Math.max(28, (usable - laneGap * (lanes.length - 1)) / lanes.length);
      const lanesBox = lanes.map((m, i) => ({
        m,
        x: left,
        y: top + i * (laneH + laneGap),
        w: plotW,
        h: laneH,
      }));
      const v = viewRef.current;
      if (!v) return null;
      return { cssW, cssH, left, plotW, lanesBox, axisY: top + usable, t0: v.t0, t1: v.t1 };
    };

    const xOf = (t, L) => L.left + ((t - L.t0) / ((L.t1 - L.t0) || 1)) * L.plotW;
    const tOf = (x, L) => L.t0 + ((x - L.left) / L.plotW) * (L.t1 - L.t0);

    const draw = () => {
      const L = layout();
      if (!L) return;
      ctx.clearRect(0, 0, L.cssW, L.cssH);
      ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';

      L.lanesBox.forEach((box) => {
        const { m } = box;
        const pts = data.series[m.id] || [];
        const rng = rangeOf(pts, L.t0, L.t1, m.scale) || (m.scale === 'kp' ? { lo: 0, hi: 9 } : { lo: 0, hi: 1 });
        // background
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.strokeStyle = 'rgba(120, 200, 245, 0.22)';
        ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w, box.h);

        // zero / class guides
        if (m.scale === 'signed') {
          const y0 = yMap(m.scale, 0, box.y, box.h, rng.lo, rng.hi);
          ctx.strokeStyle = 'rgba(180, 140, 255, 0.35)';
          ctx.beginPath(); ctx.moveTo(box.x, y0); ctx.lineTo(box.x + box.w, y0); ctx.stroke();
        }
        if (m.scale === 'kp') {
          [3, 5, 7].forEach((k) => {
            const y = yMap('kp', k, box.y, box.h, 0, 9);
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke();
          });
        }
        if (m.id === 'xray') {
          [1e-8, 1e-7, 1e-6, 1e-5, 1e-4].forEach((f) => {
            if (f < rng.lo || f > rng.hi) return;
            const y = yMap('log', f, box.y, box.h, rng.lo, rng.hi);
            ctx.strokeStyle = 'rgba(255,169,77,0.12)';
            ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke();
          });
        }

        // bars — one column per pixel, real samples only (gap if none)
        const px0 = Math.floor(box.x);
        const px1 = Math.ceil(box.x + box.w);
        // walk points in view
        let i = 0;
        const ptsN = pts.length;
        while (i < ptsN && pts[i].t < L.t0 - m.cadenceMs) i += 1;
        if (m.id === 'kp') {
          for (; i < ptsN; i += 1) {
            const p = pts[i];
            if (p.t > L.t1) break;
            const x = xOf(p.t, L);
            const w = Math.max(2, (m.cadenceMs / (L.t1 - L.t0)) * L.plotW - 1);
            const y = yMap('kp', p.v, box.y, box.h, 0, 9);
            const base = box.y + box.h;
            ctx.fillStyle = kpColor(p.v);
            ctx.globalAlpha = 0.92;
            ctx.fillRect(x, y, w, Math.max(1, base - y));
            ctx.globalAlpha = 1;
          }
        } else if (m.scale === 'signed') {
          const y0 = yMap(m.scale, 0, box.y, box.h, rng.lo, rng.hi);
          for (let x = px0; x < px1; x += 1) {
            const ta = tOf(x, L); const tb = tOf(x + 1, L);
            let min = Infinity; let max = -Infinity; let last = null; let n = 0;
            while (i < ptsN && pts[i].t < ta) i += 1;
            let j = i;
            while (j < ptsN && pts[j].t < tb) {
              const v = pts[j].v; n += 1; last = v;
              if (v < min) min = v; if (v > max) max = v;
              j += 1;
            }
            if (!n) continue;
            // gap if the samples jump over this pixel? already only real pts in bin
            const yA = yMap(m.scale, max, box.y, box.h, rng.lo, rng.hi);
            const yB = yMap(m.scale, min, box.y, box.h, rng.lo, rng.hi);
            ctx.fillStyle = last >= 0 ? 'rgba(180,140,255,0.85)' : 'rgba(95,212,255,0.85)';
            const top = Math.min(yA, yB, y0);
            const bot = Math.max(yA, yB, y0);
            ctx.fillRect(x, top, 1, Math.max(1, bot - top));
          }
        } else {
          const yBase = m.scale === 'log'
            ? yMap(m.scale, rng.lo, box.y, box.h, rng.lo, rng.hi)
            : box.y + box.h;
          for (let x = px0; x < px1; x += 1) {
            const ta = tOf(x, L); const tb = tOf(x + 1, L);
            let max = -Infinity; let n = 0;
            while (i < ptsN && pts[i].t < ta) i += 1;
            let j = i;
            while (j < ptsN && pts[j].t < tb) { n += 1; if (pts[j].v > max) max = pts[j].v; j += 1; }
            if (!n) continue;
            const y = yMap(m.scale, max, box.y, box.h, rng.lo, rng.hi);
            ctx.fillStyle = m.color;
            ctx.globalAlpha = 0.88;
            ctx.fillRect(x, y, 1, Math.max(1, yBase - y));
            ctx.globalAlpha = 1;
          }
        }

        // 1-min Kp overlay on the Kp lane (only where we actually have samples)
        if (m.id === 'kp') {
          const fine = data.series.kp1m || [];
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          let started = false; let prevT = null;
          const gap = 3 * 60 * 1000;
          for (let k = 0; k < fine.length; k += 1) {
            const p = fine[k];
            if (p.t < L.t0 || p.t > L.t1) continue;
            if (prevT != null && p.t - prevT > gap) started = false;
            const x = xOf(p.t, L);
            const y = yMap('kp', p.v, box.y, box.h, 0, 9);
            if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
            prevT = p.t;
          }
          ctx.stroke();
        }

        // labels (name inside the lane so it is never clipped)
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(2, 8, 16, 0.55)';
        const nw = ctx.measureText(m.label).width;
        ctx.fillRect(box.x + 4, box.y + 3, nw + 6, 13);
        ctx.fillStyle = '#d4e6f1';
        ctx.fillText(m.label, box.x + 7, box.y + 4);
        ctx.fillStyle = '#6f8798';
        ctx.textAlign = 'right';
        ctx.font = '9px "JetBrains Mono", ui-monospace, monospace';
        if (m.scale === 'kp') {
          ctx.textBaseline = 'middle';
          ctx.fillText('9', box.x - 6, yMap('kp', 9, box.y, box.h, 0, 9));
          ctx.fillText('0', box.x - 6, box.y + box.h - 2);
        } else if (m.scale === 'signed') {
          ctx.textBaseline = 'middle';
          ctx.fillText('0', box.x - 6, yMap(m.scale, 0, box.y, box.h, rng.lo, rng.hi));
        } else if (m.id === 'xray') {
          ctx.textBaseline = 'middle';
          [['C', 1e-6], ['M', 1e-5], ['X', 1e-4]].forEach(([lab, f]) => {
            if (f >= rng.lo && f <= rng.hi) ctx.fillText(lab, box.x - 6, yMap('log', f, box.y, box.h, rng.lo, rng.hi));
          });
        }
      });

      // time axis
      ctx.fillStyle = '#6f8798';
      ctx.font = '9.5px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'center';
      const ticks = L.plotW < 480 ? 3 : 6;
      for (let i = 0; i <= ticks; i += 1) {
        const t = L.t0 + ((L.t1 - L.t0) * i) / ticks;
        const x = xOf(t, L);
        const label = new Date(t).toLocaleString('en-GB', {
          timeZone: 'UTC', day: 'numeric', month: 'short',
          hour: '2-digit', minute: '2-digit', hour12: false,
        }).replace(',', '');
        ctx.fillText(i === ticks ? `${label} UTC` : label, x, L.axisY + 4);
        ctx.strokeStyle = 'rgba(120,200,245,0.12)';
        ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, L.axisY); ctx.stroke();
      }

      if (hoverT != null && hoverT >= L.t0 && hoverT <= L.t1) {
        const x = xOf(hoverT, L);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, L.axisY); ctx.stroke();
        ctx.setLineDash([]);
      }
    };

    drawRef.current = draw;
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(host);

    let drag = null;
    const onWheel = (e) => {
      e.preventDefault();
      const L = layout(); if (!L) return;
      const rect = canvas.getBoundingClientRect();
      const t = tOf(e.clientX - rect.left, L);
      zoomBy(e.deltaY > 0 ? 1.18 : 1 / 1.18, t);
    };
    const onDown = (e) => {
      if (e.pointerType === 'touch' && e.isPrimary === false) return;
      const L = layout(); if (!L) return;
      drag = { x: e.clientX, t0: viewRef.current.t0, t1: viewRef.current.t1, id: e.pointerId };
      host.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      const L = layout(); if (!L) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (drag && e.pointerId === drag.id) {
        const dt = -((e.clientX - drag.x) / L.plotW) * (drag.t1 - drag.t0);
        const dur = drag.t1 - drag.t0;
        let t0 = drag.t0 + dt; let t1 = drag.t1 + dt;
        if (t0 < span.from) { t0 = span.from; t1 = t0 + dur; }
        if (t1 > span.to) { t1 = span.to; t0 = t1 - dur; }
        setPreset(null);
        setView({ t0, t1 });
        return;
      }
      if (x < L.left || x > L.left + L.plotW) { hoverT = null; setHover(null); draw(); return; }
      const t = tOf(x, L);
      hoverT = t;
      const rows = [];
      lanes.forEach((m) => {
        const p = nearest(data.series[m.id], t, Math.max(m.cadenceMs * 1.6, (L.t1 - L.t0) / L.plotW * 3));
        if (p) rows.push({ id: m.id, label: m.label, v: p.v, t: p.t });
      });
      const kp1 = nearest(data.series.kp1m, t, 2 * 60 * 1000);
      if (kp1 && on.has('kp')) rows.push({ id: 'kp1m', label: 'Kp 1-min', v: kp1.v, t: kp1.t });
      setHover({
        t,
        x,
        y: 8,
        rows,
        utc: formatUtc(t, { seconds: false }),
        detroit: formatDetroit(t, { seconds: false }),
      });
      draw();
    };
    const onUp = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    const onLeave = () => { hoverT = null; setHover(null); drag = null; draw(); };

    // pinch
    const pointers = new Map();
    const onPDown = (e) => { pointers.set(e.pointerId, e.clientX); onDown(e); };
    const onPMove = (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e.clientX);
      if (pointers.size === 2) {
        const xs = [...pointers.values()];
        const dist = Math.abs(xs[0] - xs[1]);
        if (onPMove.lastDist) {
          const factor = onPMove.lastDist / dist;
          if (Number.isFinite(factor) && factor > 0) zoomBy(Math.min(1.25, Math.max(0.8, factor)));
        }
        onPMove.lastDist = dist;
        return;
      }
      onMove(e);
    };
    const onPUp = (e) => { pointers.delete(e.pointerId); onPMove.lastDist = 0; onUp(e); };

    host.addEventListener('wheel', onWheel, { passive: false });
    host.addEventListener('pointerdown', onPDown);
    host.addEventListener('pointermove', onPMove);
    host.addEventListener('pointerup', onPUp);
    host.addEventListener('pointercancel', onPUp);
    host.addEventListener('pointerleave', onLeave);
    return () => {
      ro.disconnect();
      host.removeEventListener('wheel', onWheel);
      host.removeEventListener('pointerdown', onPDown);
      host.removeEventListener('pointermove', onPMove);
      host.removeEventListener('pointerup', onPUp);
      host.removeEventListener('pointercancel', onPUp);
      host.removeEventListener('pointerleave', onLeave);
    };
  }, [data, lanes, span, on]);

  const toggle = (id) => {
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else next.add(id);
      return next;
    });
  };

  const aside = (
    <div className="hist-controls">
      <button type="button" onClick={() => zoomBy(1.5)} title="Zoom out">−</button>
      <button type="button" onClick={() => zoomBy(1 / 1.5)} title="Zoom in">+</button>
      {PRESETS.map((p) => (
        <button key={p.id} type="button" className={preset === p.id ? 'active' : ''} onClick={() => applyPreset(p.id)}>{p.label}</button>
      ))}
    </div>
  );

  const fromLabel = data?.label || (span ? formatHistoryFrom(span) : '');

  return (
    <HudPanel id="11" title="READINGS HISTORY" className="history-panel" aside={aside}>
      <div className="hist-metrics">
        {PICKABLE.map((m) => (
          <button
            key={m.id}
            type="button"
            className={on.has(m.id) ? 'on' : ''}
            style={{ '--sw': m.color }}
            onClick={() => toggle(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="hist-body" ref={hostRef}>
        {status === 'loading' && <div className="spec-loading">Loading NOAA history…</div>}
        {status === 'error' && <div className="spec-loading">Could not load history{error ? `: ${error}` : ''}</div>}
        {status === 'empty' && <div className="spec-loading">No NOAA history points yet.</div>}
        {status === 'ok' && <canvas ref={canvasRef} aria-label="Scrollable histogram of recent NOAA readings" />}
        {hover && hover.rows.length > 0 && (
          <div className="hist-tip" style={{ left: Math.min(hover.x + 12, (hostRef.current?.clientWidth || 200) - 12) }}>
            <b>{hover.utc}</b>
            <em>{hover.detroit}</em>
            {hover.rows.map((r) => (
              <p key={r.id}><span>{r.label}</span> {fmtValue(r.id, r.v)}</p>
            ))}
          </div>
        )}
      </div>
      <p className="spec-badge hist-badge">
        <b>{fromLabel || 'History'}</b>
        {data?.archive && data.archiveUpdatedAt ? <> · archive updated {formatUtc(data.archiveUpdatedAt, { seconds: false })}</> : <> · NOAA live windows only; a scheduled snapshot will keep earlier days once the public site is running</>}
        {' '}· official 3-hour Kp, propagated solar wind (~7 d), GOES 7-day X-ray / protons / electrons · 1-min estimated Kp covers about 6 hours in the live feed (white line) · drag or scroll to move, wheel or pinch to zoom · gaps are gaps, no back-fill · Source: NOAA SWPC
      </p>
    </HudPanel>
  );
}

