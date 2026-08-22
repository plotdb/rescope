// the browser half of the suite. everything here runs against dist/, so build before running.
const {serve} = require('./lib/serve');
const {launch} = require('./lib/chromium');
const {has} = require('./lib/libs');
const {group, ok, eq, skip, note} = require('./lib/report');

const LIBS = ['marked', 'd3', 'jszip', 'lodash', 'moment', 'vue'];
const TIMEOUT = 60000;

// every library has to both export something and still work afterwards
function checkLibs(result, label) {
  for (const name of LIBS) {
    const r = result.libs[name];
    if (r.error) { ok(r.error, `${label}: ${name}`); continue; }
    if (r.works !== true) { ok(String(r.works), `${label}: ${name}`); continue; }
    ok(r.exports.length > 0 || 'exported nothing', `${label}: ${name}`, `[${r.exports.join(',')}]`);
  }
}

async function call(page, fn, ...args) {
  return Promise.race([
    page.evaluate(([f, a]) => window[f](...a), [fn, args]),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${fn} timed out`)), TIMEOUT)),
  ]);
}

async function run() {
  const {browser, error, executablePath} = await launch();
  if (error) {
    group('browser');
    skip('browser suite', error);
    return true;
  }
  console.log(`\nchromium: ${executablePath}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.port}`;
  const open = async (path = '/') => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).split('\n')[0]));
    await page.goto(base + path, {waitUntil: 'load'});
    return {page, errors};
  };

  try {
    // ---- the three scoping / delivery modes ----------------------------------------------------
    for (const [label, opt, frames] of [
      ['default', {}, null],
      ["scope:'with'", {scope: 'with'}, 0],
      ["delivery:'script'", {delivery: 'script'}, null],
    ]) {
      group(`mode ${label}`);
      const {page} = await open();
      const r = await call(page, 'loadAll', opt);
      checkLibs(r, label);
      ok(r.hostIntact.marked && r.hostIntact.lodash || JSON.stringify(r.hostIntact),
        `${label}: host page's own globals survive`);
      eq(r.wrapperLeak, [], `${label}: wrapper leaks nothing onto window`);
      if (frames !== null) eq(r.frames, frames, `${label}: creates ${frames} iframes`);
      else note(`${label} created ${r.frames} iframes for ${LIBS.length} libraries ( the peek window )`);
      await page.close();
    }

    // ---- bundle round trip ---------------------------------------------------------------------
    group('bundle');
    {
      const {page} = await open();
      const r = await call(page, 'bundleRoundTrip');
      ok(r.recordsProp === true, 'bundle records export names');
      checkLibs(r, 'from bundle');
      eq(r.frames, 0, 'loading from a bundle creates no iframe');
      await page.close();
    }

    // ---- stack traces and the restore on throw --------------------------------------------------
    group('debuggability');
    {
      const {page} = await open();
      const r = await call(page, 'debuggability');
      // a frame reads `at fn (<url>:line:col)`. a plain script reports an absolute url and a
      // generated one reports whatever `sourceURL` said, so compare from the file name on.
      const where = (frame) => (String(frame).match(/[^/(]+\.js:\d+:\d+/) || ['-'])[0];
      const want = where(r.trace_plainScript);
      ok(want === 'boom.js:4:9' || `reference reported ${want}`,
        'reference: plain <script src> points at boom.js:4', r.trace_plainScript);
      eq(where(r.trace_default), want, 'default mode reports the same place as a plain script');
      eq(where(r.trace_with), want, "scope:'with' reports the same place as a plain script");
      ok(r.throwingLoad === 'rejected', 'a library that throws while loading rejects');
      const wantLoad = where(r.trace_loadPlain);
      ok(wantLoad === 'thrower.js:3:7' || `reference reported ${wantLoad}`,
        'reference: a plain script throwing while loading points at thrower.js:3', r.trace_loadPlain);
      eq(where(r.trace_load), wantLoad, 'and so does one that throws through rescope');
      ok(r.hostRestoredAfterThrow === true, 'host globals are restored even when it throws');
      await page.close();
    }

    // ---- isolation -------------------------------------------------------------------------------
    group('isolation');
    {
      const {page} = await open();
      const r = await call(page, 'isolation');
      for (const mode of ['default', 'with']) {
        ok(r[mode].hasDocument === true, `${mode}: scoped code still has the document`);
        ok(r[mode].objectIdentity === true, `${mode}: window.Object === Object`);
        ok(r[mode].windowIsSelf === true, `${mode}: window, globalThis and self agree`);
      }
      ok(r.with.seesHostVar === false, "scope:'with': host's `var` globals are invisible");
      ok(r.with.seesHostMarked === false, "scope:'with': host's window globals are invisible");
      ok(r.with.parentIsProxy === true, "scope:'with': window.parent doesn't reach the real window");
      if (r.default.seesHostVar || r.default.seesHostMarked)
        note('default mode still lets host globals through as free identifiers - a known limitation, ' +
             'see doc/no-iframe.md');
      await page.close();
    }

    // ---- load order inside one batch ----------------------------------------------------------
    group('load order');
    {
      const {page} = await open();
      const r = await call(page, 'loadOrder');
      for (const label of ['default', 'with', 'script']) {
        eq(r[label].atLoad, 'provided', `${label}: a lib sees the one before it in the same load`);
        eq(r[label].later, 'provided', `${label}: and still sees it after the load`);
      }
      await page.close();
    }

    // ---- the script element a scoped library is given ------------------------------------------
    group('script element');
    {
      const {page} = await open();
      const r = await call(page, 'scriptElement');
      const named = (v) => String(v).endsWith('/fixtures/whereami.js') || `saw ${v}`;
      for (const mode of ['default', 'with', 'script']) {
        ok(named(r[mode].currentScript), `${mode}: document.currentScript names the library's url`,
          r[mode].currentScript);
        eq(r[mode].parentTag, 'BODY', `${mode}: and it sits in the document, like a real script`);
        ok(named(r[mode].lastScript), `${mode}: the last <script> in the document is the library's`);
      }
      eq(r.off.currentScript, null, "scriptElement: false leaves currentScript alone");
      eq(r.hostClean.currentScript, null, "the host's currentScript is null again afterwards");
      eq(r.hostClean.ownProperty, false, 'with no own property left on the document');
      eq(r.nodes.count, 1, 'one node per url, however many times it is loaded');
      eq(r.nodes.type, 'application/rescope-marker', 'the node carries a type that can not execute');
      eq(r.markerRan, false, 'and it never ran');
      ok(String(r.publicPath).endsWith('/fixtures/'),
        'a library deriving a base url from its script tag gets its own directory', r.publicPath);
      ok(/^ERR/.test(r.publicPathOff),
        'and without one it fails, which is the amcharts case', r.publicPathOff);
      await page.close();
    }

    // ---- two versions at once ---------------------------------------------------------------------
    group('versions');
    if (!has('marked4')) skip('two versions side by side', 'marked4 not installed ( npm alias )');
    else {
      const {page} = await open();
      const r = await call(page, 'versions');
      ok(r.distinct === true, 'two versions of one library are separate instances');
      ok(r.v7 !== r.v4 || `both rendered ${r.v7}`, 'and they behave like their own version',
        `${r.v7} / ${r.v4}`);
      ok(r.hostUntouched === true, "and the host page's own copy is untouched");
      await page.close();
    }

    // ---- the derived key set ------------------------------------------------------------------------
    group('native key set');
    {
      const {page} = await open();
      const r = await call(page, 'nativeKeys');
      eq(r.missed, [], 'every name a pristine window has is recognised as the platform\'s');
      eq(r.hostLeaked, [], 'nothing the host page defined is mistaken for the platform\'s');
      note(`${r.derivedCount} names derived from the host window, ${r.iframeCount} in a real one`);
      await page.close();
    }

    // ---- CSP ------------------------------------------------------------------------------------------
    group('content security policy');
    {
      // what each combination should do under each policy. `script+peek` fails everywhere the
      // policy bites because the peek has an eval of its own - only removing the peek helps.
      const EXPECT = {
        '/': {newFunction: 'allowed', 'eval+peek': 'ok', 'script+peek': 'ok', 'script+with': 'ok', 'script+bundled': 'ok'},
        '/csp/strictdynamic': {newFunction: 'blocked', 'eval+peek': 'fail', 'script+peek': 'fail', 'script+with': 'ok', 'script+bundled': 'ok'},
        '/csp/blob': {newFunction: 'blocked', 'eval+peek': 'fail', 'script+peek': 'fail', 'script+with': 'ok', 'script+bundled': 'ok'},
        '/csp/noeval': {newFunction: 'blocked', 'eval+peek': 'fail', 'script+peek': 'fail', 'script+with': 'fail', 'script+bundled': 'fail'},
      };
      const NAME = {'/': 'no policy', '/csp/strictdynamic': "nonce + 'strict-dynamic'",
        '/csp/blob': "'self' 'unsafe-inline' blob:", '/csp/noeval': "'self' 'unsafe-inline'"};
      for (const path of Object.keys(EXPECT)) {
        const {page} = await open(path);
        const r = await call(page, 'cspCombos');
        eq(r, EXPECT[path], `under ${NAME[path]}`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  return true;
}

module.exports = {run};
