import { useEffect } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import '../styles/globals.css';
import '../styles/chl-breadcrumb.css';
import Breadcrumb from '../components/Breadcrumb';
import { startLivePolling } from '../stores/useStore';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap', weight: ['400', '500', '600'] });

export default function App({ Component, pageProps }) {
  useEffect(() => startLivePolling(60_000), []);
  return (
    <div className={`${inter.variable} ${mono.variable} app-root`}>
      <Breadcrumb />
      <Component {...pageProps} />
    </div>
  );
}
