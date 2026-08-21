# Dropping the iframe

An analysis of whether `@plotdb/rescope` still needs a delegate iframe, and what a
same-realm design would look like. Numbers in this document come from the prototype in
`dev/noiframe.js`, measured in Chromium 1194 and in node 22 + jsdom 26.


## 1. What the iframe is used for today

Three distinct jobs, all in `src/index.ls`:

| # | site | job |
|---|------|-----|
| A | `proxin`, line 26-31 | `Reflect.ownKeys(iframe.contentWindow)` - snapshot the *pristine* global key set, so `proxin`'s `get` trap can hide host page globals ( `if !attr[k]? => return undefined` ) |
| B | `rsp`, line 126-133 + `_exports`, line 203 | a throwaway realm to `eval` library code into, then diff `Reflect.ownKeys` before / after to learn which globals the library defines ( `fprop` / `prop` ) |
| C | `rsp`, line 134 | inject `preloads` scripts into that realm |

Note what the iframe is **not** used for: the library's real run. `_wrap` builds a
`new Function` and runs it in the **host** realm with `proxin`'s proxy as `window` /
`global` / `globalThis` / `self`. So the iframe is a *probe*, not a sandbox - which is
also why the README says rescope is not a security boundary.

That split is the source of most of the accumulated complexity:

 - every library is executed **twice** ( once in the iframe to name its exports, once for
   real ), so every side effect happens twice, in two different realms;
 - `_exports` has to save / inject / restore `ctx` into the iframe global around each probe
   ( lines 193-198, 203-232 );
 - the probe realm has a different `document`, `location` and `customElements` than the run
   realm, so a library that inspects the DOM at init sees one thing while probing and
   another thing when it actually runs;
 - `"use strict"` has to be stripped from the code before probing, because strict-mode
   top-level `var` never reaches the iframe's global object ( line 216-223, marked TODO );
 - because `_wrap` pre-declares export names as **local** `var`s, `window.foo = ...` and
   bare `foo` are two different slots, which is what the `_rspvarsetcb_` callback machinery
   ( line 253-268 ) exists to paper over.

None of that is inherent to scoping. It is all a consequence of "discover names in realm 1,
run the code in realm 2".


## 2. Is there another realm we can use?

Reviewed and rejected, for the browser:

 - **Worker** - a real separate realm, but no DOM and no synchronous access. Most of the
   libraries rescope targets touch `document` at init.
 - **ShadowRealm** - still not shipped in any stable browser engine, and by design has no
   DOM either. Same conclusion as `doc/figma.md` reached for realms-shim.
 - **`<object>` / `<embed>` / `window.open`** - these *are* nested browsing contexts, i.e.
   an iframe with worse ergonomics ( popups additionally need a user gesture ).
 - **`import(blobURL)`** - module scope is genuinely separate, but top-level bindings of a
   module are unobservable from outside, so nothing can be harvested.
 - **`document.implementation.createHTMLDocument()`** - a new `Document`, not a new realm.
   `defaultView` is `null`.

So: if we need a second realm, the iframe stays. The interesting question is whether we
need one at all.


## 3. Replacing job A - the pristine key set

The pristine key set can be derived from the host window itself, by classifying own
properties instead of comparing against a fresh realm:

```js
for (const k of Object.getOwnPropertyNames(window)) {
  const d = Object.getOwnPropertyDescriptor(window, k);
  if (d.get || d.set) keep(k);              // WebIDL global attribute ( document, location, ... )
  else if (!d.enumerable) keep(k);          // ES intrinsic ( Object, Array, Math, ... )
  else if (isNativeFn(d.value)) keep(k);    // native function value
}
// plus every name on the prototype chain: Window.prototype, WindowProperties, EventTarget.prototype
```

Page globals are, without exception, enumerable data properties holding non-native values -
`var x = 1` at top level gives `{enumerable: true, configurable: false}`, `window.x = 1`
gives `{enumerable: true, configurable: true}` - so they fall out.

Measured against `Reflect.ownKeys(iframe.contentWindow)` in Chromium, on a page polluted
with `window.jQuery`, `window.d3`, `window.myAppState` and a top-level `var`:

```
iframe truth : 1192 keys
heuristic    : 1191 keys
false positives ( host junk wrongly exposed ) : 0
false negatives ( real globals wrongly hidden ) : 1   -> "chrome"
```

`chrome` is the non-standard Chrome extension hook, and is enumerable + non-native, so it
is indistinguishable from a page global; hiding it is arguably correct anyway.

Two bonuses fall out of doing this on the host window: the prototype chain gets included
( today `Reflect.ownKeys(contentWindow)` misses `addEventListener`, `dispatchEvent` and
every other inherited member - they only work today because `proxin`'s `get` checks
`typeof t[k] == 'function'` *before* consulting `attr`, which also means host page
**functions** currently leak into scopes while host page data globals do not ), and there
is no `about:blank` / opaque-origin edge case.


