import React from 'react';
import Head from 'next/head';
import Header from '../components/Header';
import PlanetStatusSidebar from '../components/PlanetStatusSidebar';
import EarthResonanceView from '../components/EarthResonanceView';
import FrequencyLandscape from '../components/FrequencyLandscape';
import ReadingsHistory from '../components/ReadingsHistory';
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
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="description" content="Live NOAA space-weather monitor and the SOS-70 Tomsk Schumann spectrogram. Official 3-hour Kp, solar wind, and GOES flux; Schumann values are reference only." />
        <meta property="og:title" content="Earth Resonance Observatory" />
        <meta property="og:description" content="Live NOAA space-weather monitor and the SOS-70 Tomsk Schumann spectrogram." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://ero.codex-hive.com/" />
        <meta property="og:image" content="https://ero.codex-hive.com/og-image.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Earth Resonance Observatory" />
        <meta name="twitter:image" content="https://ero.codex-hive.com/og-image.jpg" />
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
        <ReadingsHistory />
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
