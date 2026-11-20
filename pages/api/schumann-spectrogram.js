const SOURCE_URL = 'https://sos70.ru/provider.php?file=shm.jpg';
const USER_AGENT = 'EarthResonanceObservatory/1.0 (local research dashboard; public Tomsk spectrogram)';

let cache = { body: null, fetchedAt: 0, inflight: null, lastModified: null };
const TTL_MS = 60_000;

async function loadImage() {
  const now = Date.now();
  if (cache.body && now - cache.fetchedAt < TTL_MS) return cache;
  if (cache.inflight) return cache.inflight;
  cache.inflight = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(SOURCE_URL, {
        signal: ctrl.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/jpeg,image/*,*/*' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${SOURCE_URL}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 10 || buf[0] !== 0xff || buf[1] !== 0xd8) {
        throw new Error('SOS-70 response was not a JPEG spectrogram');
      }
      cache = {
        body: buf,
        fetchedAt: Date.now(),
        inflight: null,
        lastModified: res.headers.get('last-modified'),
      };
      return cache;
    } finally {
      clearTimeout(timer);
    }
  })().catch((err) => {
    cache.inflight = null;
    throw err;
  });
  return cache.inflight;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method not allowed');
  }
  try {
    const image = await loadImage();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.setHeader('X-Source-URL', SOURCE_URL);
    res.setHeader('X-Credit', 'Space Observing System (SOS-70), Tomsk State University');
    if (image.lastModified) res.setHeader('X-Upstream-Last-Modified', image.lastModified);
    res.status(200).send(image.body);
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({
      error: 'Failed to load Tomsk Schumann spectrogram',
      detail: err.message || String(err),
      source: SOURCE_URL,
    });
  }
}
