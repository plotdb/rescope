# Going iframe-free

An analysis of what the iframes in `src/index.ls` actually buy us, and whether
the same behavior can be obtained without them.

## 1. Where iframes are used today

There are exactly two, with completely different jobs.

### 1.1 `proxin` — the shape oracle ( `src/index.ls:26-31` )

```ls
@iframe = ifr = doc.createElement \iframe
...
attr = Object.fromEntries(Reflect.ownKeys(@iframe.contentWindow).map -> [it, true])
```

Note the proxy target is `o.target or win` — **the real host window**, not the
iframe. Every value a scoped library sees comes from the host window. The
iframe contributes *nothing but a list of key names*: a snapshot of the own
keys of a pristine `Window`.

`attr` is then used for two decisions:

- `get`: `if !attr[k]? => return undefined` — a global that is not part of the
  platform surface is invisible to scoped code. This is the isolation boundary.
- `set`: `if attr[k] => t[k] = v` — writes to platform properties
  ( `location`, `onerror`, ... ) pass through to the real window; everything
  else is diverted into the scope object `@lc`.

Cost: one iframe **per `proxin` instance**, i.e. per `load()` call unless the
caller reuses a `dual-context`. They are appended to `document.body` and never
removed.

### 1.2 `rsp` — the discovery sandbox ( `src/index.ls:126-136`, `_exports` )

```ls
iw.eval((lib.code or '').replace('"use strict";',''))
```

`_exports` snapshots `Reflect.ownKeys(iw)`, evaluates the library in the iframe
realm, diffs the keys, and keeps the new ones as `lib.prop` / `lib.fprop`. The
name list is then fed to `_wrap`, which declares one local `var` per name so
that the *real* execution ( in the host realm, inside `new Function` ) can both
shadow and collect them.

So every library is **executed twice**: once to learn its export names, once for
real. All load-time side effects — timers, network calls, event listeners, DOM
writes — happen twice, the first time against a throwaway document.

## 2. What the iframe is really needed for

This is the crux, and it is much narrower than it looks.

In `load`, `ctx = px.ctx!` — **`ctx` and the proxy's internal `@lc` are the same
object**. Therefore anything a library assigns to the fake global
( `window.X = ...`, `globalThis.X = ...`, `self.X = ...`, `this.X = ...` inside a
UMD wrapper ) already lands in `ctx` through the `set` trap, with no help from
`prop`, `fprop` or the iframe whatsoever.

What the `set` trap *cannot* see is a **declaration**: `var X = 1`,
`function X(){}` at the top level of the file. Inside `new Function` those are
function-local, invisible to everyone. In a real global — an iframe — they
become own properties of the window, which is exactly what the key diff picks
up.

> The iframe exists to recover top-level declarations, plus to pre-declare local
> names so that "assign `window.X`, then read bare `X`" keeps working
> ( the `_rspvarsetcb_` machinery, and `web/static/assets/loader-tester/var-from-window.js` ).

Two consequences worth stating:

- `let` / `const` / `class` at the top level are **already unsupported** — they
  live in the declarative record, not on the global object, so the key diff
  never sees them.
- What real libraries actually do is assignment, not declaration. Scanning the
  bundled test corpus for depth-0 declarations:

  | file | size | depth-0 declarations | exports via |
  |---|---|---|---|
  | `vis.js` / `vis.min.js` | 1.8MB / 674KB | *none* | UMD `this.vis = ...` |
  | `amcharts-core.js` | 1MB | *none* | `window.am4core = ...` |
  | `zingchart.min.js` | 864KB | 9 minifier-lifted internals | `window.ZC`, `window.zingchart` |
  | `var-from-window.js` | — | *none* | `window.OBJ = ...`, then reads bare `OBJ` |

  Every one of these is assignment-based, i.e. already covered by the `set`
  trap. The iframe is paying a large fixed cost for a rare case.

## 3. Replacing the shape oracle ( 1.1 )

The requirement is only "a set of key names describing a pristine window".
Options:

1. **Snapshot at library-evaluation time.** `rescope.js` records
   `Reflect.ownKeys(win)` when it is first evaluated. Anything the page adds
   later is correctly excluded. Anything added *before* rescope loads leaks.
