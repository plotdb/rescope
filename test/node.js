// the node half: dist/node.js against a jsdom window. this is the path dev/main.ls uses, and it
// exercises a different set of platform quirks - jsdom hands out its interface objects through
// getters that only answer for a real window, which used to break the proxy.
const fs = require('fs');
const {libPath, has} = require('./lib/libs');
const {group, ok, eq, skip, note} = require('./lib/report');

const LIBS = {
  marked: c => /<h1/.test((c.marked.parse || c.marked)('# hi')) || 'did not render',
  lodash: c => (c._ && c._.chunk([1, 2, 3, 4], 2).length === 2) || 'chunk failed',
  moment: c => c.moment('2020-03-04').format('YYYY-MM') === '2020-03' || 'format failed',
};

async function run() {
  group('node ( jsdom )');
  let jsdom, rescope;
  try { jsdom = require('jsdom'); }
  catch (e) { skip('node suite', 'jsdom is not installed ( npm i )'); return; }
  try { rescope = require('../dist/node.js'); }
  catch (e) { ok(String(e).slice(0, 120), 'dist/node.js loads'); return; }

  const dom = new jsdom.JSDOM('<body></body>', {url: 'http://localhost'});
  rescope.env(dom.window);
  const frames = () => dom.window.document.querySelectorAll('iframe').length;

  for (const mode of ['default', 'with']) {
    const before = frames();
    rescope._cache = {}; rescope._ver = {map: {}, list: {}};
    // in node, a registry may hand back a plain path: `_fetch` reads it off disk
    const rsp = new rescope({registry: o => libPath(o.name), scope: mode});
    for (const name of Object.keys(LIBS)) {
      if (!has(name)) { skip(`node/${mode}: ${name}`, 'not installed'); continue; }
      try {
        const ctx = await rsp.load([{name, version: '1'}]);
        const works = LIBS[name](ctx);
        ok(works === true ? true : works, `node/${mode}: ${name}`, `[${Object.keys(ctx).join(',')}]`);
      } catch (e) { ok(String(e).split('\n')[0].slice(0, 120), `node/${mode}: ${name}`); }
    }
    if (mode === 'with') eq(frames() - before, 0, "node/with: creates no iframe");
    else note(`node/default created ${frames() - before} iframe ( the peek window, shared )`);
  }
}

module.exports = {run};
