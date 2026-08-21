// prototype for doc/no-iframe.md - a scoping core that uses no iframe at all:
//
//  - the native key set comes from the host window instead of a pristine iframe window.
//  - exports are captured by running the library inside `with(scope)`, so both `window.foo = ...`
//    and a top level `var foo = ...` land in the context. no peek pass, no second execution.
//
// this is sample code for evaluating the design, not a drop in replacement for src/index.ls.
(function(){

var NATIVE = /\{\s*\[native code\]\s*\}/;
var _keys = null;

// which names belong to a pristine window, without asking a pristine window.
//  - accessor own property        -> WebIDL attribute ( document, innerWidth, name, ... )
//  - non enumerable own property  -> JS intrinsic or interface object ( Object, HTMLElement, ... )
//  - enumerable own native fn     -> WebIDL operation ( alert, fetch, postMessage, ... )
//  - anything else                -> the page or a library put it there.
// misses `chrome`, which is an enumerable data object. see rsp.prop.legacy for the same kind of
// exception list.
function nativeKeys(w){
  if (_keys) return _keys;
  var attr = {}, keys, i, k, d, p;
  for (p = Object.getPrototypeOf(w); p; p = Object.getPrototypeOf(p)) {
    keys = Reflect.ownKeys(p);
    for (i = 0; i < keys.length; i++) attr[keys[i]] = true;
  }
  keys = Reflect.ownKeys(w);
  for (i = 0; i < keys.length; i++) {
    k = keys[i];
    d = Object.getOwnPropertyDescriptor(w, k);
    if (!d) continue;
    if (d.get || d.set) { attr[k] = true; continue; }
    if (!d.enumerable) { attr[k] = true; continue; }
    if (typeof d.value === 'function' && NATIVE.test(Function.prototype.toString.call(d.value))) attr[k] = true;
  }
  return _keys = attr;
}

// under `with`, these have to be answered with the proxy itself - there is no local `var window`
// shadowing them any more. this also closes the `window.parent` escape hatch in README.
var SELF = {window: 1, self: 1, globalThis: 1, global: 1, top: 1, parent: 1, frames: 1};

// hot intrinsics, bound as real locals of the wrapper and hidden from the `with` object so inner
// loops do a lexical lookup instead of a trap. worth ~15%; the `with` deopt dominates.
// `document` / `location` / `top` / `window` can NOT go in here: a `has` trap may not return false
// for a non configurable own property of the target.
var FAST = ('Object Function Array Number String Boolean Symbol Math JSON Date RegExp Error TypeError ' +
  'RangeError SyntaxError Promise Map Set WeakMap WeakSet Proxy Reflect parseInt parseFloat isNaN ' +
  'isFinite decodeURI decodeURIComponent encodeURI encodeURIComponent ArrayBuffer Uint8Array Int32Array ' +
  'Float64Array DataView console navigator performance').split(' ');
var FASTMAP = {};
FAST.forEach(function(k){ FASTMAP[k] = true });

function scopein(win, lc){
  var attr = nativeKeys(win), func = {}, unwrapped = {}, wrapped = {}, wm = new WeakMap(), proxy;
  lc = lc || {};
  // same reasoning as proxin's evt-proxy: hand out a proxied view, leave the shared Event alone.
  // note it must return the very proxy the library sees - jszip's setImmediate compares
  // `event.source === global` and hangs forever when a second proxy layer breaks that identity.
  var evtProxy = function(evt){
    return new Proxy(evt, {get: function(t, k){
      if (k === 'source') return proxy;
      var v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    }});
  };
  proxy = new Proxy(win, {
    // every free identifier in the scoped code resolves through this proxy
    has: function(t, k){ return FASTMAP[k] ? (k in lc) : true },
    get: function(t, k, r){
      if (k === Symbol.unscopables) return undefined;
      if (SELF[k]) return proxy;
      if (k in lc) return lc[k];
      // intrinsics must come back raw, not as a bound wrapper: libraries fingerprint their global
      // with `global.Object === Object` ( lodash does exactly this ) and pick the real window when
      // the two identities disagree.
      if (FASTMAP[k]) return t[k];
      if (func[k] != null) return func[k];
      if (unwrapped[k] != null) return unwrapped[k];
      if (wrapped[k] != null) return wrapped[k];
      if (k === 'addEventListener') return wrapped[k] = function(n, cb){
        var rest = [].slice.call(arguments, 2);
        if (n !== 'message') return win.addEventListener.apply(win, [n, cb].concat(rest));
        var ncb = function(evt){ return cb.call(proxy, evtProxy(evt)) };
        win.addEventListener.apply(win, [n, ncb].concat(rest));
        wm.set(cb, ncb);
      };
      if (k === 'removeEventListener') return wrapped[k] = function(n, cb){
        var rest = [].slice.call(arguments, 2);
        return win.removeEventListener.apply(win, [n, (n === 'message' && wm.get(cb)) || cb].concat(rest));
      };
      if (typeof t[k] === 'function') {
        var f;
        try { f = Reflect.get(t, k, r) } catch (e) { f = t[k] }
        return func[k] = new Proxy(f.bind(t), {get: function(d, g, o){ return Reflect.get(g in d ? d : f, g, o) }});
      }
      if (attr[k] == null) return undefined;   // whatever the host page defined stays invisible
      return t[k];
    },
    set: function(t, k, v){
      if (k === 'onmessage') {
        unwrapped[k] = v;
        queueMicrotask(function(){ t[k] = function(evt){ return v && v.call(proxy, evtProxy(evt)) } });
        return true;
      }
      if (attr[k] && !(k in lc)) { t[k] = v; return true }
      lc[k] = v;
      return true;
    },
    defineProperty: function(t, k, d){ Object.defineProperty(lc, k, d); return true },
    deleteProperty: function(t, k){ delete lc[k]; return true }
  });
  return {proxy: proxy, ctx: lc, win: win};
}

// `with` needs sloppy mode. a "use strict" inside the library code is not a directive prologue
// here, so it does not apply - the workaround in _exports is unnecessary in this mode.
//
// opt.url: the library's real URL. appended as `//# sourceURL`, which is what makes stack traces
// and breakpoints usable - see the debugging section of doc/no-iframe.md. indirect eval is used
// rather than `new Function` because the Function constructor prepends its own header, which
// shifts every reported line number by two; indirect eval reports the library's own lines.
function run(code, sc, opt){
  opt = opt || {};
  var head = opt.fast === false ? ''
    : 'var ' + FAST.map(function(k){ return k + '=win.' + k }).join(',') + ';';
  // keep the header on the SAME line as the library's first line, or the offset comes back
  var body = '(function(scope, win){' + head + 'with(scope){' + code + '\n}})' +
    (opt.url ? '\n//# sourceURL=' + opt.url : '');
  var fn = (0, eval)(body);
  return fn.call(sc.proxy, sc.proxy, sc.win || window);
}

var api = {scopein: scopein, run: run, nativeKeys: nativeKeys};
if (typeof module !== 'undefined') module.exports = api;
else if (typeof window !== 'undefined') window.noframe = api;
})();