2. **Platform-property filter.** Keep only own properties that look
   platform-provided: accessor properties whose getter stringifies as
   `[native code]`, functions that stringify as `[native code]`, plus a short
   allowlist for the namespace objects and primitives
   ( `Math`, `JSON`, `Reflect`, `Intl`, `WebAssembly`, `NaN`, `Infinity`, `undefined` ).
   Bound functions also stringify as native code, so a page global such as
   `window.$ = document.querySelector.bind(document)` would slip through.
3. **Static list.** Brittle across engines and versions; only useful as a floor.

**Recommendation: 1 ∩ 2, with 3 as a floor**, and keep the existing `o.iframe`
escape hatch for callers that want a genuinely pristine oracle. The list is
per-realm, not per-instance, so it should be computed **once** and shared —
which by itself removes N-1 of the N iframes even if nothing else changes.

Note the current `get` trap consults `attr` only *after* the
`typeof(t[k]) == \function` branch, so host **function** globals already leak
into scoped code today. Isolation was never airtight; a snapshot-based oracle
does not make it meaningfully worse, and reordering the two branches would
actually tighten it.

## 4. Replacing the discovery sandbox ( 1.2 )

### 4.1 Rejected alternatives

- **Worker.** A real fresh realm, but no `document` / `window`; a browser
  library either takes a different UMD branch or throws outright. Also async and
  blob-URL / CSP sensitive.
- **ShadowRealm.** Exactly the right primitive, still not shipped. It also has
  no DOM by design, so it inherits the Worker problem.
- **`document.implementation.createHTMLDocument()`.** No browsing context, no
  global, scripts never run.
- **Evaluate in the host global with save/restore.** Works ( `var` bindings do
  become window properties ), but pollutes the live page for the duration, runs
  the library's side effects against the real document, and `var` bindings are
  non-configurable — they can be reset to `undefined` but never deleted, so
  `'X' in window` stays true forever. Strictly worse than the iframe.
- **Full parse ( acorn et al. ).** Accurate, but adds a parser to a library
  whose whole `dist/index.min.js` is 9KB, and costs a full parse of every
  megabyte-sized bundle.

### 4.2 The `with` + Proxy route

Run the library body inside `with(scope) { ... }` where `scope` is the proxin
proxy with `has: -> true`. Every free identifier — read *and* write — resolves
through the proxy. Verified semantics ( Node 22, sloppy mode ):

| construct at top level of the library | result inside `with` |
|---|---|
| `window.X = v` / `this.X = v` / `self.X = v` | captured by `set` trap |
| `X = v` ( implicit global ) | **captured** — today it silently hits the real window |
| `var X = v` | **captured** — the declaration hoists out, but the assignment resolves through the with-scope |
| `var X;` then `X = v` later | captured |
| `function X(){}` | resolves correctly inside the body ( Annex B block binding sits *inside* the with scope ), but is **not** captured |
| `class X{}`, `let`, `const` | resolve correctly, **not** captured |
| read bare `X` after `window.X = v` | **works, with no `_rspvarsetcb_` machinery at all** |

Two details are mandatory:

- `get` must return the proxy itself for `window` / `self` / `globalThis` /
  `global`, otherwise `window` resolves through the with-scope to
  `attr['window']` → the *real* window ( or `undefined` ), and
  `window.X = ...` throws. This is a bug the current code hides only because
  `_wrap` declares `var window = scope` outside any `with`.
- `get` must return `undefined` for `Symbol.unscopables`.

That leaves a single gap: names introduced by a top-level
`function` / `class` / `let` / `const` declaration. Those need a **depth-0
declaration scan** — a ~150-line brace/string/regex-aware scanner, no parse
tree. A prototype ran over the corpus above at 30–60ms for 0.7–1.8MB files and
found nothing to declare except zingchart's nine minifier-lifted `var`s. The
scan result feeds two places: names to emit into `__ret`, and names for which
`has` should return **false** so they resolve to the real declaration.
Incidentally this would make `let` / `const` / `class` exports work, which the
iframe never could.

### 4.3 The no-`with` route

`with` is what makes "assign `window.X`, read bare `X`" work for names unknown
ahead of time, but it has a real cost: every global access from every function
defined inside the library keeps going through the proxy for the lifetime of the
library, and `with` blocks defeat several engine optimizations. For a charting
library in a hot render loop that is not free.

