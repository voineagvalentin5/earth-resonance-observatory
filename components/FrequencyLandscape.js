import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import HudPanel from './HudPanel';
import { useStore } from '../stores/useStore';
import { sampleSpectrogram, referenceModel } from '../lib/spectrogram';

const Spectrogram3D = dynamic(() => import('./Spectrogram3D'), { ssr: false });

export default function FrequencyLandscape() {
  const { payload } = useStore();
  const refs = useMemo(() => payload?.schumann?.referenceHz || [7.83, 14.3, 20.8, 27.3, 33.8], [payload?.schumann?.referenceHz?.join(',')]);
  const labels = useMemo(() => payload?.schumann?.referenceLabels || ['Fund.', '2nd', '3rd', '4th', '5th'], [payload?.schumann?.referenceLabels?.join(',')]);
  const spec = payload?.schumann?.spectrogram;
  const [view, setView] = useState('3d');
  const [grid, setGrid] = useState(null);
  const [state, setState] = useState('loading'); // loading | image | model
  // Re-sample at most every 10 minutes; the source image updates slowly.
  const [bucket, setBucket] = useState(() => Math.floor(Date.now() / 600000));
  useEffect(() => {
    const id = setInterval(() => setBucket(Math.floor(Date.now() / 600000)), 60000);
    return () => clearInterval(id);
  }, []);
  // Static site: the image is a same-origin snapshot written by a scheduled
  // GitHub Action, with a small JSON file saying when (and whether) it was fetched.
  const metaUrl = spec?.snapshotMetaUrl || null;
  const [meta, setMeta] = useState(metaUrl ? null : { ok: true });
  useEffect(() => {
    if (!metaUrl) { setMeta({ ok: true }); return undefined; }
    let alive = true;
    fetch(`${metaUrl}?b=${bucket}`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : { ok: false }))
      .then((m) => { if (alive) setMeta(m && typeof m === 'object' ? m : { ok: false }); })
      .catch(() => { if (alive) setMeta({ ok: false }); });
    return () => { alive = false; };
  }, [metaUrl, bucket]);
  const feedDown = !!meta && meta.ok === false;
  const src = spec?.proxyUrl && meta && !feedDown ? `${spec.proxyUrl}?b=${bucket}` : null;
  const fetchedLabel = meta?.fetchedAt ? fmtUtc(meta.fetchedAt) : null;

  useEffect(() => {
    if (!payload) return undefined;
    if (metaUrl && !meta) return undefined;
    if (!src) { setGrid(referenceModel(refs)); setState('model'); return undefined; }
    let alive = true;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (!alive) return;
      try {
        const g = sampleSpectrogram(img);
        if (g.ok) { setGrid(g); setState('image'); } else { setGrid(referenceModel(refs)); setState('model'); }
      } catch (e) { setGrid(referenceModel(refs)); setState('model'); }
    };
    img.onerror = () => { if (alive) { setGrid(referenceModel(refs)); setState('model'); } };
    img.src = src;
    return () => { alive = false; };
  }, [src, !!payload, refs, metaUrl, !!meta]);

  const timeLabels = useMemo(() => (state === 'image' ? ['older', 'newest'] : null), [state]);

  return (
    <HudPanel id="3" title="FREQUENCY LANDSCAPE (3D)" className="landscape-panel">
      <div className="panel-tools">
        <div className="seg small">
          <button className={view === '3d' ? 'active' : ''} onClick={() => setView('3d')}>3D surface</button>
          <button className={view === 'img' ? 'active' : ''} onClick={() => setView('img')}>Source image</button>
        </div>
      </div>
      <div className="landscape-body">
        {view === '3d' ? (
          grid ? <Spectrogram3D data={grid} refs={refs} timeLabels={timeLabels} /> : <div className="spec-loading">Loading SOS-70 spectrogram…</div>
        ) : src ? (
          <img className="spec-img" src={src} alt="Latest public Schumann spectrogram from SOS-70, Tomsk State University" />
        ) : <div className="spec-loading">{feedDown ? 'Tomsk feed unavailable.' : 'Spectrogram unavailable.'}</div>}
        {view === '3d' && grid ? (
          <div className="spec-key" aria-hidden="true">
            <span>low</span><i /><span>high</span>
            <em>{state === 'model' ? 'model shape only' : 'relative intensity (image colour bar)'}</em>
          </div>
        ) : null}
        {view === '3d' && grid ? <span className="orbit-hint">drag to orbit · double-click to reset</span> : null}
      </div>
      <p className={`spec-badge ${state === 'model' ? 'warn' : ''}`} title={`Source: ${spec?.credit || 'Space Observing System (SOS-70), Tomsk State University'} · ${spec?.pageUrl || 'https://sos70.ru/'} · image only, no numeric API`}>
        {view === '3d' && state === 'image' && <><b>Relative intensity, not calibrated dB</b> · derived from the SOS-70 Tomsk spectrogram image (0–40 Hz, about 3 days){fetchedLabel ? <> · image fetched {fetchedLabel}</> : null} · dashed lines = textbook harmonics, reference only</>}
        {view === '3d' && state === 'model' && <>{feedDown ? <><b>Tomsk feed unavailable</b> · </> : null}<b>Reference model, not live</b> · textbook harmonics only, no measured amplitude</>}
        {view === '3d' && state === 'loading' && <>Loading SOS-70 spectrogram…</>}
        {view === 'img' && (feedDown
          ? <><b>Tomsk feed unavailable</b> · the last scheduled fetch of the SOS-70 image failed</>
          : <>SOS-70 spectrogram as published (0–40 Hz, about 3 days){fetchedLabel ? <> · fetched {fetchedLabel}</> : null} · image only, no numeric API</>)}
        {' '}· Source: SOS-70, Tomsk State University (sos70.ru)
      </p>
    </HudPanel>
  );
}

function fmtUtc(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}
