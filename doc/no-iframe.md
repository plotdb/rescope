# Running rescope without an iframe

An analysis of what the iframes in `src/index.ls` are actually for, whether each can be dropped,
and what it costs. Every number below was measured in headless Chromium against six real minified
libraries ( `marked@7`, `d3@6`, `jszip@3.10`, `lodash@4.17`, `moment@2.29`, `vue@2.7` ); the
prototype used for the measurements is in `dev/noframe.js`.


## Where the iframes are today

There are two of them, and they serve unrelated purposes.

### role 1 - the native key set ( `proxin`, `src/index.ls:26-33` )

`proxin` creates an iframe and immediately throws it away, except for one line:

    attr = Object.fromEntries(Reflect.ownKeys(@iframe.contentWindow).map -> [it, true])

The iframe is only a source of *a pristine list of window property names*. `attr` is then used
twice in the proxy traps: in `get`, to answer `undefined` for names the host page invented
( so a library doesn't pick up another library's globals ), and in `set`, to decide whether an
assignment belongs on the real window or in the local context.

Note the proxy target stays the host `win` - the iframe realm is never entered. One iframe is
created per `proxin`, and `load` creates a `proxin` per call, so the count grows with usage.

### role 2 - the export peek ( `rsp`, `src/index.ls:126-134`, `_exports` at `:203` )

`rsp` creates a second iframe and `_exports` runs the library inside it:

    iw.eval((lib.code or '').replace('"use strict";',''))

then diffs `Reflect.ownKeys(iw)` before and after to learn which names the library defines.
This needs a *real second global object*, because that is the only place where a top-level
`var foo = ...` shows up as an enumerable property. The resulting name list becomes `lib.prop`,
which `_wrap` uses to pre-declare `var foo` in the wrapper, to hide same-named host globals
during the run, and to build the returned `__ret`.

The library therefore executes **twice**: once in the iframe for name discovery, once for real
through `lib.gen`. The same iframe also hosts `o.preloads`.


## What they cost

| | measured |
|---|---|
| iframe creation | ~9.5 ms each, ~416 KB heap each ( 50 iframes: 20.8 MB ) |
| iframes for 6 libs, stock | 18 |
| peek `eval` per lib | marked 6.9, d3 19.0, jszip 13.9, lodash 6.8, moment 8.8, vue 11.5 ms |
| 6 libs end to end, stock | ~250 ms ( ~97 ms of it fetching ) |
| 6 libs, no iframe at all | ~35-42 ms, 0 iframes |

Beyond time and memory: the peek run fires every side effect twice ( timers, listeners, network
requests, `customElements.define` ), and everything it produces belongs to a foreign realm - which
is why `doc/spec.md` has to warn that `fprop` must not be used in the host window.

`frame-src 'none'` is *not* a reason to do this: CSP does not apply to `about:blank` iframes, and
stock rescope was verified to still work under that policy.

The CSP directive that does matter is `unsafe-eval`, and the way it matters is worth stating
plainly: **a page that adopts rescope has to allow `'unsafe-eval'` in its own `script-src`**.
rescope fetches library source as text and turns it into code with `new Function` ( `_wrap` ) and
`iw.eval` ( `_exports` ); the peek iframe does not help, since a same-origin `about:blank` frame
inherits the parent's policy. Under `script-src 'self' 'unsafe-inline'` both paths throw
`EvalError` and stock rescope fails outright. This is a constraint rescope imposes on the host
site, it exists today, and it is unchanged by anything else in this document - every option here
generates code at run time.

There is a narrower way to buy the same capability, verified in Chromium:

| policy | `new Function` | wrapper delivered as a `blob:` script |
|---|---|---|
| none | works | works |
| `script-src 'self' 'unsafe-inline'` | `EvalError` | blocked |
| `script-src 'self' 'unsafe-inline' blob:` | `EvalError` | **works** - marked loaded, scoped, exports captured |

Instead of compiling the wrapper from a string, put it in a `Blob` and load it as a script:

    (function(scope, win){ with(scope){ /* library code */ } })(window.__rsp[id].scope, window);