## 4. Replacing job B - discovering exports without a probe realm

The realm exists to answer one question: *which global names did this code define?*
A `with` block over a recording scope answers the same question in the realm the code is
going to run in anyway, so discovery and execution collapse into a single pass:

```js
const fn = new Function('__scope', '__h', 'with(__scope){' + code + '\n' + epilogue + '}');
fn.call(scope, scope, handle);
```

With `has()` returning `true` for ( almost ) everything, every unqualified identifier in
the library body resolves through the scope proxy, so:

 - `var marked = ...` -> the hoisted binding lives in the wrapper function, but the
   *assignment* resolves through the `with` object first, so it lands on the scope. This is
   the same quirk that makes `function f(o){ with(o){ var x = 1 } return x }` return
   `undefined`, and here it is exactly what we want.
 - `window.foo = ...`, `self.foo = ...`, `globalThis.foo = ...` -> the scope proxy answers
   for all of those names, so they are the same slot as bare `foo`. **`_rspvarsetcb_` is
   no longer needed** - the bug it works around cannot happen.
 - `"use strict"` at the head of the library body is no longer a directive ( it sits inside
   a block ), so no source rewriting is needed either. The hack at line 216-223 goes away.

Three capture channels are needed to cover everything the iframe diff covered:

 1. **the proxy's `set` trap** - assignments and implicit globals. Covers the overwhelming
    majority of real libraries.
 2. **a declaration epilogue** - top-level `function` / `class` / `let` / `const` bindings
    are created in the wrapper function's scope, not on the `with` object, so they are
    invisible to the `set` trap. A superset regex scan collects candidate names and appends
    `if (typeof N !== 'undefined' && handle.raw('N') !== N) handle.put('N', N);` per name.
    Over-collection is harmless: a name that is not actually a top-level binding either
    resolves to `undefined` or resolves to the same value the scope would have returned
    anyway, and is skipped. This *gains* coverage over the current design, which cannot see
    top-level `let` / `const` / `class` at all ( they are never own properties of a window ).
 3. **a host-window delta** - in sloppy mode a plain `factory()` call still gets the **real**
    global as `this`, so the classic `}(this, function(){...}))` UMD tail writes
    `this.d3 = ...` onto the host window no matter what we do to the scope chain. Snapshot
    the host window's own property *values* before the run, and after the run harvest and
    restore anything that changed. The current design relies on the same leak - that is what
    `__ret['#k'] = ... || win['#k']` and `win['#k'] = __win['#k']` in `_wrap` are for - it
    just knows the names in advance. Value comparison ( `Object.is`, so `NaN` behaves ) is
    required, not key-presence comparison, otherwise a page that already has `window.d3`
    both hides the export and loses its own global.

One more fix belongs here, unrelated to the iframe but found while testing: **ES intrinsics
must be handed out unwrapped**. `proxin`'s `get` returns `Proxy(fn.bind(win))` for every
function-valued global, including `Object`, `Symbol` and `WeakMap`. Lodash's `getNative`
identity-checks those and throws `Expected a function`; today lodash simply cannot be loaded
by rescope. Binding is only needed for WebIDL operations ( `alert`, `fetch`, `postMessage`,
which throw *Illegal invocation* when detached ); realm intrinsics never need a receiver.


## 5. Measurements

10 real libraries, fresh page per run, Chromium. `old` = current dist ( iframe probe ),
`new` = `dev/noiframe.js`, `raw` = plain `eval` into the page for reference.

| lib | old exports | new exports | old ms | new ms | raw ms |
|-----|-------------|-------------|--------|--------|--------|
| d3@3.5.17 | `d3` | `d3` | 54 | 26 | 8 |
| d3@6.7.0 | `d3` | `d3` | 63 | 35 | 14 |
| jquery@3.7.1 | `$`, `jQuery` | `$`, `jQuery` | 65 | 35 | 14 |
| marked@7.0.0 | `marked` | `marked` | 42 | 16 | 3 |
| lodash@4.17.21 | **throws** | `_` | - | 27 | 9 |
| moment@2.30.1 | `moment` | `moment` | 45 | 25 | 3 |
| vue@2.7.16 | `Vue` | `Vue` | 46 | 20 | 5 |
| jszip@3.10.1 | `JSZip`, `setImmediate`, `clearImmediate` | same + `onmessage` | 59 | 28 | 10 |
| chart.js@4.4.0 | `Chart` | `Chart` | 59 | 29 | 10 |
| highcharts@11.1.0 | `Highcharts` | `Highcharts` | 61 | 33 | 13 |

