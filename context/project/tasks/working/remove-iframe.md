# task: get rescope off its iframes

Handoff note. Written for whoever picks this up next - you should not need the conversation this
came out of.

    repo    plotdb/rescope
    branch  claude/design-remove-iframe-xz5xar
    version 5.1.0 ( was 5.0.18 )
    state   steps 1-5 shipped and green. step 6 and the ESM path are open.
    verify  ./build && npm test        -> 65 passed, 0 failed


## the problem this task started from

`rescope` loads third party JS and runs it against a substituted global, so several versions of a
library can coexist and none of them pollute the host page. It used to need iframes for two
unrelated things:

 - **`proxin`** made one just to read `Reflect.ownKeys` of a pristine window - a list of "names that
   belong to the platform", used to decide what a scoped library may see and where its assignments
   go. One per `load` call, so the count grew with usage.
 - **`rsp`** made one to *run each library a second time* and diff the window before and after, to
   learn which names it defines. That list drives the wrapper `_wrap` builds.

The second one meant every library executed twice, with every side effect twice, and everything it
produced belonged to a foreign realm.


## what shipped

Full reasoning and measurements: `doc/no-iframe.md`. Short version:

1. **`proxin` no longer makes an iframe.** `proxin.native-keys(win)` classifies the target window's
   own property descriptors instead - accessors and non-enumerable own properties are the
   platform's, an enumerable own property holding a `[native code]` function is a WebIDL operation,
   anything else the page put there. Six libraries went 18 iframes -> 6.
2. **The peek window is lazy** ( `rsp.prototype.ifr` ) and **`bundle` records `prop`**, so a page
   loading a bundle knows the export names already and never peeks. Six libraries from a bundle:
   zero iframes, each library run once.
3. **Wrappers carry `//# sourceURL` and are compiled with an indirect eval** rather than the
   `Function` constructor. A library throwing from its line 4 now reports its own `file:4:9`,
   identical to a plain `<script src>`.
4. **`delivery: 'script'`** hands the wrapper to a script element through a blob, so CSP sees a
   script load rather than `eval`.
5. **`scope: 'with'`** runs the library inside `with(scope)`: no peek, no iframe at all, and host
   globals stop leaking into scoped code. Opt-in, because it costs ~3x library run time.

