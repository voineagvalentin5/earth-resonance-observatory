import React, { useEffect, useRef, useState } from 'react';
import { RAINBOW, colorAt, rampFromLut, prepareIntensity } from '../lib/spectrogram';

/**
 * Flat heatmap of the same relative-intensity grid as the 3D landscape.
 * x = time (older left, newest right), y = frequency in Hz (0 at the bottom).
 * Colours and contrast stretch match the 3D view. Hover shows frequency and
 * an approximate place in the ~3-day window — never a fabricated clock time.
 */
export default function Spectrogram2D({ data, refs = [], labels = [], timeLabels, state }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const layoutRef = useRef(null);
  const preparedRef = useRef(null);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas || !data) return undefined;
    const prepared = prepareIntensity(data);
    preparedRef.current = prepared;
    const ramp = data.model ? RAINBOW : rampFromLut(data.lut);
    const { nf, nt, sm, fMaxHz } = prepared;
    const ctx = canvas.getContext('2d');

    // Offscreen heatmap at grid resolution (time × frequency, 0 Hz at the bottom).
    const off = document.createElement('canvas');
    off.width = nt;
    off.height = nf;
    const octx = off.getContext('2d');
    const img = octx.createImageData(nt, nf);
    for (let f = 0; f < nf; f += 1) {
      const row = nf - 1 - f; // 0 Hz at the bottom
      for (let t = 0; t < nt; t += 1) {
        const c = colorAt(sm[f * nt + t], ramp);
        const i = (row * nt + t) * 4;
        img.data[i] = Math.round(c[0] * 255);
        img.data[i + 1] = Math.round(c[1] * 255);
        img.data[i + 2] = Math.round(c[2] * 255);
        img.data[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);

    const draw = (cursor) => {
      const cssW = host.clientWidth;
      const cssH = host.clientHeight;
      if (!cssW || !cssH) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const left = 40;
      const right = 52;
      const top = 14;
      const bottom = 22;
      const plotW = Math.max(8, cssW - left - right);
      const plotH = Math.max(8, cssH - top - bottom);
      const plot = { x: left, y: top, w: plotW, h: plotH, fMaxHz };
      layoutRef.current = plot;

      ctx.drawImage(off, 0, 0, nt, nf, plot.x, plot.y, plot.w, plot.h);

      // Frame
      ctx.strokeStyle = 'rgba(120, 200, 245, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(plot.x + 0.5, plot.y + 0.5, plot.w, plot.h);

      const yOf = (hz) => plot.y + plot.h * (1 - hz / fMaxHz);
      ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = '#a9c0d0';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      [0, 10, 20, 30, 40].filter((f) => f <= fMaxHz).forEach((f) => {
        const y = yOf(f);
        ctx.fillStyle = 'rgba(120, 200, 245, 0.18)';
        ctx.fillRect(plot.x, y, plot.w, 1);
        ctx.fillStyle = '#a9c0d0';
        ctx.fillText(f === 40 ? '40 Hz' : `${f}`, plot.x - 6, y);
      });

      // Textbook Schumann bands (reference only)
      ctx.save();
      ctx.beginPath();
      ctx.rect(plot.x, plot.y, plot.w, plot.h);
      ctx.clip();
      refs.forEach((hz) => {
        if (hz < 0 || hz > fMaxHz) return;
        const y = yOf(hz);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(plot.x, y);
        ctx.lineTo(plot.x + plot.w, y);
        ctx.stroke();
      });
      ctx.restore();
      ctx.setLineDash([]);
      ctx.font = '9.5px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      refs.forEach((hz) => {
        if (hz < 0 || hz > fMaxHz) return;
        const y = yOf(hz);
        const label = hz.toFixed(2);
        const tw = ctx.measureText(label).width;
        const tx = plot.x + 6;
        const ty = Math.max(plot.y + 11, Math.min(plot.y + plot.h - 2, y - 2));
        ctx.fillStyle = 'rgba(2, 8, 16, 0.72)';
        ctx.fillRect(tx - 3, ty - 10, tw + 6, 12);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.strokeRect(tx - 3, ty - 10, tw + 6, 12);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, tx, ty);
      });

      // Time axis
      ctx.font = '9.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#6f8798';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      const leftT = timeLabels ? timeLabels[0] : 'older';
      const rightT = timeLabels ? timeLabels[1] : 'newest';
      if (timeLabels) {
        ctx.fillText(leftT, plot.x, plot.y + plot.h + 6);
        ctx.textAlign = 'right';
        ctx.fillText(rightT, plot.x + plot.w, plot.y + plot.h + 6);
      }
      ctx.textAlign = 'center';
      ctx.fillText('time', plot.x + plot.w / 2, plot.y + plot.h + 6);

      // Colour bar (same ramp)
      const barX = plot.x + plot.w + 8;
      const barW = 8;
      const grad = ctx.createLinearGradient(0, plot.y + plot.h, 0, plot.y);
      ramp.forEach((c, i) => {
        const [r, g, b] = c;
        grad.addColorStop(i / Math.max(1, ramp.length - 1), `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`);
      });
      ctx.fillStyle = grad;
      ctx.fillRect(barX, plot.y, barW, plot.h);
      ctx.strokeStyle = 'rgba(120, 200, 245, 0.35)';
      ctx.strokeRect(barX + 0.5, plot.y + 0.5, barW, plot.h);
      ctx.font = '9px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#6f8798';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('high', barX + barW / 2, plot.y - 2);
      ctx.textBaseline = 'top';
      ctx.fillText('low', barX + barW / 2, plot.y + plot.h + 2);
      ctx.save();
      ctx.translate(barX + barW + 12, plot.y + plot.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Relative intensity, not calibrated dB', 0, 0);
      ctx.restore();

      // Hover crosshair
      if (cursor) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(plot.x, plot.y, plot.w, plot.h);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(cursor.x, plot.y);
        ctx.lineTo(cursor.x, plot.y + plot.h);
        ctx.moveTo(plot.x, cursor.y);
        ctx.lineTo(plot.x + plot.w, cursor.y);
        ctx.stroke();
        ctx.restore();
      }
    };

    const readAt = (clientX, clientY) => {
      const plot = layoutRef.current;
      if (!plot) return null;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (x < plot.x || x > plot.x + plot.w || y < plot.y || y > plot.y + plot.h) return null;
      const u = (x - plot.x) / plot.w;
      const hz = (1 - (y - plot.y) / plot.h) * plot.fMaxHz;
      return { x, y, u, hz };
    };

    const timePhrase = (u) => {
      if (state !== 'image') return 'reference model, flat in time · not live';
      if (u >= 0.95) return 'near newest · ~3-day window';
      if (u <= 0.05) return 'near oldest · ~3-day window';
      const days = (1 - u) * 3;
      return `≈ ${days.toFixed(1)} d before newest · ~3-day window (approx.)`;
    };

    const nearBand = (hz) => {
      let best = null; let d = 0.45;
      refs.forEach((r, i) => {
        const ad = Math.abs(r - hz);
        if (ad < d) { d = ad; best = { hz: r, label: labels[i] }; }
      });
      return best;
    };

    const onMove = (e) => {
      const hit = readAt(e.clientX, e.clientY);
      if (!hit) { setHover(null); draw(null); return; }
      const band = nearBand(hit.hz);
      const freq = band ? `${band.hz.toFixed(2)} Hz${band.label ? ` (${band.label})` : ''}` : `${hit.hz.toFixed(1)} Hz`;
      setHover({ x: hit.x, y: hit.y, text: `${freq} · ${timePhrase(hit.u)}` });
      draw(hit);
    };
    const onLeave = () => { setHover(null); draw(null); };

    const ro = new ResizeObserver(() => draw(null));
    ro.observe(host);
    draw(null);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('pointercancel', onLeave);
    return () => {
      ro.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointercancel', onLeave);
    };
  }, [data, refs, labels, timeLabels, state]);

  return (
    <div className="spec2d" ref={hostRef}>
      <canvas ref={canvasRef} aria-label="2D Schumann spectrogram, time versus frequency" />
      {hover ? (
        <div
          className="spec2d-tip"
          style={{ left: Math.min(hover.x + 12, (hostRef.current?.clientWidth || 200) - 8), top: Math.max(8, hover.y - 28) }}
        >
          {hover.text}
        </div>
      ) : null}
    </div>
  );
}
