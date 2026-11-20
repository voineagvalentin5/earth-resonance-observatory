import React from 'react';
import { useStore } from '../stores/useStore';
import HudPanel from './HudPanel';
import LiveValue, { LiveDot } from './LiveValue';
import { fmt, signed, fmtTemp } from '../lib/format';

function Arc({ pct = 0, hot = false }) {
  const p = Math.max(0, Math.min(1, pct));
  const len = Math.PI * 16;
  return (
    <svg className={`arc ${hot ? 'hot' : ''}`} viewBox="0 0 40 24" aria-hidden="true">
      <path d="M4 20 A16 16 0 0 1 36 20" className="arc-bg" />
      <path d="M4 20 A16 16 0 0 1 36 20" className="arc-fg" style={{ strokeDasharray: `${len}`, strokeDashoffset: `${len * (1 - p)}` }} />
    </svg>
  );
}

function Row({ icon, label, sub, value, raw, unit, gauge, hot, live = true, off = false, minor = false }) {
  return (
    <div className={`metric-row ${off ? 'off' : ''} ${minor ? 'minor' : ''}`}>
      <div className="metric-icon">{icon}</div>
      <div className="metric-main">
        <b>{label}{live && !off ? <LiveDot /> : null}</b>
        {sub && <small>{sub}</small>}
      </div>
      <strong className={hot ? 'danger' : ''}>
        {off ? value : <LiveValue value={raw}>{value}{unit ? <span className="u">{unit}</span> : null}</LiveValue>}
      </strong>
      {gauge != null ? <Arc pct={gauge} hot={hot} /> : <span />}
    </div>
  );
}

export default function PlanetStatusSidebar() {
  const { payload } = useStore();
  const L = payload?.latest || {};
  const C = payload?.classification || {};
  const refs = payload?.schumann?.referenceHz || [7.83, 14.3, 20.8, 27.3, 33.8];
  const labels = payload?.schumann?.referenceLabels || ['Fund.', '2nd', '3rd', '4th', '5th'];
  const kpEst = L.kpEstimated?.value;
  const kpOff = L.kpOfficial?.value;
  const wind = L.solarWind || {};
  const live = !!payload;

  return (
    <HudPanel id="1" title="PLANET STATUS DASHBOARD" className="left-panel">
      <div className="harmonic-card">
        <div className="metric-head">
          <div className="metric-icon">◉</div>
          <div>
            <b>SCHUMANN HARMONICS</b>
            <em>Textbook reference values · no numeric API · spectrogram in panel 3</em>
          </div>
          <strong className="off-tag">Not live</strong>
        </div>
        {refs.map((hz, i) => (
          <div className="harmonic-line" key={hz}>
            <span>{hz.toFixed(2)} Hz <small>{labels[i] || `${i + 1}`}</small></span>
            <div className="bar ref-bar" title="Position on a 0–40 Hz scale"><i style={{ left: `${(hz / 40) * 100}%` }} /></div>
            <em>ref.</em>
          </div>
        ))}
      </div>
      <Row icon="ϟ" label="LIGHTNING RATE" sub="No free public numeric API" value="No live feed" off minor />
      <Row icon="Kp" label="ESTIMATED Kp" sub={L.kpEstimated?.kpText ? `NOAA 1-minute · ${L.kpEstimated.kpText}` : 'NOAA 1-minute Kp'} value={fmt(kpEst, 2)} raw={kpEst} gauge={Number.isFinite(kpEst) ? kpEst / 9 : null} hot={C.gScale?.storm} live={live} />
      <Row icon="Kp" minor label="OFFICIAL Kp" sub={L.kpOfficial?.time ? `3-hour, from ${L.kpOfficial.time.slice(11, 16)} UTC` : 'NOAA 3-hour Kp'} value={fmt(kpOff, 2)} raw={kpOff} gauge={Number.isFinite(kpOff) ? kpOff / 9 : null} live={live} />
      <Row icon="☄" label="SOLAR WIND SPEED" sub={C.solarWindSpeed?.label ? `${C.solarWindSpeed.label} (descriptive)` : 'NOAA propagated'} value={fmt(wind.speed, 0)} raw={wind.speed} unit=" km/s" live={live} />
      <Row icon="n" label="SOLAR WIND DENSITY" minor sub="Propagated solar wind" value={fmt(wind.density, 2)} raw={wind.density} unit=" p/cm³" live={live} />
      <Row icon="T" label="SOLAR WIND TEMP." minor sub="Propagated solar wind" value={fmtTemp(wind.temperature)} raw={wind.temperature} live={live} />
      <Row icon="Bz" label="IMF Bz (GSM)" sub={C.bz?.label ? `${C.bz.label} (descriptive)` : 'Propagated solar wind'} value={signed(wind.bz, 1)} raw={wind.bz} unit=" nT" hot={Number(wind.bz) <= -5} live={live} />
    </HudPanel>
  );
}