Bugs fixed on the way, all with tests: intrinsics handed out as bound wrappers ( `global.Object ===
Object` was false, which is why **lodash could not load and clobbered the host's `window._`** );
restores that a throwing library skipped; `__win` leaking onto the real window; `_exports` dropping
`ctx` in its recursive call; `Reflect.get` refused by jsdom for a foreign receiver; a trailing
`//# sourceMappingURL` comment swallowing everything the wrapper appended.


## where things are

    src/index.ls        all of it. proxin ( native-keys, the traps ), rsp ( ifr, exports,
                        _exports, _wrap, _wrap-with, _gen, load ), rsp.compile / source-url
    src/bundle.ls       records `prop`
    dist/               built output. `./build` regenerates; it is committed, so rebuild before
                        committing source changes
    doc/no-iframe.md    why. every number in it was measured, options considered and rejected
                        included. read this before changing the design
    doc/spec.md         lib fields and constructor options
    test/               the suite. test/README.md says what it covers
    dev/noframe.js      the standalone prototype the measurements came from. not used at run time
    CHANGELOG.md        v5.1.0


## invariants - things that look harmless to change and are not

Each of these cost a debugging session. They are commented at their site too.

 - **The wrapper prologue must stay on ONE line**, ending on the same line the library's code
   starts. A newline in front shifts every line number the library reports in a stack trace.
 - **A newline must follow the library's code before anything appended.** Minified files routinely
   end with `//# sourceMappingURL=...` and no trailing newline; anything on that line is inside the
   comment. This produced an unterminated `try` and a lost `return`. A newline *after* is free - the
   library's lines are already counted.
 - **Do not compile the wrapper with `new Function`.** It prepends its own header and shifts every
   reported line by two. `rsp.compile` uses `win.eval` ( an indirect eval, so global scope ).
 - **Intrinsics must be returned raw from the `get` trap**, never as a bound wrapper. Libraries
   fingerprint their global with `global.Object === Object`; failing it sends them to
   `Function('return this')()`, i.e. the real window. This is the lodash bug.
 - **One proxy identity.** `event.source` is forged to *the* proxy the library sees. Stacking a
   second proxy layer over `proxin` breaks jszip's `setImmediate`, which compares
   `event.source === global` and then hangs forever rather than failing.
 - **`has` may not return false for a non-configurable own property of the target.** `document`,
   `location`, `top`, `window` are non-configurable on a real window, so they cannot be hidden from
   the `with` object while the proxy target is that window.
 - **Restores belong in `finally`.** A throwing library used to leave the host page's globals
   blanked.
 - **`prop-cached` is what keeps a bundled page at zero iframes.** `exports` returns early when
   every lib has it, so nothing calls `ifr!`. Any new call to `ifr!` outside the peek path silently
   costs that property - and the test asserts it, so you will hear about it.


## what is open

In the order I would take them.

1. **`delegate` / `useDelegateLib`.** README documents them; **nothing in `src` reads either name**.
   Decide: implement, or delete them from the README. They are the one remaining case that
   genuinely wants a second document, so this is a product decision, not a cleanup. Flagged in
   README already so nobody is misled meanwhile.
2. **The ESModule path** ( `TODO.md` ). For a library shipping ESM, `import('./lib.js?a')` and
   `import('./lib.js?b')` are already two independent instances that never touch `window` -
   verified. That removes the peek, the `eval` and the `with` in one move, for the subset of
   libraries that can use it. `ctx` semantics change ( module exports rather than leaked globals ),
   so it needs a design pass first.
3. **`rsp.dual-context` does not carry the scope mode** ( `src/index.ls:509` - `new proxin!` with no
   `{mode}` ). A caller using `dual-context` together with `scope: 'with'` gets a default-mode
   proxin. Small, but it is a real hole.
4. **Host globals still leak in the default mode.** Only `scope: 'with'` closes it, since free
   identifiers otherwise resolve to the real global scope. Do not try to fix this by blanking more
   names on the window - that is racy with anything the library does asynchronously.
5. **Optional:** hoisting hot intrinsics out of the `with` object. Measured at ~15% in
   `dev/noframe.js`, deliberately not shipped - it needs a `has` trap that lies, which brings the
   invariants above into play. Only worth it if `with` run time becomes the thing that matters.


## deliberate, do not "fix"

 - `scope: 'with'` is **not** the default and should not become one without a decision: ~3x library
   run time ( a `moment` format loop: 106ms plain, 95ms default mode, 291ms `with` ).
 - The default mode still creates one peek iframe per rescope instance for un-bundled libraries.
   That is the design, not an oversight - the test prints it as a note rather than asserting it.
 - `dist/` is committed on purpose. Rebuild it in the same commit as any source change.


## testing notes

`./build && npm test`; `--node` / `--browser` for one half. The browser half needs a chromium and
skips ( does not fail ) without one; `RESCOPE_CHROMIUM=/path/to/chrome` overrides.

Two traps if you extend the suite:

 - **`page.evaluate` runs in the devtools context, which is not subject to the page's CSP.** A
   `new Function` probe there always reports "allowed". Measure that at page load instead - the
   existing suite does.
 - **Do not name a page-level helper after a `[Replaceable]` window property** ( `frames`, `length`,
   `self` … ). Declaring `function frames(){}` replaces the platform's property, and rescope then
   correctly treats the name as page-defined - which reads as a failure but is the feature working.

jsdom is a genuinely different environment from a browser here: it implements interface objects as
getters that only answer for a real window. Keep the node half in the loop when touching the traps.
