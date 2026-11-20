#!/usr/bin/env node
/**
 * Merge the longest public NOAA SWPC windows into public/data/history/*.json.
 * Real samples only; deduped by timestamp; capped and optionally thinned.
 *
 * Run from the repo root:
 *   node scripts/append-history.mjs
 *
 * Persistence: this script writes the folder used by the static export. The
 * Pages workflow also tries to reload the previously published files (so a
 * missed git commit does not reset the archive) and commits the folder back
 * at most every 6 hours. GitHub disables scheduled workflows after 60 days
 * of repository inactivity; a gap like that stays a gap.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  METRICS, ARCHIVE_BASES, fetchLiveWindows, loadArchiveFiles,
  unpackPoints, emptySeries, buildArchive, filesFromArchive,
} from '../lib/history.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'data', 'history');

async function loadLocal() {
  try {
    const meta = JSON.parse(await readFile(join(outDir, 'meta.json'), 'utf8'));
    const series = emptySeries();
    for (const m of METRICS) {
      try {
        const body = JSON.parse(await readFile(join(outDir, m.file), 'utf8'));
        series[m.id] = unpackPoints(body.points);
      } catch { /* missing file is fine */ }
    }
    return { ok: true, meta, series, base: 'local' };
  } catch {
    return { ok: false, meta: null, series: emptySeries(), base: null };
  }
}

function longer(a, b) {
  const n = (s) => Object.values(s || {}).reduce((acc, p) => acc + (p?.length || 0), 0);
  return n(a) >= n(b) ? a : b;
}

async function main() {
  const local = await loadLocal();
  const remote = await loadArchiveFiles(ARCHIVE_BASES.filter(Boolean));
  const existing = emptySeries();
  METRICS.forEach((m) => {
    existing[m.id] = longer(local.series[m.id], remote.series[m.id]);
  });
  const live = await fetchLiveWindows({ short: false });
  const failed = (live.sources || []).filter((s) => !s.ok);
  if (failed.length) {
    console.warn('Some NOAA feeds failed:', failed.map((s) => `${s.key}: ${s.error}`).join('; '));
  }
  const archive = buildArchive(existing, live.series);
  await mkdir(outDir, { recursive: true });
  const files = filesFromArchive(archive);
  let bytes = 0;
  for (const [name, body] of Object.entries(files)) {
    const path = join(outDir, name);
    await writeFile(path, body);
    bytes += Buffer.byteLength(body);
  }
  const span = archive.meta.span;
  console.log(JSON.stringify({
    ok: true,
    updatedAt: archive.meta.updatedAt,
    span,
    bytes,
    metrics: archive.meta.metrics,
    fromLocal: local.ok,
    fromRemote: remote.ok ? remote.base : null,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
