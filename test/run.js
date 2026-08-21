#!/usr/bin/env node
// regression suite for rescope. runs against dist/, so `./build` first.
//
//   node test/run.js              everything
//   node test/run.js --node       the jsdom half only
//   node test/run.js --browser    the browser half only
//
// the browser half needs a chromium. it looks for one in PLAYWRIGHT_BROWSERS_PATH, in
// ~/.cache/ms-playwright and in the usual system locations; RESCOPE_CHROMIUM=/path/to/chrome
// overrides. without one it skips rather than fails, so `npm test` still means something on a
// machine with no browser installed.
const fs = require('fs');
const path = require('path');
const {missing} = require('./lib/libs');
const {summary, group, ok} = require('./lib/report');

async function main() {
  const args = process.argv.slice(2);
  const only = args.find(a => a === '--node' || a === '--browser');

  group('preflight');
  const dist = path.join(__dirname, '..', 'dist', 'index.js');
  if (!ok(fs.existsSync(dist) || 'run ./build first', 'dist is built')) return process.exit(1);
  const gone = missing();
  if (!ok(gone.length === 0 || `missing ${gone.join(', ')} - run npm i`, 'test libraries are installed'))
    return process.exit(1);

  if (only !== '--browser') await require('./node').run();
  if (only !== '--node') await require('./browser').run();

  process.exit(summary() ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