The scoping is identical - only the delivery changes. The host then allows `blob:` rather than
`'unsafe-eval'`, which is a much smaller grant ( only blobs the page itself creates can run, and
many sites already allow `blob:` for workers ), and it composes with a nonce + `strict-dynamic`
policy. The costs are that execution becomes asynchronous, and that load errors surface as a
script `error` event instead of a thrown exception. Worth offering as an option for hosts with a
strict policy; not worth making the default.


## Role 1 is removable, with no behavior change

The pristine key list can be derived from the host window instead of a fresh realm. Classify each
own property of `window`:

 - accessor ( has `get`/`set` ) -> native. WebIDL attributes ( `document`, `innerWidth`, `name` … )
   are accessors on the global.
 - non-enumerable data -> native. JS intrinsics and every interface object ( `Object`, `HTMLElement` … ).
 - enumerable data holding a function whose source matches `[native code]` -> native.
   IDL operations ( `alert`, `fetch`, `postMessage` … ).
 - anything else - an enumerable data property with an ordinary value - is what a page or a library
   put there.

Plus everything on the prototype chain. Measured against the iframe list on a polluted page:

 - iframe: 1192 keys, heuristic: 1211 keys.
 - the heuristic misses exactly one native key: `chrome` ( an enumerable data object ). Worth an
   explicit allowlist entry next to the existing `rsp.prop.legacy`.
 - the 20 extras are `Object.prototype` / `EventTarget.prototype` members plus the deliberately
   planted host globals defined via `defineProperty`. The prototype members resolve to the same
   values either way; a page that hides a global behind `defineProperty(window, k, {enumerable: false})`
   would leak into scoped code, which is rare and no worse than the pre-v1.1.2 behavior.

Swapping this in ( same `dist/index.js`, only `proxin` patched ) gave **identical exports and
identical functional results for all six libraries**, and cut the iframe count for the six-library
run from 18 to 6.

This is a safe, self-contained change. `o.iframe` / `o.target` should stay, for callers such as
`@plotdb/block` that pass a delegate window on purpose.


## Role 2 - three ways out

### (a) move the peek to build time

Nothing says the peek has to happen in a browser. Node's `vm` module hands out a real fresh
global for free:

    vm.runInContext(code, ctx); Object.getOwnPropertyNames(global-of-ctx)

Verified to produce the same `prop` lists as the iframe ( `marked` -> `marked`, `lodash` -> `_`,
`moment` -> `moment` ); DOM-dependent libraries need the context populated from `jsdom`, which is
already a devDependency. `bundle.ls` already serializes `{url, id, ns, name, version, path, code}`
per library - adding `prop` costs a few bytes and lets `load` skip `_exports` entirely. For the
bundled production path this removes the peek iframe *and* the double execution, with no change
to how scoped code runs.

The commented-out block in `bundle.ls` was already heading this way, storing `gen` instead of
`code`; `prop` is the smaller and more portable half of that idea.

### (b) static analysis in the browser

An acorn pass over the six libraries finds top-level declarations correctly ( `marked` -> `marked`,
9-105 ms per library ), but it is not sufficient on its own: `jszip` ships the `setImmediate`
polyfill, which *creates* `setImmediate` on the global at run time and then reads it back as a bare
identifier. A declaration scanner cannot see that, and the run dies with
`setImmediate is not a function`. Static analysis alone is the weakest of the three options -
and a parser in the browser bundle is not cheap.

### (c) `with (scope)` - no peek at all

Wrap the library in `with(scope){ … }` and let the proxy answer `has` for every name. Then

 - free identifiers resolve through the proxy, so a global created at run time ( `setImmediate` )
   is visible to the code that created it;
 - `var foo = ...` inside a `with` block assigns *through the with object*, so top-level `var`
   exports land in the context by themselves - the whole reason the peek existed;
 - `window`, `self`, `globalThis`, `global`, `parent`, `top` are answered with the proxy itself.

Measured with `dev/noframe.js`, zero iframes, all six libraries:

