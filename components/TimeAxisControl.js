import React, { useEffect, useRef, useState } from 'react';
import HudPanel from './HudPanel';
import LiveValue, { LiveDot } from './LiveValue';
import { useStore } from '../stores/useStore';
import { formatUtc, formatDetroit, fractalProgress, fractalU } from '../lib/time';
import { sliceHistory, windowBounds, fmt, signed, fmtFlux, fmtInt, scaleHours } from '../lib/format';

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const short = (d) => (d ? formatUtc(d, { seconds: false }).replace(/ \d{4} /, ' ') : '—');

export function TimeAxisControl() {
  const { timeMode, setTimeMode, timeScale, setTimeScale, payload } = useStore();
  const bounds = windowBounds(payload, timeScale);
  const hours = bounds.hours || scaleHours(timeScale);
  const uEnd = fractalU(hours * 3600);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const tickLabel = (p) => (p === 1 ? 'Now' : `−${+(hours * (1 - p)).toFixed(hours < 6 ? 2 : 0)}h`);

  return (
    <HudPanel id="10" title="TIME AXIS CONTROL" className={`time-panel ${timeMode === 'fractal' ? 'is-fractal' : ''}`}>
      <div className="ta-grid">
        <div className="ta-label">View mode</div>
        <div className="segmented">
          <button onClick={() => setTimeMode('normal')} className={timeMode === 'normal' ? 'active' : ''}>Normal Time</button>
          <button onClick={() => setTimeMode('fractal')} className={timeMode === 'fractal' ? 'active purple' : ''}>Fractal Time (u = t<sup>1/e</sup>)</button>
        </div>
        <div className="ta-label">Time scale</div>
        <div className="scale-row">
          {['1 Hour', '6 Hours', '24 Hours', '7 Days'].map((x) => (
            <button key={x} onClick={() => setTimeScale(x)} className={timeScale === x ? 'active' : ''}>{x}</button>
          ))}
        </div>
      </div>
      <p className="about-time">
        <b>Fractal Time</b> = display transform only (u = t<sup>1/e</sup>, t = s from window start). Not a pattern detector or a scientific finding.
      </p>
      <div className="window-rows">
        <div><span>UTC</span><b>{short(bounds.start)}</b><i>→</i><b>{short(bounds.end)}</b></div>
        <div><span>Detroit</span><b>{bounds.start ? formatDetroit(bounds.start, { seconds: false }).replace(/, \d{4},/, ',') : '—'}</b><i>→</i><b>{bounds.end ? formatDetroit(bounds.end, { seconds: false }).replace(/, \d{4},/, ',') : '—'}</b></div>
        <div className="fractal"><span>u</span><b>0</b><i>→</i><b>{Number.isFinite(uEnd) ? uEnd.toFixed(2) : '—'}</b></div>
      </div>
      <div className="axis-rails">
        <div className={`rail ${timeMode === 'normal' ? 'on' : ''}`}>
          <em>Normal</em>
          <div className="rail-line">{ticks.map((p) => <span key={p} style={{ left: `${p * 100}%` }}><i />{tickLabel(p)}</span>)}</div>
        </div>
        <div className={`rail fractal ${timeMode === 'fractal' ? 'on' : ''}`}>
          <em>Fractal</em>
          <div className="rail-line">{ticks.map((p) => <span key={p} style={{ left: `${fractalProgress(p) * 100}%` }}><i />{p === 0 || p === 1 ? tickLabel(p) : ''}</span>)}</div>
        </div>
      </div>
    </HudPanel>
  );
}

