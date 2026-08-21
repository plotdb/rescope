// static server for the test page. serves the built dist, the fixtures, and the real libraries
// out of node_modules, and applies a Content-Security-Policy per url prefix so the CSP suite can
// ask for the same page under different policies.
const http = require('http');
const fs = require('fs');
const path = require('path');
const {LIBS, libPath} = require('./libs');

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..');
const MIME = {'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json'};

// the CSP suite loads the same page under each of these. keys are url prefixes.
const POLICY = {
  '/csp/strictdynamic': "script-src 'nonce-rescope' 'strict-dynamic'",
  '/csp/blob': "script-src 'self' 'unsafe-inline' blob:",
  '/csp/noeval': "script-src 'self' 'unsafe-inline'",
};

function resolve(url) {
  if (url === '/' || POLICY[url]) return path.join(ROOT, 'page', 'index.html');
  if (url.startsWith('/dist/')) return path.join(REPO, url);
  if (url.startsWith('/fixtures/')) return path.join(ROOT, url);
  if (url.startsWith('/libs/')) {
    const name = url.slice('/libs/'.length).replace(/\.js$/, '');
    return LIBS[name] ? libPath(name) : null;
  }
  return null;
}

// returns {port, close()}
async function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = resolve(url);
    if (!file) { res.writeHead(404); return res.end('not found'); }
    fs.readFile(file, (e, body) => {
      if (e) { res.writeHead(404); return res.end('not found'); }
      const head = {'content-type': MIME[path.extname(file)] || 'application/octet-stream'};
      if (POLICY[url]) head['content-security-policy'] = POLICY[url];
      res.writeHead(200, head);
      res.end(body);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return {port: server.address().port, close: () => server.close()};
}

module.exports = {serve, POLICY};
