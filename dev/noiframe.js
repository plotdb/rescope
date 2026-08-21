// Prototype for doc/no-iframe.md - rescope-style scoping with NO iframe.
//
// single pass: the library runs once, inside `with(scope)`, and the scope proxy records
// every global write. that recording IS the export list - no probe realm, no code diff.
// exports are collected through three channels, see doc/no-iframe.md section 4:
//   1. the proxy `set` trap        - assignments and implicit globals
//   2. the declaration epilogue    - top level function / class / let / const
//   3. the host window value delta - writes through a sloppy mode `this`
//
// this is a study, not a drop-in: no registry, no cache, no async loading, no
// `event.source` interception ( that part of `proxin` carries over unchanged ).
// drop it in a page and call `noiframe.run(code[, ctx])` -> object of exports.
//
//   noiframe.run(d3v3src).d3.version   // "3.5.17"
//   noiframe.run(d3v6src).d3.version   // "6.7.0"
//
// `runFacade` at the bottom is the trap-free variant ( plain object + bound window
// prototype ) mentioned in section 5. it works, but measured ~5x slower than the
// Proxy variant on d3-heavy code, so it is kept only as recorded evidence.
(function () {
  var real = window;

  // ES builtins we deliberately let fall through the `with` scope so hot library code
  // keeps the plain ( non-proxied ) lookup path. a top level `var Object = ...` then lands
  // on the real global instead, which the host window delta below harvests and restores.
  var FALLTHROUGH = ('Object Array Math JSON Promise Symbol Number String Boolean RegExp Date ' +
    'Error TypeError RangeError SyntaxError Function Map Set WeakMap WeakSet parseInt parseFloat ' +
    'isNaN isFinite NaN Infinity undefined Reflect Proxy ArrayBuffer DataView Uint8Array Int8Array ' +
    'Uint16Array Int16Array Uint32Array Int32Array Float32Array Float64Array BigInt encodeURIComponent ' +
    'decodeURIComponent encodeURI decodeURI escape unescape Intl').split(' ');
  var fallthrough = {}; FALLTHROUGH.forEach(function (k) { fallthrough[k] = true; });

  var ALIASES = { window: 1, self: 1, globalThis: 1, global: 1 };
  var LEGACY = { webkitStorageInfo: true };
  var INTRINSIC = {};
  ('Object Function Array Number Boolean String Symbol Date RegExp Error EvalError RangeError ' +
   'ReferenceError SyntaxError TypeError URIError Math JSON Promise Proxy Reflect Map Set WeakMap ' +
   'WeakSet WeakRef FinalizationRegistry ArrayBuffer SharedArrayBuffer DataView BigInt BigInt64Array ' +
   'BigUint64Array Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array ' +
   'Float32Array Float64Array Atomics Intl eval isFinite isNaN parseFloat parseInt decodeURI ' +
   'decodeURIComponent encodeURI encodeURIComponent escape unescape AggregateError Iterator').split(' ')
    .forEach(function (k) { INTRINSIC[k] = true; });
  var HANDLE = '__rspscope__';
  var HANDLE_H = '__rsphandle__';

  // ---- pristine global key set, derived from the host window itself ----
  // ( replaces `Reflect.ownKeys(iframe.contentWindow)` )
  var _native = null;
  function nativeKeys() {
    if (_native) return _native;
    var isNativeFn = function (v) {
      return typeof v === 'function' && /\{\s*\[native code\]\s*\}/.test(Function.prototype.toString.call(v));
    };
    var out = {};
    Object.getOwnPropertyNames(real).forEach(function (k) {
      var d = Object.getOwnPropertyDescriptor(real, k);
      if (!d) return;
      if (d.get || d.set) { out[k] = true; return; }   // WebIDL global attribute
      if (!d.enumerable) { out[k] = true; return; }    // ES builtin
      if (isNativeFn(d.value)) { out[k] = true; return; }
    });
    // inherited members ( Window.prototype, WindowProperties, EventTarget.prototype ) are
    // part of the pristine global surface too - `Reflect.ownKeys(iframe)` misses these.
    for (var p = Object.getPrototypeOf(real); p; p = Object.getPrototypeOf(p))
      Object.getOwnPropertyNames(p).forEach(function (k) { out[k] = true; });
    return (_native = out);
  }

  // superset scan for declaration forms the `with` scope cannot observe
  // ( top level `function` / `class` / `let` / `const` ). over-collection is harmless:
  // the epilogue only exports a name that really resolves to a top level binding.
  var RESERVED = {};
  ('break case catch class const continue debugger default delete do else enum export extends ' +
   'false finally for function if implements import in instanceof interface let new null package ' +
   'private protected public return static super switch this throw true try typeof var void while ' +
   'with yield await').split(' ').forEach(function (k) { RESERVED[k] = true; });
  function declNames(code) {
    var out = {}, re = /(?:^|[^\w$.])(?:function|class|let|const)\s+([A-Za-z_$][\w$]*)/g, m;
    while ((m = re.exec(code))) { if (!RESERVED[m[1]]) out[m[1]] = true; }
    return Object.keys(out);
  }

  function makeScope(ctx) {
    var recorded = {};
    var attr = nativeKeys();
    var fcache = {};
    var scope = new Proxy(Object.create(null), {
      has: function (t, k) {
        if (k === Symbol.unscopables) return false;
        if (k === HANDLE || k === HANDLE_H) return false;
        if (typeof k === 'string' && fallthrough[k] && !(k in recorded) && !(k in ctx)) return false;
        return true;
      },
      get: function (t, k) {
        if (k === Symbol.unscopables) return undefined;
        if (typeof k === 'string' && ALIASES[k] && !(k in recorded)) return scope;
        if (k in recorded) return recorded[k];
        if (k in ctx) return ctx[k];
        var v = real[k];
        if (typeof v !== 'function') {
          if (typeof k === 'string' && !attr[k]) return undefined;  // hide host page globals
          return v;
        }
        if (INTRINSIC[k]) return v;   // realm intrinsic: hand out the real one
        if (fcache[k]) return fcache[k];
        return (fcache[k] = new Proxy(v.bind(real), {
          get: function (d, g, r) { return Reflect.get((g in d ? d : v), g, r); }
        }));
      },
      set: function (t, k, v) { recorded[k] = v; return true; },
      deleteProperty: function (t, k) { delete recorded[k]; return true; },
      defineProperty: function (t, k, d) { Object.defineProperty(recorded, k, d); return true; },
      getOwnPropertyDescriptor: function (t, k) {
        if (k in recorded) return Object.getOwnPropertyDescriptor(recorded, k);
        var d = Object.getOwnPropertyDescriptor(real, k);
        return d ? { value: scope[k], writable: true, enumerable: true, configurable: true } : undefined;
      },
      ownKeys: function () { return Reflect.ownKeys(recorded); }
    });
    var handle = {
      raw: function (k) { return (k in recorded) ? recorded[k] : (k in ctx ? ctx[k] : real[k]); },
      put: function (k, v) { recorded[k] = v; }
    };
    return { scope: scope, recorded: recorded, handle: handle };
  }

  function run(code, ctx) {
    ctx = ctx || {};
    var s = makeScope(ctx);
    var epi = declNames(code).map(function (n) {
      return 'if(typeof ' + n + '!=="undefined"&&' + HANDLE_H + '.raw("' + n + '")!==' + n + ')' +
        HANDLE_H + '.put("' + n + '",' + n + ');';
    }).join('');
    var fn = new Function(HANDLE, HANDLE_H, 'with(' + HANDLE + '){' + code + '\n;' + epi + '}');
    // leak catcher: in sloppy mode a plain `fn()` call still gets the REAL global as `this`,
    // so `this.d3 = ...` inside a UMD IIFE lands on the host window, not on our scope.
    // snapshot / diff / restore the host window around the run to harvest and undo that.
    var before = {}, seen = {}, k, i, keys = Object.getOwnPropertyNames(real);
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      if (LEGACY[k]) continue;             // reading these only earns a deprecation warning
      seen[k] = true; before[k] = real[k];
    }
    try { fn.call(s.scope, s.scope, s.handle); }
    finally {
      keys = Object.getOwnPropertyNames(real);
      for (i = 0; i < keys.length; i++) {
        k = keys[i];
        if (LEGACY[k]) continue;
        if (seen[k] && Object.is(real[k], before[k])) continue;
        if (!(k in s.recorded)) s.recorded[k] = real[k];
        try { if (seen[k]) real[k] = before[k]; else delete real[k]; } catch (e) {}
      }
    }
    return s.recorded;
  }

  // ---- variant: plain-object facade instead of a Proxy ----
  // same `with` trick, but the scope object is a real object whose prototype carries the
  // pristine window surface ( methods bound to the real window ). no trap call per lookup.
  var _facade = null;
  function facade() {
    if (_facade) return _facade;
    var attr = nativeKeys(), f = Object.create(null);
    Object.keys(attr).forEach(function (k) {
      if (LEGACY[k]) return;
      var src = real, d = null;
      for (var o = real; o && !d; o = Object.getPrototypeOf(o)) { d = Object.getOwnPropertyDescriptor(o, k); if (d) src = o; }
      if (!d) return;
      if (d.get || d.set) {
        Object.defineProperty(f, k, { configurable: true, enumerable: false,
          get: d.get ? function () { return real[k] } : undefined,
          set: d.set ? function (v) { real[k] = v } : undefined });
        return;
      }
      var v = d.value;
      if (typeof v === 'function' && !INTRINSIC[k]) {
        var b = new Proxy(v.bind(real), { get: function (dd, g, r) { return Reflect.get((g in dd ? dd : v), g, r) } });
        Object.defineProperty(f, k, { value: b, writable: true, configurable: true, enumerable: false });
      } else Object.defineProperty(f, k, { value: v, writable: true, configurable: true, enumerable: false });
    });
    return (_facade = f);
  }

  function runFacade(code, ctx) {
    ctx = ctx || {};
    var f = facade();
    var scope = Object.create(f), seed = {};
    // hide whatever the host page put on its own window
    var attr = nativeKeys();
    Object.getOwnPropertyNames(real).forEach(function (k) {
      if (attr[k] || LEGACY[k]) return;
      Object.defineProperty(scope, k, { value: undefined, writable: true, configurable: true, enumerable: false });
      seed[k] = undefined;
    });
    Object.keys(ctx).forEach(function (k) {
      Object.defineProperty(scope, k, { value: ctx[k], writable: true, configurable: true, enumerable: false });
      seed[k] = ctx[k];
    });
    ['window', 'self', 'globalThis', 'global'].forEach(function (k) {
      Object.defineProperty(scope, k, { value: scope, writable: true, configurable: true, enumerable: false });
      seed[k] = scope;
    });
    var handle = { raw: function (k) { return scope[k] }, put: function (k, v) { scope[k] = v } };
    var epi = declNames(code).map(function (n) {
      return 'if(typeof ' + n + '!=="undefined"&&' + HANDLE_H + '.raw("' + n + '")!==' + n + ')' +
        HANDLE_H + '.put("' + n + '",' + n + ');';
    }).join('');
    var fn = new Function(HANDLE, HANDLE_H, 'with(' + HANDLE + '){' + code + '\n;' + epi + '}');
    var before = {}, seen = {}, k, i, keys = Object.getOwnPropertyNames(real);
    for (i = 0; i < keys.length; i++) { k = keys[i]; if (LEGACY[k]) continue; seen[k] = true; before[k] = real[k]; }
    try { fn.call(scope, scope, handle); }
    finally {
      keys = Object.getOwnPropertyNames(real);
      for (i = 0; i < keys.length; i++) {
        k = keys[i];
        if (LEGACY[k] || (seen[k] && Object.is(real[k], before[k]))) continue;
        if (!Object.prototype.hasOwnProperty.call(scope, k) || Object.is(scope[k], seed[k])) scope[k] = real[k];
        try { if (seen[k]) real[k] = before[k]; else delete real[k]; } catch (e) {}
      }
    }
    // exports = own props that are new, or whose seeded value the library changed
    var out = {};
    Object.getOwnPropertyNames(scope).forEach(function (k) {
      if (k in seed && Object.is(seed[k], scope[k])) return;
      if (ALIASES[k]) return;
      out[k] = scope[k];
    });
    return out;
  }

  window.noiframe = { run: run, runFacade: runFacade, nativeKeys: nativeKeys, declNames: declNames };
}());