export function PatternDetection() {
  const { payload } = useStore();
  const C = payload?.classification || {};
  const L = payload?.latest || {};
  const wind = L.solarWind || {};
  const live = !!payload;
  const tiles = [
    { k: 'Geomagnetic', scale: C.gScale?.scale, name: C.gScale?.name, hot: C.gScale?.storm, v: `Kp ${fmt(L.kpEstimated?.value, 2)} est. · ${fmt(L.kpOfficial?.value, 2)} official`, raw: L.kpEstimated?.value },
    { k: 'Radiation', scale: C.proton?.scale, name: C.proton?.name, hot: C.proton?.storm, v: L.proton?.flux != null ? `≥10 MeV ${fmt(L.proton.flux, 2)} pfu` : '—', raw: L.proton?.flux },
    { k: 'X-ray', scale: L.xray?.class || L.flareCurrent?.currentClass, name: 'GOES 0.1–0.8 nm class', v: L.xray?.flux != null ? `${fmtFlux(L.xray.flux)} W/m²` : '—', raw: L.xray?.flux },
  ];
  return (
    <HudPanel id="" title="SPACE WEATHER STATUS" className="pattern-panel" aside={<span className="aside-live"><LiveDot on={live} />NOAA live</span>}>
      <div className="swx-tiles">
        {tiles.map((t) => (
          <div key={t.k} className={`swx-tile ${t.hot ? 'hot' : ''}`}>
            <small>{t.k}</small>
            <LiveValue value={t.raw}><strong>{t.scale || '—'}</strong></LiveValue>
            <em>{t.name || ''}</em>
            <span>{t.v}</span>
          </div>
        ))}
      </div>
      <div className="swx-line">
        <span>Solar wind <b>{fmt(wind.speed, 0)} km/s</b> {C.solarWindSpeed?.label ? `· ${C.solarWindSpeed.label}` : ''}</span>
        <span>IMF Bz <b>{signed(wind.bz, 1, 'nT')}</b> {C.bz?.label ? `· ${C.bz.label}` : ''}</span>
        <span className="desc-tag">wording: descriptive bands</span>
      </div>
      <p className="status-note">G/S scales: official NOAA definitions. Wind and Bz wording: descriptive only. No confidence figures.</p>
    </HudPanel>
  );
}

