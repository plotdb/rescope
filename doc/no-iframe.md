# Going iframe-free

An analysis of where `@plotdb/rescope` depends on iframes, whether those
dependencies are essential, and what a no-iframe design looks like.

All measurements below were taken in headless Chromium against
`d3@6.7.0`, `vue@2.7.16`, `jquery@3.7.1`, `lodash@4.17.21`, `marked@7.0.0`
and `moment@2.30.1`, plus `jsdom@26` for the node build.


## 1. Where the iframes are

There are exactly two, and they serve unrelated purposes.

### 1.1 `proxin` - the "what is a real window property" oracle

`src/index.ls:26`

    @iframe = ifr = doc.createElement \iframe
    ...
    attr = Object.fromEntries(Reflect.ownKeys(@iframe.contentWindow).map -> [it, true])

The iframe is used for one thing only: to obtain the own-key set of a
*pristine* window. `attr` then decides, in the `get` / `set` traps, whether a
name is a genuine browser global ( pass through to the real window ) or a
library-defined one ( keep it in the local context `@lc` ). The host window
can't be used directly because the page may already have added globals of its
own, which would then be treated as browser API.

Note that a `proxin` is created per `load` call, and neither `proxin` nor `rsp`
ever removes its iframe from `document.body`.

### 1.2 `rsp` - the export-discovery realm

`src/index.ls:126` and `_exports` at `src/index.ls:200`

    att1 = ...ownKeys(iw)...
    iw.eval((lib.code or '').replace('"use strict";',''))
    att2 = ...ownKeys(iw)...
    # difference => lib.fprop / lib.prop

This is the load-bearing one. A classic script's exports are whatever it
added to the global object, so rescope runs the library in a throwaway global
and diffs the keys. The names are then fed to `_wrap`, which declares them as
locals ( `var #k` ) and collects them into `__ret`.

The consequence is that **every library is executed twice**: once in the
iframe to find the names, once in the host realm to produce the values.


## 2. Why this is worth removing

Not just aesthetics - the iframe design has concrete costs today.

 - **The node build does not work.** In jsdom, `iframe.contentWindow.eval`
   does not populate the iframe's global object ( scripts are not run unless
   `runScripts` is set ), so the key diff is always empty:

       marked -> []        # expected ['marked']
       lodash -> []        # expected ['_']
       moment -> ['moment']

   `moment` survives only by accident: its UMD assigns onto the scope object at
   run time, so `proxin`'s `set` trap catches it even with an empty `prop` list.
   That accident is the seed of the design in section 3.

 - **`rsp()` requires `document.body`.** Constructing a rescope instance before
   `<body>` exists throws.

 - **Unbounded iframe accumulation.** One per `load`, never removed.

 - **Double execution.** ~2x the parse+run cost of every library, and any
   load-time side effect happens twice ( in two different documents ).

 - **`"use strict"` is stripped for the discovery pass only** ( `src/index.ls:225` ),
   so the code analysed is not the code that runs. Stripping the first
   `"use strict";` in a *minified* bundle can land inside a nested function and
   change its semantics.

 - **`_wrap` has no `try`/`finally`.** It sets `win[k] = undefined` before
   running a library and restores afterwards; if the library throws, the real
   window keeps the `undefined` own property permanently, which then breaks
   unrelated later loads. Observed with lodash: after one failed load, a
   subsequent, otherwise-working load of the same library also fails.


## 3. The no-iframe design

### 3.1 Replace the discovery realm with `with` + the existing `set` trap

`proxin` already records every global write into `@lc`. What it misses are the
identifier forms that don't go through the proxy:

 - `var x = 1` at top level - assignment resolves lexically, not on the scope object
 - `x = 1` with no declaration - reaches the real global
 - unqualified *reads* of names the library set through `window.x =`
   ( the reason `_rspvarsetcb_` exists )

A `with` block routes all three through the proxy. Wrap the library as:

    var window, global, globalThis, self;
    window = global = globalThis = self = scope;
    with (scope) {
      <library code>
    }

with the scope proxy exposing `has: () => true`, so every free identifier in
the library body resolves against it.

One thing must be handled explicitly. Under `with`, the with-object shadows
the wrapper's own `var window = scope`, so `window` / `self` / `globalThis` /
`global` resolve through `proxin.get`, which returns the *real* window for
those ( they are in `attr` ). Every modern UMD header sniffs exactly those
names, so without a fix d3, Vue, jQuery and lodash all install themselves onto
the real window. The `get` trap must return the scope itself for those four
names.

With that in place, `Object.keys(px.ctx())` after the run *is* the export list.
Discovery and execution become one pass, and the iframe is gone.

### 3.2 `function` and `class` declarations need a static scan

Inside a `with` block, `function f(){}` is not hoisted onto the scope object,
so the `set` trap never sees it. This is the one form the iframe diff catches
and the proxy alone does not.

A depth-0 scan for `function NAME` / `class NAME` ( skipping strings, comments
and anything nested ) is enough. Those names go into an "unscopable" set -
`has` returns `false` for them, so they resolve to the real binding - and a
trailing `__ret['NAME'] = NAME` inside the same block collects them. Any
internal name used by the wrapper ( `__ret` ) must be in that set too,
otherwise the with-object shadows it and the capture throws.

### 3.3 Replace `proxin`'s pristine-key oracle with a descriptor heuristic