| lib | exports captured | functional test |
|---|---|---|
| marked | `marked` | ok ( top-level `var`, the case the `"use strict"` hack in `_exports` exists for ) |
| d3 | `d3` | ok |
| jszip | `setImmediate, clearImmediate, JSZip` | ok, incl. async `generateAsync` over the `message` path |
| lodash | `_` | ok - **stock rescope fails this library** ( see below ) |
| moment | `moment` | ok |
| vue | `Vue` | ok |

Two versions of `marked` ( v4 and v7 ) loaded into two scopes stayed independent, and the host's
own `window.marked` was untouched.

Isolation gets *better*, not worse. Probing from inside a scoped library:

| | stock | `with` |
|---|---|---|
| sees host's `var hostVar` | yes | no |
| sees host's `window.marked` | yes | no |
| `window.parent` reaches the real window | yes | no |

The first two are a real hole in the current design: the wrapper only blanks the names in
`lib.prop`, so every *other* host global remains reachable as a free identifier. The third is the
`window.parent` escape hatch the README lists as TBD - `with` closes it, because the proxy answers
the lookup instead of the real window.

The price is library run time, and it is not small:

| 20k operations | plain | stock rescope | `with` | `with` + hoisted intrinsics |
|---|---|---|---|---|
| `moment(...).format(...)` | 106 ms | 95 ms | 334 ms | 291 ms |
| `d3.scaleLinear()(x)` | 1.1 ms | 0.8 ms | 4.6 ms | 4.1 ms |

Stock rescope runs at parity with an unscoped library because free identifiers resolve to the real
global; under `with`, every function *syntactically inside* the block loses fast variable slots for
its whole lifetime. Binding the hot intrinsics ( `Math`, `Array`, `Date`, … ) as real locals of the
wrapper and answering `has` with `false` for them recovers only ~15% - the deopt, not the trap
count, is what dominates.

Implementation notes for this route:

 - `has` may not return `false` for a non-configurable own property of the target, so `document`,
   `location`, `top` and `window` cannot be hoisted while the proxy target is the real window.
   Using an empty object as the proxy target ( and forwarding to `win` inside the traps, the way
   SES does ) removes that class of invariant problem altogether.
 - `with` requires sloppy mode. The generated wrapper is already sloppy, and a `"use strict"` in
   the middle of a function body is not a directive - so the `.replace('"use strict";','')` hack
   in `_exports` is no longer needed either.
 - top-level `let` / `const` exports are still missed - but they are missed by the iframe peek too
   ( lexical globals are not own properties of the window ), so this is parity, not a regression.
 - `event.source` forging must hand out *the same* proxy the library sees. Two stacked proxies
   ( an outer `has`/`get` layer over the existing `proxin` ) break jszip's `setImmediate`, which
   compares `event.source === global` and silently hangs when they differ. One proxy, one identity.
 - **intrinsics must be handed back raw.** The `get` trap wraps every function in a bound proxy,
   so `scope.Object` is not `Object`. Libraries fingerprint their global with exactly that
   comparison - lodash's `freeGlobal = typeof global == 'object' && global.Object === Object && global` -
   and fall through to `Function('return this')()`, i.e. the real window, when it fails. Returning
   the real value for intrinsic names keeps the two identities equal; hoisting them as locals
   without doing so makes it worse, since then the local and the trap disagree by construction.


### is `with` going to be taken away?

MDN labels `with` deprecated, so the question is fair - but the label records the ES5 ( 2009 )
decision to forbid it in strict mode, not a removal plan. Where things actually stand:

 - `with` is in the main body of the ECMAScript spec ( `WithStatement` ), not in Annex B where the
   legacy/discouraged web features live. Removing it would mean removing sloppy mode, which is the
   parse mode every classic `<script>` still starts in.
 - the strict-mode ban has been the whole of the deprecation for sixteen years; there is no TC39
   proposal to go further, and "don't break the web" makes one unlikely.
 - the ecosystem would break loudly. Checked locally: **Vue 3.4's in-browser build emits
   `with (_ctx) { … }`** from its template compiler - in `vue.global.js` *and* `vue.global.prod.js` -
   and **lodash's `_.template` generates `with (obj) { … }`**. SES / Endo and LavaMoat ( MetaMask )
   build their compartments on `with` + `Proxy` as well. A browser that drops `with` breaks Vue and
   MetaMask on the same day.