A cheaper variant keeps the current fast local-`var` wrapper and derives the
name list statically:

- depth-0 declarations, from the same scanner, plus
- assignment targets found by scanning for `window.X =`, `window['X'] =`,
  `self.X =`, `globalThis.X =` at any depth.

Over-declaring is harmless. On the corpus above this recovers `ZC`,
`zingchart`, `am4core`, `OBJ` — every name the iframe pass would have found —
while UMD `this.X = ...` exports keep flowing through the `set` trap as they do
today. It misses only the case where the global name is computed
( `window[nameFromVariable] = ...` ) *and* read back as a bare identifier in the
same file.

### 4.4 Best of both

The two routes are not exclusive, and rescope already has the cache/bundle
machinery to exploit that:

- first, unknown load → `with` wrapper. Correct in every case above, one
  execution instead of two.
- once the export names are known — from `rescope.cache`, from a
  `cacheDump()` / `bundle()` artifact, or from an explicit `exports: [...]` in
  the lib spec — → fast local-`var` wrapper, no `with`, no proxy in the hot
  path.

Production traffic, which is bundled, gets the fast path; the slow path is the
first uncached load.

## 5. Recommended staging

| stage | change | risk | payoff |
|---|---|---|---|
| 0 | share one shape-oracle iframe across all `proxin` instances; drop it on `destroy()` | none | removes N-1 iframes and a leak |
| 1 | shape oracle from snapshot ∩ native-descriptor filter; keep `o.iframe` as opt-in | low | `proxin` becomes iframe-free |
| 2 | add the depth-0 scanner + `with` wrapper behind `discover: \iframe` / `\scan` / `\auto`, defaulting to `\iframe` | medium | single execution, `let`/`const` support |
| 3 | dev-mode cross-check: run both discovery paths and warn on any name mismatch | none | turns the corpus in `web/static/assets/loader-tester` into a real migration test |
| 4 | flip the default to `\scan`, keep `\iframe` for `compat: true` | — | fully iframe-free |

Add `exports: [...]` to the lib spec ( `doc/spec.md` ) as part of stage 2 so a
caller who knows the global name can bypass discovery entirely.

## 6. Why it is worth doing

- **No `frame-src` / `child-src` requirement.** Today rescope cannot run under a
  CSP that forbids frames, nor inside an already-sandboxed iframe without
  `allow-same-origin`.
- **One execution per library instead of two.** Halves load-time side effects:
  no duplicated network requests, timers, or listeners.
- **No unbounded iframe growth.** One `proxin` per `load()` today, never
  removed.
- **Node / SSR.** `dist/node.js` currently needs a jsdom document that can
  actually create a browsing context for `iframe.contentWindow`.
- **Fewer moving parts.** `_exports`, `fprop`, the `dual-context.f` channel and
  the `_rspvarsetcb_` callback mechanism all exist to serve the iframe pass;
  under the `with` route most of them disappear.

## 7. What we lose

- The shape oracle stops being perfectly pristine. Host globals that exist
  *before* rescope loads and look native can leak into scoped code.
- The scanner is a heuristic. A missed declaration means a missing export rather
  than a crash, but it is a silent failure — hence stage 3.
- The `with` route trades load-time cost for steady-state cost. Needs a
  benchmark on a real chart library before flipping the default.
- Anything that already fails will keep failing: libraries that look for their
  own `<script>` tag ( amcharts ) or reach the real window through
  `window.parent` are orthogonal to this change.

## 8. Side findings

Unrelated to the iframe question, noticed while reading:

- `src/index.ls:240` — `@_exports libs, idx + 1` drops the `ctx` argument, so
  the recursion runs with a fresh `{}`. Only `libs[0]`'s exports are persisted
  into `dual-context.f`; within-pass dependency resolution still works because
  the values stay on `iw` until the unwind, but cross-`load` context is lost for
  every library after the first.
- `src/index.ls:134` — `preloads` is injected with `innerHTML`. Scripts inserted
  via `innerHTML` never execute, so the option is a no-op.
- `README.md:157` documents a `prejs` option that does not exist in the source.
- `README.md:112-124` documents `delegate` / `useDelegateLib`; neither appears in
  v5 source.
- `get` returns host functions before the `attr` check ( `src/index.ls:71` vs
  `:87` ), so host function globals are visible to scoped code.