A name is a native window property if its own descriptor on the host window is

 - non-enumerable ( intrinsics and all WebIDL interface objects - 745 of 964 ), or
 - an accessor ( the `Window` IDL attributes and the `on*` handlers - 219 ), or
 - a data property holding a function whose source is `[native code]`
   ( `fetch`, `setTimeout`, `atob`, ... )

Measured against a real iframe's key set on a page carrying four page-defined
globals ( `var`, function declaration, `window.x =`, and a loaded jQuery ):

    false negatives: 0
    false positives: 1

The single false positive is a page-defined *enumerable accessor*
( `Object.defineProperty(window, 'x', {get, enumerable: true}` ) - rare enough
to accept, and it degrades exactly the way the current code does when the page
defines a global before rescope loads.

The set never changes, so it can be computed once per realm and cached; today
each `proxin` pays for a fresh iframe.


## 4. Measured results

A prototype combining 3.1 + 3.3 ( no iframes at all ), each library loaded
cold in a fresh page:

| lib | exports | smoke test | leaked to `window` |
|---|---|---|---|
| d3 | `d3` | `d3.max([1,5,3])` = 5 | none |
| vue | `Vue` | `Vue.extend` is a function | none |
| jquery | `$`, `jQuery` | `$('<div><b/></div>').find('b').length` = 1 | none |
| lodash | `_` | `_.chunk([1,2,3,4],2)` = `[[1,2],[3,4]]` | none |
| marked | `marked` | `marked.parse('# hi')` = `<h1>hi</h1>` | none |
| moment | `moment` | `moment('2020-01-02').format(...)` ok | none |

Export names match the iframe diff exactly on all six. Two independent scopes
of the same library stay isolated ( patching `$.fn` in one is invisible in the
other ).

Declaration-form coverage, proposed vs. today:

| form | iframe diff ( today ) | `with` + scan ( proposed ) |
|---|---|---|
| `var x = 1` | yes | yes |
| `x = 1` | yes | yes |
| `window.x = 1` | yes | yes |
| `this.x = 1` | yes | yes |
| `function f(){}` | yes | yes ( via 3.2 ) |
| `class C {}` | **no** | yes ( via 3.2 ) |
| `let` / `const` | no | no |

`lodash` is a strict improvement: it fails to load today ( `TypeError: Expected
a function` ) and loads correctly under `with`. The cause is `_wrap`'s
declaration style - lodash's `freeSelf` probe compares `self.Object === Object`,
and without `with`, the bare `Object` is the real intrinsic while `self.Object`
is the proxy-wrapped one, so the probe fails and lodash falls back to
`Function('return this')()`, i.e. the real window.


## 5. Costs

**Load time** drops, since the library runs once instead of twice
( `rsp.load` vs. a single `with` run, warm HTTP cache ):

| lib | today | proposed |
|---|---|---|
| d3 | 84 ms | 20 ms |
| jquery | 58 ms | 16 ms |
| vue | 35 ms | 10 ms |
| marked | 34 ms | 10 ms |
| moment | 31 ms | 7 ms |

**Run time** is where `with` costs something. Identifiers inside the library
body - and inside every closure it creates - resolve through the proxy's `has`
trap, which defeats scope-analysis optimisation:

| workload | today | proposed |
|---|---|---|
| `marked.parse` on a ~60-block document | 0.46 ms | 0.97 ms |
| d3 `max`+`sum`+`groups` over 5000 rows | 0.25 ms | 0.25 ms |
| jQuery `find` over a 50-node fragment | 0.03 ms | 0.03 ms |

DOM-bound work is unaffected; compute-bound pure-JS work can be ~2x slower.
Mitigation, if it matters: `_wrap`'s current `var`-declaration form is still
available once the export names are known, so a lib can opt into a
`with`-free wrapper - at the cost of the fidelity that makes lodash work.
Bundles ( `src/bundle.ls` ) can bake the discovered `prop` list in at build
time, so the choice can be made per library rather than globally.


## 6. Options that do not work

 - **Discover in the host realm and clean up afterwards.** Running the library
   twice in one realm breaks anything with realm-global side effects -
   `customElements.define` throws `NotSupportedError` on the second pass
   ( verified ). The iframe's separate registry is what makes double execution
   survivable today; removing the iframe means removing the second execution.

 - **ShadowRealm.** Would be the right primitive, but it is not in any browser,
   and it has no DOM access, which rescope's callers require.

 - **Worker / Blob worker.** No DOM.

 - **Static analysis only** ( acorn or similar ). Misses everything a UMD
   header computes at run time, and adds more bytes than the whole library.

 - **ES modules via `import(blobURL)`.** Genuinely good where an ESM build
   exists - module scope *is* the isolation rescope wants, and the namespace
   object *is* the export list, with no realm tricks. It doesn't replace the
   classic-script path ( a lib that writes to `window` still collides, and the
   registry must serve ESM ), but it's a clean second backend, and matches the
   `import` item already in `TODO.md`.


## 7. Suggested order of work

1. Fix `_wrap` to restore `win[k]` in a `finally`. Independent bug, cheap.
2. Cache the pristine-key set module-wide instead of per `proxin`. Removes
   most of the iframes with no behaviour change.
3. Replace that set with the descriptor heuristic ( 3.3 ). `proxin`'s iframe
   is gone; `rsp` still constructs before `<body>` exists.
4. Add the `with` wrapper ( 3.1 + 3.2 ) behind an option, run it against the
   library corpus, then flip the default. `_exports`, `rsp.iframe`, the
   `"use strict"` strip and `_rspvarsetcb_` all become dead code.
5. Optionally add the ESM backend as a separate `load` path.
