import React, { useEffect, useState } from 'react';
import { useStore } from '../stores/useStore';
import { formatUtc, formatDetroit } from '../lib/time';
import { fmt } from '../lib/format';

export default function Header() {
  const { payload, status, fetchedAt } = useStore();
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const g = payload?.classification?.gScale;
  const kp = payload?.latest?.kpEstimated?.value;
  const dataTime = payload?.dataTime || fetchedAt;
  const live = status === 'live';
  const feeds = Object.entries(payload?.feeds || {});

  return (
    <header className="dashboard-header">
      <div className="brand-block">
        <h1 className="sr-only">Earth Resonance Observatory</h1>
        <picture>
          <source type="image/webp" srcSet="/brand/ero-wordmark.webp 2x" />
          <img className="brand-wordmark" src="/brand/ero-wordmark.png" width="678" height="198" alt="" />
        </picture>
        <p>NOAA space-weather monitor · Schumann values are reference only</p>
      </div>
      <div className={`live-block ${live ? 'is-live' : 'is-off'}`}>
        <span className="pulse" />
        <b>{live ? 'LIVE' : status === 'loading' ? 'LOADING' : status === 'stale' ? 'STALE' : 'OFFLINE'}</b>
      </div>
      <div className="clock-block">
        <strong>{now ? now.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour12: false }) : '--:--:--'} <small>UTC</small></strong>
        <small className="clock-et">{now ? formatDetroit(now, { seconds: false }) : 'America/Detroit'}</small>
      </div>
      <div className="chip quality-block">
        <small>NOAA FEEDS</small>
        <b>{payload?.feedStatus ? `${payload.feedStatus.ok}/${payload.feedStatus.total}` : '—'}</b>
        <div className="feed-bars">
          {feeds.map(([key, feed]) => (
            <i key={key} className={feed.ok ? 'ok' : 'bad'} title={`${key}: ${feed.ok ? 'ok' : feed.error || 'failed'}`} />
          ))}
        </div>
      </div>
      <div className={`chip g-chip ${g?.storm ? 'storm' : 'quiet'}`} title={g?.name || ''}>
        <small>NOAA G-SCALE</small>
        <b>{g?.scale || '—'}</b>
        <em>{g?.storm ? (g?.name || '') : 'No storm'}</em>
      </div>
      <div className="kp-key">
        <div className="kp-bar"><i style={{ left: `${Math.min(100, Math.max(0, ((Number(kp) || 0) / 9) * 100))}%` }} title={`Estimated Kp ${fmt(kp, 2)}`} /></div>
        <p><span>Kp 0</span><span>G1 · 5</span><span>9</span></p>
        <small>Last data {dataTime ? formatUtc(dataTime, { seconds: false }).replace(/ \d{4} /, ' ') : '—'}</small>
      </div>
    </header>
  );
}