Two practical points that make the exposure smaller than it looks:

 - the `with` never appears in rescope's own source. It is assembled into a string inside `_wrap`
   at run time, so no bundler or minifier ever parses it, and no toolchain can reject it.
 - a `Function` constructor body is always parsed as sloppy code, whatever the caller is. Verified:
   `new Function('o', 'with(o){ return a + b }')` works when created from an ES module and from a
   `"use strict"` script, while a literal `with` in strict code is a `SyntaxError` as expected. So
   the wrapper stays valid no matter how rescope itself gets bundled.

And should the worst happen, the blast radius is one code generator: `with` is a per-wrapper
codegen choice, so falling back to the `prop`-based wrapper is a runtime flag, not a rewrite. Steps
1 and 2 of the recommendation below do not use `with` at all - which is the main reason they come
first.


## Recommendation

Staged, so each step stands alone:

1. **Drop the `proxin` iframe now.** Derive `attr` from the host window as above, cache the result
   at module level ( it does not change ), keep `o.iframe` / `o.target` for deliberate delegates.
   Verified identical behavior; removes two thirds of the iframes and all per-`load` iframe cost.
2. **Record `prop` in the cache and bundle format.** Compute it offline with `vm`/`jsdom`, skip
   `_exports` whenever `lib.prop` is already known. The bundled path then runs with no iframe and
   no double execution, and scoped code keeps today's speed.
3. **Add an opt-in `with`-based mode** ( e.g. `new rescope({scope: 'with'})`, or a per-lib flag in
   the cache entry ) for the cases the other two cannot cover: an unbundled library on a page where
   no `prop` is known, environments with no DOM at all ( workers ), or hosts that must not create
   frames. It is also the correct fallback when a library turns out to define globals at run time.
   Document the run-time cost so nobody enables it for a hot library like `moment` by accident.
4. **Keep an iframe only for what genuinely needs a second document** - the `useDelegateLib`
   behavior described in the README ( which, note, is not implemented in the current `src/index.ls`
   at all; only `proxin`'s `o.iframe` / `o.target` survives ).

After 1 and 2, a production page that loads a bundle creates **zero iframes** and runs each library
**once**, with no change in scoping semantics. Step 3 is what makes rescope work where an iframe is
impossible, at a price that should be a deliberate choice.


## Bugs found while measuring

 - **lodash does not load under stock rescope**, and takes the host's `window._` with it.
   `s.load('lodash.min.js')` rejects with `TypeError: Expected a function`, thrown out of lodash's
   own `createWrap`, with `proxin`'s bound-function proxy ( `index.js:137`, the
   `typeof t[k] == 'function'` branch of `get` ) in the stack. Root cause is the identity problem
   above: `global.Object === Object` is false through the proxy, so lodash decides the object it
   was handed is not a real global, calls `Function('return this')()`, and installs itself on the
   actual window - overwriting whatever the page had there - while the scope gets a half-wired
   copy. Returning intrinsics raw from `get` fixes this in the current design too; it is not
   specific to the no-iframe work.
 - **A library that throws leaves the host window clobbered.** `_wrap` emits
   `win['k'] = __win['k']` *after* the library code, in the same function body, so an exception
   skips every restore - the host globals that were blanked for the run stay blanked.
   Wrapping the body in `try`/`finally` fixes it independently of anything in this document.
 - **Host globals leak into scoped code** for every name not in `lib.prop`, as shown in the
   isolation table above.


## Reproducing

`dev/noframe.js` is the prototype - a small scoping core with no iframe anywhere. Serve it next to
a page that has some libraries to load:

    var sc = noframe.scopein(window, {});
    noframe.run(codeOfSomeLibrary, sc);
    sc.ctx;   // -> {JSZip: ..., setImmediate: ..., clearImmediate: ...}

The measurements above come from driving that file plus stock `dist/index.js` in headless Chromium
over the six libraries, comparing exports, functional behavior ( markdown rendered, zip generated,
scale evaluated, component mounted ), iframe count and timing.
