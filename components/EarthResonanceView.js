import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import HudPanel from './HudPanel';
import LiveValue, { LiveDot } from './LiveValue';
import { useStore } from '../stores/useStore';
import { fmt, signed, fmtTemp } from '../lib/format';

const Globe = dynamic(() => import('./Globe'), { ssr: false });

export default function EarthResonanceView() {
  const { payload } = useStore();
  const refs = payload?.schumann?.referenceHz || [7.83, 14.3, 20.8, 27.3, 33.8];
  const labels = payload?.schumann?.referenceLabels || ['Fund.', '2nd', '3rd', '4th', '5th'];
  const wind = payload?.latest?.solarWind || {};
  const kp = payload?.latest?.kpEstimated?.value ?? payload?.latest?.kpOfficial?.value;
  const aurora = payload?.latest?.aurora;
  const [ready, setReady] = useState(false);
  const live = !!payload;

  return (
    <HudPanel id="2" title="3D EARTH RESONANCE VIEW" className="earth-panel">
      <div className="space-field">
        <div className={`globe-wrap ${ready ? 'ready' : ''}`}>
          <Globe onReady={() => setReady(true)} />
        </div>
        <div className="cavity-label">
          <span>Schumann Cavity</span>
          <b>Reference only · not live</b>
        </div>

        <div className="floating-card lightning off">
          <b>Lightning Activity</b>
          <small>Global rate</small>
          <strong>No live feed</strong>
        </div>
        <div className="floating-card auroral">
          <b>Auroral Activity <LiveDot on={live} /></b>
          <strong><LiveValue value={kp}>Kp {fmt(kp, 2)}</LiveValue></strong>
          {aurora ? <small title={aurora.note || ''}>OVATION peak {fmt(aurora.maxIntensity, 0)}</small> : <small>NOAA Kp nowcast</small>}
          <div className="kp-meter" title="Kp 0–9"><i style={{ width: `${Math.min(100, Math.max(0, ((Number(kp) || 0) / 9) * 100))}%` }} /></div>
          <small className="meter-ends"><span>Kp 0</span><span>9</span></small>
        </div>
        <div className="floating-card solar">
          <b>Solar Wind <LiveDot on={live} /></b>
          <strong><LiveValue value={wind.speed}>{fmt(wind.speed, 0)}<span className="u"> km/s</span></LiveValue></strong>
          <small>Density {fmt(wind.density, 2)} p/cm³</small>
          <small>Temp {fmtTemp(wind.temperature)}</small>
        </div>
        <div className="floating-card geomag">
          <b>Geomagnetic Field <LiveDot on={live} /></b>
          <strong><LiveValue value={wind.bz}>Bz {signed(wind.bz, 1, 'nT')}</LiveValue></strong>
          {wind.bt != null ? <small>|B| {fmt(wind.bt, 1)} nT (IMF)</small> : null}
        </div>
        <div className="resonance-mode">
          <b>Resonance modes, Hz</b>
          <small>Textbook · not live</small>
          {refs.map((hz, i) => (
            <p key={hz} title={labels[i] || ''}><span className={`dot d${i}`}></span>{hz.toFixed(2)}</p>
          ))}
        </div>
        <p className="globe-credit">NASA Blue Marble + night lights · day/night from computed sun position · not a live image</p>
      </div>
    </HudPanel>
  );
}
