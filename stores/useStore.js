import { create } from 'zustand';
import { buildLivePayload, STATIC_SITE } from '../lib/swpc';

const EMPTY = {
  status: 'idle',
  error: null,
  payload: null,
  fetchedAt: null,
  timeMode: 'normal',
  timeScale: '24 Hours',
};

export const useStore = create((set, get) => ({
  ...EMPTY,
  toggleTimeMode: () => set((s) => ({ timeMode: s.timeMode === 'normal' ? 'fractal' : 'normal' })),
  setTimeMode: (timeMode) => set({ timeMode }),
  setTimeScale: (timeScale) => set({ timeScale }),
  fetchLive: async () => {
    if (get().status === 'loading' && !get().payload) {
      // keep first load spinner; still allow later refreshes
    }
    const isFirst = !get().payload;
    if (isFirst) set({ status: 'loading', error: null });
    try {
      let payload;
      if (STATIC_SITE) {
        // Static hosting: the browser fetches NOAA SWPC directly (CORS: *).
        payload = await buildLivePayload();
        if (!payload?.feedStatus?.ok) throw new Error('No NOAA feeds reachable');
      } else {
        const res = await fetch('/api/live', { cache: 'no-store' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || body.error || `HTTP ${res.status}`);
        }
        payload = await res.json();
      }
      set({ status: 'live', error: null, payload, fetchedAt: new Date().toISOString() });
      return payload;
    } catch (err) {
      set({
        status: get().payload ? 'stale' : 'error',
        error: err.message || String(err),
      });
      return null;
    }
  },
}));

export function startLivePolling(intervalMs = 60_000) {
  const tick = () => useStore.getState().fetchLive();
  tick();
  const id = setInterval(tick, intervalMs);
  return () => clearInterval(id);
}