function Spark({ data, colorVar, timeMode, animKey, id }) {
  const pts = Array.isArray(data) ? data.filter((d) => d && Number.isFinite(d.v)) : [];
  if (pts.length < 2) return <svg className="spark" viewBox="0 0 300 40" preserveAspectRatio="none" />;
  const vals = pts.map((d) => d.v);
  const min = Math.min(...vals); const max = Math.max(...vals);
  const span = max - min || 1;
  const xy = pts.map((d, i) => {
    const lin = i / (pts.length - 1);
    const x = (timeMode === 'fractal' ? fractalProgress(lin) : lin) * 300;
    const y = 36 - ((d.v - min) / span) * 32;
    return [x, y];
  });
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const area = `${line}L300,40L0,40Z`;
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg className="spark" viewBox="0 0 300 40" preserveAspectRatio="none" key={animKey} style={{ '--c': `var(${colorVar})` }}>
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`var(${colorVar})`} stopOpacity="0.32" />
          <stop offset="1" stopColor={`var(${colorVar})`} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#g-${id})`} className="spark-area" />
      <path d={line} className="spark-line" pathLength="1" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="2.2" className="spark-dot" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ContextData() {
  const { payload, timeMode, timeScale } = useStore();
  const H = payload?.history || {};
  const L = payload?.latest || {};
  const wind = L.solarWind || {};
  const hist = (key) => sliceHistory(H[key] || [], timeScale);
  const animKey = `${timeMode}-${timeScale}-${payload ? 1 : 0}`;
  const rows = [
    { id: 'kpe', label: 'Estimated Kp', unit: 'NOAA 1-min', c: '--green', d: hist('kpEstimated'), v: fmt(L.kpEstimated?.value, 2), raw: L.kpEstimated?.value },
    { id: 'kpo', label: 'Official Kp', unit: '3-hour', c: '--teal', d: hist('kpOfficial'), v: fmt(L.kpOfficial?.value, 2), raw: L.kpOfficial?.value },
    { id: 'sw', label: 'Solar wind', unit: 'km/s', c: '--orange', d: hist('solarWindSpeed'), v: fmt(wind.speed, 0), raw: wind.speed },
    { id: 'den', label: 'Density', unit: 'p/cm³', c: '--yellow', d: hist('solarWindDensity'), v: fmt(wind.density, 2), raw: wind.density },
    { id: 'bz', label: 'IMF Bz', unit: 'nT', c: '--blue', d: hist('bz'), v: signed(wind.bz, 1), raw: wind.bz },
    { id: 'xr', label: 'GOES X-ray', unit: 'class', c: '--purple', d: hist('xray'), v: L.xray?.class || (L.xray?.flux != null ? fmtFlux(L.xray.flux) : '—'), raw: L.xray?.flux },
    { id: 'pr', label: 'Protons ≥10 MeV', unit: 'pfu', c: '--red', d: hist('proton'), v: L.proton?.flux != null ? fmt(L.proton.flux, 2) : '—', raw: L.proton?.flux },
    { id: 'el', label: 'Electrons ≥2 MeV', unit: 'pfu', c: '--cyan', d: hist('electron'), v: L.electron?.flux != null ? fmtInt(L.electron.flux) : '—', raw: L.electron?.flux },
  ];
  const hours = scaleHours(timeScale);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <HudPanel id="9" title="SYNCHRONIZED CONTEXT" className="context-panel" aside={<span className="aside-live">{timeScale}<LiveDot on={!!payload} /></span>}>
      <div className="ctx-rows">
        {rows.map((r) => (
          <div className="ctx-row" key={r.id}>
            <span className="ctx-label">{r.label}<small>{r.unit}</small></span>
            <Spark data={r.d} colorVar={r.c} timeMode={timeMode} animKey={animKey} id={r.id} />
            <b style={{ color: `var(${r.c})` }}><LiveValue value={r.raw}>{r.v}</LiveValue></b>
          </div>
        ))}
        <div className="ctx-row off">
          <span className="ctx-label">Schumann power · harmonic energy · lightning</span>
          <span className="ctx-off">No live feed (not live)</span>
        </div>
        <div className="ctx-axis">
          <span />
          <div>{ticks.filter((p) => timeMode !== 'fractal' || p === 0 || p === 1).map((p) => <i key={p} style={{ left: `${(timeMode === 'fractal' ? fractalProgress(p) : p) * 100}%` }}>{p === 1 ? 'Now' : `−${+(hours * (1 - p)).toFixed(hours < 6 ? 2 : 0)}h`}</i>)}</div>
          <span />
        </div>
      </div>
      <p className="ctx-note">Each line is scaled to its own min–max in the window.</p>
    </HudPanel>
  );
}