Load time roughly halves, because the library runs once instead of twice.

Isolation behaviour, on a page that itself defines `window.d3` and `window.appConfig`:

```
two d3 versions side by side : 3.5.17 / 6.7.0, distinct objects, both callable
host window.d3               : untouched
host globals seen by a scope : d3 no, appConfig no
real document / fetch seen   : yes
ctx chaining ( jQuery -> plugin -> call ) : works
```

**node / jsdom**: the current design silently produces **zero exports** there -
`iframe.contentWindow.eval(...)` is a no-op unless jsdom is constructed with
`runScripts: 'dangerously'`, and `_exports` has no way to notice. The same-realm design
needs only `new Function`, and returns `{marked}` with a working `marked.parse` under a
plain `new JSDOM(...)`.

**Runtime cost after init** is the one regression. 20k `d3.scaleLinear()` builds:

```
raw                    32 ms
current _wrap          38 ms   ( +19% )
with + recording proxy 59 ms   ( +85% )
```

Every free identifier inside code created in the `with` block pays a `has` trap call
forever, even for names the trap immediately declines. A plain-object facade
( `Object.create(boundWindowFacade)` instead of a Proxy ) was prototyped to avoid the traps
and measured **worse** - 159 ms - because the resulting megamorphic dictionary lookups
deopt harder than the trap calls. See §7 for how to keep the fast path where it matters.


## 6. What the code looks like afterwards

Deleted outright:

 - both `doc.createElement \iframe` sites and everything that maintains them;
 - `exports` and `_exports` ( ~45 lines ) - there is nothing to probe;
 - `fprop`, and its entry in `doc/spec.md`;
 - the `"use strict"` stripping hack and its TODO;
 - `_rspvarsetcb_` / `var-setter` / `enable-rspvarsetcb` ( ~20 lines );
 - `rsp.prop.legacy` shrinks to the host-window delta scan;
 - `dual-context`'s `f` member ( the iframe-side context object ) and the `dctx.f` plumbing.

Kept unchanged: the registry / cache / semver layer, `load` / `context` sequencing,
`bundle`, and the `event.source` interception in `proxin` ( it is about the proxy, not the
iframe; the same `evt-proxy` applies verbatim ).

`_wrap` survives, but changes role - see below.


## 7. Suggested migration

**Stage 1 - kill job A.** Replace `Reflect.ownKeys(iframe.contentWindow)` in `proxin` with
the descriptor heuristic ( §3 ) plus the prototype chain, and stop wrapping ES intrinsics
( §4, the lodash fix ). Self-contained, no behaviour change intended, immediately removes
one of the two iframes and fixes inherited-member access. Ship as a patch release.

**Stage 2 - kill job B, single pass.** Add the `with` + recording scope path and make
`load` use it. Do **not** keep the probe as a separate first pass: running the library twice
in the *host* realm is worse than what we have today ( doubled side effects on the real
document, `customElements.define` throwing on the second run ). Single pass is both simpler
and safer.

**Stage 3 - restore the fast path.** `lib.prop` is already cached per library id. Once the
names are known - from a previous load, from `rescope.cache`, or from a bundle - the
existing `_wrap` path can be used unchanged, with its cheap local-variable scope and no
`with`. So: `with` for the first load of an unknown library, `_wrap` afterwards. Teaching
`bundle` to emit `prop` alongside `code` ( the TODO already in `src/bundle.ls` ) means
production bundles never take the proxy path at all, which turns §5's +85% into a
first-load-only cost.

Preloads ( job C ) have no equivalent and should either be dropped or redefined as
"libraries loaded into every context first", which the existing `ctx` chaining already does.


## 8. Limitations of the same-realm design

 - **Sloppy mode at top level.** `with` is illegal in strict code, so a library's top-level
   `"use strict"` is neutralised. Directives inside the library's own functions still apply,
   which is where minified bundles put them; but a library that genuinely depends on
   top-level strict semantics would behave differently. The current design has a *variant*
   of this problem already, in the probe pass.
 - **`new Function` still needs `unsafe-eval`.** Unchanged from today.
 - **The host window is touched during a load**, for the duration of the synchronous run,
   by libraries that write through a sloppy `this`. Also unchanged from today, but with the
   iframe gone it is the only place it happens, and is now explicit rather than incidental.
 - **No second `document` / `window`.** `useDelegateLib` in the README - already absent from
   `src/index.ls` - could not be reintroduced without a realm. If running libraries against a
   separate document ever becomes a requirement again, the iframe comes back for that
   feature alone, not for scoping.
 - **`window.parent` and friends** remain reachable, exactly as the README's Limitation
   section says. Removing the iframe changes nothing here: rescope is not a sandbox.
