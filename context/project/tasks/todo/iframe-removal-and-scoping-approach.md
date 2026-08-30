# scoping approaches, and what v5.1.0 left open

Steps 1-5 of `doc/no-iframe.md` shipped in v5.1.0. The reasoning and the measurements behind them
are in that document; the record of doing it is `tasks/done/remove-iframe.md`. What follows is
what was knowingly left.


## other scoping approaches

 - **import ( ESModule )**. For a library shipping ESM, `import('./lib.js?a')` and
   `import('./lib.js?b')` are already two independent instances that never touch `window` -
   verified in `doc/no-iframe.md`. That removes the peek, the `eval` and the `with` in one move,
   for the subset of libraries that can use it. Needs a design pass first: `ctx` semantics change
   ( module exports rather than globals a script leaked ), bare specifiers need an import map, and
   a second instance means a second URL.
 - **commonjs ( via require )**.


## known holes

 - **`delegate` / `useDelegateLib` are documented but do not exist.** README carries them with a
   note saying so; nothing in `src` reads either name. Decide: implement, or drop them from the
   README. What does work for running libraries against another window is passing it to `proxin`
   as `target` ( with its `iframe` ), which is how `@plotdb/block` uses it. This is step 6 of the
   `doc/no-iframe.md` recommendation.
 - **`rsp.dual-context` does not carry the scope mode** ( `src/index.ls:609` - `new proxin!` with
   no `{mode}` ). A caller combining `dual-context` with `scope: 'with'` silently gets a
   default-mode proxin. Small, and a real hole.
 - **Host globals still leak in the default mode.** Only the names in `lib.prop` are blanked, so
   every other global the host page set is reachable from scoped code as a free identifier. Only
   `scope: 'with'` closes it. Do not try to fix it by blanking more names on the window - that
   races with anything the library does asynchronously. Documented as a limitation in the README.
 - **A wrapped library's source map has the wrong columns on line 1.** The map resolves to the
   right file, and line numbers match, but the wrapper's prologue shares the library's first line,
   so every column mapped on that line is off by the prologue's length - which for a minified
   library is the whole file. The shift is known at codegen time, so the fix is mechanical: fetch
   the map, offset the line-1 generated columns, re-encode the VLQ mappings, hand back a `data:`
   URI. Not done because it needs a map parser and encoder in the browser bundle for a payoff
   limited to devtools display. See `tasks/done/sourcemap.md`.


## optional, only if the numbers demand it

 - **Hoisting hot intrinsics out of the `with` object.** Measured at ~15% in `dev/noframe.js` and
   deliberately not shipped: it needs a `has` trap that lies, which brings the proxy invariants and
   the intrinsic-identity hazard into play. Only worth it if `with` run time becomes the thing that
   matters.
