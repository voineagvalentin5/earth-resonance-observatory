# Earth Resonance Observatory

A Next.js dashboard for public NOAA space-weather data and the public SOS-70 (Tomsk) Schumann spectrogram, published at https://ero.codex-hive.com as a static GitHub Pages site. Anything that is not a live measurement is labelled as such on screen.

## What is live

Polled every 60 seconds. On the public static site the browser fetches public NOAA SWPC JSON directly (no API key; NOAA sends `Access-Control-Allow-Origin: *`); the larger files (propagated solar wind, X-ray flux, protons, OVATION) are re-downloaded every 5 minutes. When run as a Next.js server, `/api/live` does the same work server-side with a 30 s cache. Values on screen use the timestamps that arrive with the data, shown in UTC and America/Detroit.

| Quantity | Source (verified 20 Nov 2026) |
| --- | --- |
| Official 3-hour planetary Kp | `https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json` |
| Estimated 1-minute Kp | `https://services.swpc.noaa.gov/json/planetary_k_index_1m.json` |
| Solar wind speed, density, temperature, IMF B / Bz | `https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind.json` (about 7 days) |
| Solar wind speed / IMF summaries (cross-check) | `https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json` and `solar-wind-mag-field.json` |
| GOES X-ray flux (0.1–0.8 nm, flare channel) | `https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json` |
| GOES integral protons ≥10 MeV | `https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json` |
| GOES integral electrons ≥2 MeV | `https://services.swpc.noaa.gov/json/goes/primary/integral-electrons-1-day.json` |
| GOES X-ray flares, 7 day + latest | `https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json` and `xray-flares-latest.json` |
| OVATION aurora forecast (peak grid value only) | `https://services.swpc.noaa.gov/json/ovation_aurora_latest.json` |

The older paths ` /products/solar-wind/plasma-1-day.json` and `mag-1-day.json` now return HTTP 404, so they are not used. Minute-resolution RTSW files under `/json/rtsw/` exist but are 1.6–2.8 MB each; the dashboard uses the propagated solar-wind product instead so the proxy stays small.

The Tomsk JPEG has no CORS header (and is served as `text/html`), so the browser cannot read its pixels directly. On the static site, the GitHub Actions workflow `.github/workflows/pages.yml` fetches it on a schedule (about every 30 minutes), publishes it same-origin as `/data/shm.jpg`, and writes `/data/shm-meta.json` with the fetch time. The panel shows that fetch time. If the fetch fails, the panel says "Tomsk feed unavailable" and shows the labelled reference model instead.

Classifications shown on the status card:

- **G-scale** from NOAA’s planetary Kp (nowcast when available).
- **S-scale** from GOES ≥10 MeV proton flux, official NOAA thresholds.
- **X-ray class** from the 0.1–0.8 nm flux.
- Solar-wind speed and IMF Bz wording are *descriptive* bands only and are labeled as such. They are not official NOAA named scales.

## What is not live

- **Schumann resonance.** There is no public numeric API. The dashboard shows textbook harmonic frequencies — 7.83, 14.3, 20.8, 27.3, and 33.8 Hz — marked “Reference values, not live,” with no invented dB or power. The latest public spectrogram from the Space Observing System (SOS-70) at Tomsk State University is shown from `https://sos70.ru/provider.php?file=shm.jpg` (a scheduled snapshot on the static site; `/api/schumann-spectrogram` when run as a server). Credit that source. The older `https://sosrff.tsu.ru/new/shm.jpg` file stopped updating on 1 September 2025 and is not used.
- **Global lightning rate.** WWLLN and Blitzortung do not offer a free public numeric API. The lightning panel reads “No live feed.”
- **Events.** The status panel is computed from the live NOAA values above. The event table and timeline show real GOES X-ray flares from the last seven days. There are no Schumann "spike events" or confidence scores.

## Visual layer

- **Frequency Landscape (3D).** The SOS-70 JPEG (same-origin snapshot or server proxy) is sampled in the browser (`lib/spectrogram.js`): each pixel is matched to the nearest colour on the image's own colour bar, then median-binned into an 80 × 160 frequency × time grid (0–40 Hz, the image's full time span). The surface (`components/Spectrogram3D.js`, three.js) shows that **relative intensity, not calibrated dB**, and the panel says so. If the image fails or the colour match is poor, the panel switches to a clearly labelled "Reference model, not live" surface built only from the textbook harmonics. A "Source image" toggle shows the original spectrogram. Plot-area and colour-bar positions were measured on the 1540 × 460 image of 20 Nov 2026; if SOS-70 changes the layout, re-measure them.
- **Globe.** `components/Globe.js` renders NASA Blue Marble and night-lights textures (public domain, saved under `public/textures/`, see `SOURCES.md`) with the day/night line computed from the current sun position (`lib/sun.js`). It is a decorative base map, not a live image, and is labelled that way. No aurora oval is drawn, because only the OVATION peak value is fetched, not the grid.
- Live values pulse briefly when a new poll changes them; non-live items stay grey and labelled.

## Fractal Time

The Fractal Time toggle is a **display transform only**. In that mode, sparkline x-positions are remapped with `u = t^(1/e)`, where `t` is seconds from the start of the selected window. The dashboard does not claim that this reveals hidden structure or any scientific finding.

## Run locally

```bash
npm install
npm run build
npx next start -p 3000
```

## Static build (GitHub Pages)

```bash
rm -rf pages/api          # API routes are not part of a static export
STATIC_EXPORT=1 npm run build   # writes ./out
```

The Pages workflow does this on every push to `main`, on demand, and every 30 minutes (to refresh the Tomsk snapshot). The custom domain is set by `public/CNAME`.

## Project layout

- `lib/swpc.js` — NOAA fetch, parse, downsample, and classification
- `lib/classify.js` — G-scale, S-scale, X-ray class, descriptive wind/Bz labels
- `lib/time.js` — UTC / America/Detroit stamps and the fractal display transform
- `pages/api/live.js` — cached live payload when run as a server (30 s cache)
- `pages/api/schumann-spectrogram.js` — Tomsk JPEG proxy when run as a server
- `.github/workflows/pages.yml` — static build, Tomsk snapshot, and Pages deploy
- `stores/useStore.js` — Zustand store; no synthetic series
