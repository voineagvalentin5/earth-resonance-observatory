# Readings history snapshots

Written by the scheduled Pages workflow (`scripts/append-history.mjs`).

Each `*.json` file holds real NOAA SWPC samples, packed as `[unix_seconds, value]`, deduplicated by timestamp and capped at 90 days. Points older than 8 days may be thinned to at most one real sample per 15 minutes. Empty time bins are left empty; this folder is never back-filled with invented points.

`meta.json` records the span and per-metric counts. The dashboard also reloads previously published files from the live site so a missed git commit does not reset the archive.