export function PatternSummary() {
  const { payload } = useStore();
  const rows = (payload?.flaresDailyMax || []).slice(-3);
  const latestIdx = rows.length - 1;
  return (
    <section className="hud-panel pattern-summary">
      <header className="hud-title"><h2>DAILY GOES FLARES</h2><small className="title-sub">strongest per day · 3 days · UTC</small></header>
      <div className="hud-body">
        {rows.length ? (
          <ul className="flare-list">
            {rows.map((e, i) => (
              <li key={e.max || e.begin} className={i === latestIdx ? 'latest' : ''} title={`GOES-${e.satellite ?? '?'} · begin ${(e.begin || '').slice(11, 16)} · peak ${(e.max || '').slice(11, 16)} · end ${(e.end || '').slice(11, 16)} UTC`}>
                <span className="fl-date">{(e.max || e.begin || '').slice(5, 10).split('-').reverse().join('.')}</span>
                <b className={`cls cls-${(e.maxClass || ' ')[0]}`}>{e.maxClass || '—'}</b>
                <span className="fl-peak">peak {(e.max || '').slice(11, 16) || '—'}</span>
                <span className="fl-span">{(e.begin || '').slice(11, 16) || '—'}–{(e.end || '').slice(11, 16) || '—'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-note">Waiting for the NOAA 7-day GOES flare list.</p>
        )}
      </div>
    </section>
  );
}

const clsRank = (c) => ({ A: 0, B: 1, C: 2, M: 3, X: 4 }[(c || 'A')[0].toUpperCase()] ?? 0);

export function EventTimeline() {
  const { payload, timeScale, timeMode } = useStore();
  const [ref, width] = useWidth();
  const bounds = windowBounds(payload, timeScale);
  const start = bounds.start ? bounds.start.getTime() : null;
  const end = bounds.end ? bounds.end.getTime() : null;
  const span = start && end ? end - start : 1;
  const pos = (t) => {
    const lin = Math.max(0, Math.min(1, (t - start) / span));
    return (timeMode === 'fractal' ? fractalProgress(lin) : lin) * 100;
  };
  const events = (payload?.flares || [])
    .map((e) => ({ ...e, t: Date.parse(e.max || e.begin || '') }))
    .filter((e) => Number.isFinite(e.t) && start && e.t >= start && e.t <= end)
    .sort((a, b) => a.t - b.t);

  // Label placement: strongest first, two lanes (above / below the rail);
  // a label is only drawn if it does not collide with one already placed.
  const labelPx = 92;
  const minGap = width ? (labelPx / width) * 100 : 12;
  const lanes = [[], []];
  const labelled = new Map();
  events
    .filter((e) => clsRank(e.maxClass) >= 2)
    .slice()
    .sort((a, b) => clsRank(b.maxClass) - clsRank(a.maxClass) || parseFloat((b.maxClass || '').slice(1)) - parseFloat((a.maxClass || '').slice(1)) || b.t - a.t)
    .forEach((e) => {
      const x = pos(e.t);
      for (let l = 0; l < lanes.length; l += 1) {
        if (lanes[l].every((o) => Math.abs(o - x) >= minGap)) { lanes[l].push(x); labelled.set(e, l); return; }
      }
    });
  const hidden = events.filter((e) => clsRank(e.maxClass) >= 2 && !labelled.has(e)).length;

  return (
    <section className="hud-panel event-timeline">
      <header className="hud-title">
        <h2>EVENT TIMELINE</h2>
        <small className="title-sub">GOES X-ray flares in this window · NOAA · not Schumann events{timeMode === 'fractal' ? ' · fractal axis' : ''}</small>
        <span className="tl-range">{short(bounds.start)} → {short(bounds.end)}{hidden ? ` · +${hidden} unlabelled (hover dots)` : ''}</span>
        <span className="tl-legend"><i className="c" />C <i className="m" />M <i className="x" />X <i className="b" />A/B</span>
      </header>
      <div className="hud-body">
        <div className="timeline-track" ref={ref}>
          <div className="tl-rail" />
          {events.map((e) => {
            const x = pos(e.t);
            const lane = labelled.get(e);
            const k = (e.maxClass || 'A')[0].toUpperCase();
            const cls = `tl-ev k-${k} ${lane === 0 ? 'up' : lane === 1 ? 'down' : 'nolabel'}`;
            const edge = x > 92 ? 'edge-r' : x < 8 ? 'edge-l' : '';
            return (
              <div key={`${e.max}-${e.maxClass}-${e.begin}`} className={`${cls} ${edge}`} style={{ left: `${x}%` }} title={`${e.maxClass} flare · ${(e.begin || '').slice(11, 16)}–${(e.end || '').slice(11, 16)} UTC, peak ${(e.max || '').slice(11, 16)}`}>
                <i className="tl-dot" />
                {lane != null ? (
                  <span className="tl-label"><b>{e.maxClass}</b><em>{(e.max || '').slice(5, 10).split('-').reverse().join('.')} {(e.max || '').slice(11, 16)} UTC</em></span>
                ) : null}
              </div>
            );
          })}
          {!events.length && <p className="empty-note">No GOES flares in this time window.</p>}
        </div>
      </div>
    </section>
  );
}

export default TimeAxisControl;
