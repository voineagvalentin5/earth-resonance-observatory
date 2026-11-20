import React from 'react';
import Head from 'next/head';
import Header from '../components/Header';
import PlanetStatusSidebar from '../components/PlanetStatusSidebar';
import EarthResonanceView from '../components/EarthResonanceView';
import FrequencyLandscape from '../components/FrequencyLandscape';
import TimeAxisControl, { PatternDetection, ContextData, PatternSummary, EventTimeline } from '../components/TimeAxisControl';
import { useStore } from '../stores/useStore';
import { formatUtc, formatDetroit } from '../lib/time';

export default function Home() {
  const { payload, fetchedAt, status, error } = useStore();
  const dataTime = payload?.dataTime || fetchedAt;
  return (
    <>
      <Head>
        <title>Earth Resonance Observatory</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="observatory-shell">
        <Header />
        <div className="observatory-grid">
          <PlanetStatusSidebar />
          <EarthResonanceView />
          <TimeAxisControl />
          <FrequencyLandscape />
          <PatternSummary />
          <PatternDetection />
          <ContextData />
          <EventTimeline />
        </div>
        <footer className="dashboard-footer">
          <span className="fh">DATA SOURCES</span>
          <b className="src-live">NOAA SWPC: Kp, solar wind, GOES X-ray / protons / electrons, OVATION (live)</b>
          <b className="src-off">Schumann: SOS-70 Tomsk spectrogram (image only)</b>
          <b className="src-off">Lightning: no live feed</b>
          <b className="src-off">Globe: NASA imagery (decorative)</b>
          <em>Poll: 60 s</em>
          <em>Last data {formatUtc(dataTime, { seconds: false }).replace(/ \d{4} /, ' ')} · {formatDetroit(dataTime, { seconds: false }).replace(/, \d{4},/, ',')}</em>
          <em className={`feed-pill ${status}`}>{status === 'live' ? 'Feeds OK' : status === 'stale' ? 'Stale' : status === 'loading' ? 'Loading' : 'Error'}{error ? ` — ${error}` : ''}{payload?.feedStatus ? ` (${payload.feedStatus.ok}/${payload.feedStatus.total})` : ''}</em>
        </footer>
      </main>
    </>
  );
}
