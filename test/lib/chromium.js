// find a chromium to drive. playwright-core doesn't download one, so look where a browser is
// likely to already be: an explicit env var, a playwright install, then the usual system paths.
const fs = require('fs');
const path = require('path');

const CANDIDATES = [
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable', '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

// a playwright browsers directory holds chromium-<rev>/chrome-linux/chrome and friends
function fromBrowsersDir(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir).filter(n => n.startsWith('chromium')).sort().reverse();
  for (const name of entries) {
    for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      'chrome-win/chrome.exe', 'chrome-linux/headless_shell']) {
      const p = path.join(dir, name, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function find() {
  if (process.env.RESCOPE_CHROMIUM) return process.env.RESCOPE_CHROMIUM;
  const dirs = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(require('os').homedir(), '.cache/ms-playwright')];
  for (const d of dirs) { const p = fromBrowsersDir(d); if (p) return p; }
  for (const p of CANDIDATES) if (fs.existsSync(p)) return p;
  return null;
}

async function launch() {
  let chromium;
  try { ({chromium} = require('playwright-core')); }
  catch (e) { return {error: 'playwright-core is not installed ( npm i )'}; }
  const executablePath = find();
  if (!executablePath) return {error: 'no chromium found. set RESCOPE_CHROMIUM=/path/to/chrome'};
  return {browser: await chromium.launch({executablePath}), executablePath};
}

module.exports = {launch, find};
