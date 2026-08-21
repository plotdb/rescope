// experiment for doc/no-iframe.md - NOT part of dist.
//
// depth-0 declaration scanner: given a library source, list the names introduced by
// top-level `var` / `let` / `const` / `function` / `class` declarations. these are the
// only exports the proxy `set` trap cannot see, and thus the only reason the discovery
// iframe in `_exports` exists.
//
// usage: node dev/decl-scan.js <file> [<file> ...]
//
// this is a brace / string / template / regex aware scanner, not a parser. it is here to
// size up the approach, not to be shipped as is.

// depth-0 declaration scanner: find top-level var/function/class/let/const names
function scan(src) {
  let i = 0, n = src.length, depth = 0, parenDepth = 0, names = new Set();
  let prevMeaning = null; // last significant token for regex/division disambiguation
  const isIdStart = c => /[A-Za-z_$]/.test(c);
  const isId = c => /[A-Za-z0-9_$]/.test(c);
  function skipString(q) {
    i++;
    while (i < n) { const c = src[i]; if (c === '\\') { i += 2; continue; } if (c === q) { i++; return; } i++; }
  }
  function skipTemplate() {
    i++;
    while (i < n) { const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; return; }
      if (c === '$' && src[i+1] === '{') { i += 2; let d = 1; while (i < n && d > 0) { const ch = src[i]; if (ch === '{') d++; else if (ch === '}') d--; else if (ch === '"' || ch === "'") { skipString(ch); continue; } else if (ch === '`') { skipTemplate(); continue; } i++; } continue; }
      i++; }
  }
  function skipRegex() {
    i++; let inClass = false;
    while (i < n) { const c = src[i]; if (c === '\\') { i += 2; continue; } if (c === '[') inClass = true; else if (c === ']') inClass = false; else if (c === '/' && !inClass) { i++; while (i < n && isId(src[i])) i++; return; } i++; }
  }
  function readIdent() { let s = i; while (i < n && isId(src[i])) i++; return src.slice(s, i); }
  function skipSpace() {
    while (i < n) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '/' && src[i+1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i+1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i+1] === '/')) i++; i += 2; continue; }
      break;
    }
  }
  function collectBindingNames(kind) {
    // after `var`/`let`/`const`, read comma separated binding targets at this depth
    for (;;) {
      skipSpace();
      const c = src[i];
      if (!c) return;
      if (isIdStart(c)) {
        const nm = readIdent();
        if (depth === 0 && parenDepth === 0) names.add(nm);
      } else if (c === '{' || c === '[') {
        // destructuring: grab identifiers followed by , or } or ] (rough)
        let d = 0, start = i;
        do { const ch = src[i]; if (ch === '{' || ch === '[') d++; else if (ch === '}' || ch === ']') d--; i++; } while (i < n && d > 0);
        const inner = src.slice(start, i);
        (inner.match(/[A-Za-z_$][A-Za-z0-9_$]*(?=\s*[,}\]:])/g) || []).forEach(x => { if (depth === 0 && parenDepth === 0) names.add(x); });
      } else return;
      // skip initializer until , or ; at same level
      let d = 0;
      while (i < n) {
        const ch = src[i];
        if (ch === '"' || ch === "'") { skipString(ch); continue; }
        if (ch === '`') { skipTemplate(); continue; }
        if (ch === '/' && (src[i+1] === '/' || src[i+1] === '*')) { skipSpace(); continue; }
        if (ch === '(' || ch === '[' || ch === '{') d++;
        else if (ch === ')' || ch === ']' || ch === '}') { if (d === 0) return; d--; }
        else if (ch === ',' && d === 0) { i++; break; }
        else if ((ch === ';' || ch === '\n') && d === 0) { return; }
        i++;
      }
    }
  }
  while (i < n) {
    skipSpace();
    if (i >= n) break;
    const c = src[i];
    if (c === '"' || c === "'") { skipString(c); prevMeaning = 'value'; continue; }
    if (c === '`') { skipTemplate(); prevMeaning = 'value'; continue; }
    if (c === '/') {
      if (prevMeaning === 'value') { i++; prevMeaning = 'op'; continue; }
      skipRegex(); prevMeaning = 'value'; continue;
    }
    if (c === '{') { depth++; i++; prevMeaning = 'op'; continue; }
    if (c === '}') { depth--; i++; prevMeaning = 'value'; continue; }
    if (c === '(') { if (depth === 0) parenDepth++; i++; prevMeaning = 'op'; continue; }
    if (c === ')') { if (depth === 0) parenDepth--; i++; prevMeaning = 'value'; continue; }
    if (isIdStart(c)) {
      const word = readIdent();
      if (depth === 0 && parenDepth === 0 && prevMeaning !== 'dot') {
        if (word === 'var' || word === 'let' || word === 'const') { collectBindingNames(word); prevMeaning = 'value'; continue; }
        if (word === 'function' || word === 'class') {
          skipSpace();
          if (src[i] === '*') { i++; skipSpace(); }
          if (isIdStart(src[i])) { const nm = readIdent(); names.add(nm); }
          prevMeaning = 'value'; continue;
        }
      }
      prevMeaning = (word === 'return' || word === 'typeof' || word === 'in' || word === 'of' || word === 'new' || word === 'delete' || word === 'void' || word === 'case') ? 'op' : 'value';
      continue;
    }
    if (c === '.') { i++; prevMeaning = 'dot'; continue; }
    i++;
    prevMeaning = 'op';
  }
  return [...names];
}
module.exports = scan;
if (require.main === module) {
  const fs = require('fs');
  for (const f of process.argv.slice(2)) {
    const src = fs.readFileSync(f, 'utf8');
    const t0 = process.hrtime.bigint();
    const r = scan(src);
    const t1 = process.hrtime.bigint();
    console.log(`${f}  (${(src.length/1024).toFixed(0)}KB, ${Number(t1-t0)/1e6}ms)  ->`, JSON.stringify(r).slice(0, 400));
  }
}
