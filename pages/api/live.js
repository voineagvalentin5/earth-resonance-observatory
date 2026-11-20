import { buildLivePayload } from '../../lib/swpc';

export const config = {
  api: {
    responseLimit: '2mb',
  },
};

let cache = { payload: null, fetchedAt: 0, inflight: null };
const TTL_MS = 30_000;

async function getPayload() {
  const now = Date.now();
  if (cache.payload && now - cache.fetchedAt < TTL_MS) {
    return cache.payload;
  }
  if (cache.inflight) return cache.inflight;
  cache.inflight = buildLivePayload()
    .then((payload) => {
      cache = { payload, fetchedAt: Date.now(), inflight: null };
      return payload;
    })
    .catch((err) => {
      cache.inflight = null;
      throw err;
    });
  return cache.inflight;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const payload = await getPayload();
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30, stale-while-revalidate=60');
    res.status(200).json(payload);
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({
      error: 'Failed to assemble NOAA live payload',
      detail: err.message || String(err),
    });
  }
}
