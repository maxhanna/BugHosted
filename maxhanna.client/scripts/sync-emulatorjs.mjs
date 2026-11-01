#!/usr/bin/env node
/**
 * Sync the EmulatorJS nightly build into src/assets/emulatorjs/data so the app
 * serves the runtime and cores from our own server instead of the CDN.
 *
 * Usage:
 *   node scripts/sync-emulatorjs.mjs                # runtime only
 *   node scripts/sync-emulatorjs.mjs ppsspp          # runtime + one core
 *   node scripts/sync-emulatorjs.mjs ppsspp mednafen_psx_hw
 *   node scripts/sync-emulatorjs.mjs --cores=all     # runtime + every core on the CDN
 *
 * Environment:
 *   EJS_SOURCE  base URL to sync from (default: the nightly build)
 *
 * What it writes:
 *   data/loader.js, data/emulator.min.js, data/emulator.min.css, data/emulator.css, data/version.json
 *   data/cores/<core>-*.data, data/cores/<core>-assets.zip, data/cores/reports/<core>.json
 *   data/.ejs-sync.json  (etag/last-modified of what was pulled, for cheap re-runs)
 *
 * Files are skipped when the CDN's ETag still matches what we last wrote and the
 * local size is unchanged, so re-running after an upstream nightly build only
 * downloads what actually changed.
 */
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, '../src/assets/emulatorjs/data');
const SOURCE = (process.env.EJS_SOURCE || 'https://cdn.emulatorjs.org/nightly/data/').replace(/\/?$/, '/');
const MANIFEST = path.join(DATA_DIR, '.ejs-sync.json');

// Files the loader/runtime needs. `src/` is only used when emulator.min.js is
// missing, so it is not synced.
const RUNTIME_FILES = [
  'loader.js',
  'emulator.min.js',
  'emulator.min.css',
  'emulator.css',
  'version.json',
];

// Leftovers from earlier (mismatched) installs. `data/emulator.js` imports
// ./cache.js, ./consts.js, ... which do not exist next to it, so it can only
// ever fail; the real sources live in data/src/.
const STALE_FILES = ['emulator.js', 'emulator.min.js.map'];

const args = process.argv.slice(2);
const allCores = args.includes('--cores=all');
const cores = args.filter(a => !a.startsWith('--'));

let manifest = {};
try {
  manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
} catch { /* first run */ }

async function retry(fn, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < attempts) await new Promise(r => setTimeout(r, 800 * i));
    }
  }
  throw lastError;
}

async function listCdn(dir) {
  const res = await retry(() => fetch(SOURCE + dir, { headers: { accept: 'text/html' } }));
  if (!res.ok) throw new Error(`Cannot list ${SOURCE}${dir}: HTTP ${res.status}`);
  const html = await res.text();
  const entries = new Set();
  for (const m of html.matchAll(/<a href="([^"]+)">/g)) entries.add(m[1]);
  return entries;
}

function fmt(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

async function localSize(rel) {
  try {
    return (await stat(path.join(DATA_DIR, rel))).size;
  } catch {
    return -1;
  }
}

async function download(rel) {
  // HEAD, not the directory listing: the listing is CDN-cached and can report
  // the size of the previous build. Cloudflare strips Content-Length from HEAD,
  // so compare against the stored ETag instead.
  const head = await retry(() => fetch(SOURCE + rel, { method: 'HEAD' }));
  if (!head.ok) throw new Error(`HTTP ${head.status} for ${SOURCE}${rel}`);
  const etag = head.headers.get('etag');
  const lastModified = head.headers.get('last-modified');
  const have = await localSize(rel);
  const seen = manifest[rel];
  // Some objects (the big cores) come back without an ETag, so fall back to
  // Last-Modified as the version stamp.
  const stamp = etag ?? lastModified;
  const seenStamp = seen ? (seen.etag ?? seen.lastModified) : null;

  if (seen && have === seen.size && stamp && seenStamp === stamp) {
    console.log(`  = ${rel} (${fmt(have)}) already current`);
    return false;
  }

  const res = await retry(() => fetch(SOURCE + rel));
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${SOURCE}${rel}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(path.join(DATA_DIR, rel)), { recursive: true });
  await writeFile(path.join(DATA_DIR, rel), buf);
  manifest[rel] = { size: buf.length, etag, lastModified };
  console.log(`  ↓ ${rel} (${fmt(buf.length)}${have >= 0 ? `, was ${fmt(have)}` : ''})`);
  return true;
}

async function pruneStale() {
  for (const rel of STALE_FILES) {
    try {
      await unlink(path.join(DATA_DIR, rel));
      delete manifest[rel];
      console.log(`  ✗ removed stale ${rel}`);
    } catch { /* not there */ }
  }
}

(async () => {
  console.log(`Syncing EmulatorJS from ${SOURCE}\n→ ${DATA_DIR}\n`);

  console.log('Runtime:');
  const root = await listCdn('');
  for (const file of RUNTIME_FILES) {
    if (!root.has(file)) {
      console.warn(`  ! ${file} is not published upstream (skipped)`);
      continue;
    }
    await download(file);
  }
  await pruneStale();

  const coreIndex = await listCdn('cores/');
  let coreNames = cores;
  if (allCores) {
    coreNames = [...new Set([...coreIndex]
      .filter(f => f.endsWith('-wasm.data'))
      .map(f => f.replace(/-(thread-)?(legacy-)?wasm\.data$/, '')))];
  }

  if (!coreNames.length) {
    console.log('\nNo cores requested — pass core names (e.g. `ppsspp`) or --cores=all.');
  } else {
    console.log('\nCores:');
    for (const core of coreNames) {
      // `<core>-thread-wasm.data`, `<core>-wasm.data`, `<core>-*-legacy-wasm.data`
      // and `<core>-assets.zip` (PPSSPP needs its assets zip next to the core).
      const files = [...coreIndex].filter(f =>
        f.startsWith(`${core}-`) && (f.endsWith('-wasm.data') || f.endsWith('-assets.zip')));
      if (!files.length) {
        console.warn(`  ! no published core files for "${core}" (check the name)`);
        continue;
      }
      console.log(` ${core}:`);
      for (const file of files) await download(`cores/${file}`);
      // The runtime reads cores/reports/<core>.json for the build signature it
      // appends to the core URL, so it has to be present next to the cores.
      try {
        await download(`cores/reports/${core}.json`);
      } catch (e) {
        console.warn(`  ! no build report for "${core}" (${e.message})`);
      }
    }
  }

  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('\nDone. `ng build` copies src/assets into dist, so the app now serves this locally.');
})().catch(err => {
  console.error('\nSync failed:', err.message);
  process.exit(1);
});
