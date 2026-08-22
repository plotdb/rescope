# task: let a scoped library find the script it came from

Written as a plan before the work, and kept as the record of it - `what shipped` below is the only
part added afterwards, so the plan can be read against what actually happened. Whoever picks this
up should not need the conversation it came out of. The reasoning is here because most of the cost
of this change was in the decisions, not the code.

    repo    plotdb/rescope
    branch  claude/design-remove-iframe-xz5xar
    version 5.1.0 ( unreleased - fold this in, do not open a new version )
    state   shipped. default on, `scriptElement: false` to turn it off
    verify  ./build && npm test        -> 96 passed, 0 failed ( 77 before this task )


## the problem

A library loaded through rescope never becomes a `<script>` element. It is fetched, wrapped and
evaluated. So every way a library has of asking "where did I come from?" answers wrong:

    document.currentScript              // null - we are inside an eval
    document.getElementsByTagName('script')[last]   // whatever the page happens to end with

`amcharts-core.js` is the case that made this visible ( it is in `web/static/assets/loader-tester/`,
and `/loader-tester/` loads it ). It derives its webpack `publicPath` from exactly those two:

    i.p = (function(){ if (document.currentScript) return document.currentScript;
                       var t = document.getElementsByTagName("script"); return t[t.length-1] })().src

Neither half answers, so it throws before it exports anything:

 - in the peek window there is no `<script>` at all -> `cannot read 'src' of undefined`
 - in the host document the last script is usually the page's own inline one, whose `src` is `""`
   -> the regex returns null -> `cannot read '1' of null`

This is not a regression from dropping the iframes; `master` fails identically.

`document.currentScript` is the API that is actually meant for this question. The
last-script-tag idiom is a pre-`currentScript` workaround and is wrong by construction - it assumes
the library was loaded by whatever script is currently last, which stops being true the moment
anything is `async`, `defer` or injected. We answer the right one, and the wrong one falls out for
free.


## the shape

For the duration of a library's run, make it look like it was loaded by a script element of its own:

 - a `<script type="application/rescope-marker" src="<the library's url>" data-rescope="<lib id>">`
   appended to `document.body`. The type is not a JS MIME type, so the browser neither fetches nor
   executes it - that is a spec guarantee, not a trick - while `.src` and `getAttribute('src')` both
   answer with the library's real URL, and `document.scripts` includes it like any other script.
 - `document.currentScript` defined as an own property of the document, returning that element,
   for the length of the synchronous run only.

Default on. `scriptElement: false` turns it off.


## why default on

This was the contested part, so the argument is written out.

 - **Libraries that never ask cannot tell the difference.** The override is only observable from
   code running synchronously inside the library's own execution.
 - **`null` is not a neutral answer.** It means "not running from a script element", and libraries
   do not quietly give up on it - they fall through to the broken heuristic or crash. The honest
   answer is "this library came from `<url>`", which is what we hand them.
 - **rescope already lies in this exact way**, and has to: `window`, `global`, `globalThis`,
   `self` and `event.source` are all substituted so scoped code believes it is running normally.
   `currentScript` is an item missing from that list, not a new category.
 - **Opt-in would reach the wrong people.** Someone hitting this sees "library X does not load
   under rescope"; they have no reason to go looking for an option named after an API they never
   called.

The one way default-on is worse than the status quo: a library written as
`if (document.currentScript) { A } else { B }`, whose `B` finds something real on the host page -
scanning for `script[data-api-key]` and finding a config tag the page put there, say. Under rescope
the page has no tag for that library, so `B` succeeding is unlikely. `scriptElement: false` is the
escape hatch, and is expected to stay unused.


## the decisions, and why

Each of these was argued; the reason matters more than the choice.

 - **The node goes into the real document, not a `DocumentFragment`.** A fragment keeps
   `currentScript.parentNode.insertBefore(x, me)` from throwing, but the node lands nowhere: the
   library thinks it worked and nothing happened. Silent-wrong is harder to debug than a throw. It
   would also make one path through the document behave differently from every other -
   `document.body.appendChild(script)` in scoped code already inserts and executes for real.
 - **Straight into `document.body`, not a container `<div>` of our own.** The only reason we keep
   the node at all is so `parentNode` is faithful; wrapping it puts an anonymous div where a real
   script would have had `body` or `head`. Grouping is cosmetic, and the nodes cluster at the end
   of body anyway since we always append. Identification comes from the `type` and `data-rescope`
   attributes.
 - **The node stays; only the override is unwound.** `currentScript` is a page-wide slot that
   belongs to the host, and after a real script finishes it goes back to `null` - leaving a fake
   one in place would lie to every later script on the page. The node is the opposite: a real
   script element stays in the document forever, and the
   `var me = document.currentScript; setTimeout(function(){ me.parentNode.insertBefore(x, me) })`
   pattern needs it to still be attached later. Removing it would break the very pattern the node
   exists for.
 - **One node per URL, shared between scopes.** Never mutate an existing node's `src`: a library
   that captured the element would find its own URL swapped out from under it by the next load. A
   real page loading the same script twice would have two tags, but nothing can observe that
   difference.
 - **No URL, no node and no override.** A library handed to rescope as raw `code` has no origin to
   claim, and inventing one is worse than `null`.
 - **The override brackets `gen.apply` only.** Not the fetch ( async, so the fake would be visible
   to the page ), and not the blob script that `delivery: 'script'` runs to *define* the wrapper
   ( the library's body has not run yet at that point ).
 - **The peek gets the same treatment, in the peek iframe's document.** The peek runs the library
   before the wrapper does, so it hits this first - and the peek window is where the
   `cannot read 'src' of undefined` comes from. Invisible to the host either way.
 - **Restores belong in `finally`**, same as every other restore in `load`. A library that throws
   must not leave a fake `currentScript` behind.
 - **`document.body` may not exist yet** if rescope runs from `<head>`; fall back to
   `documentElement`.


## verified by hand, in Chrome

Do not re-derive these; do re-check them if the approach changes.

 - `Document.prototype.currentScript` is a configurable accessor, so an own property on the
   document instance shadows it and `delete` puts it back. `document.currentScript` is `null`
   again afterwards, with no own property left behind. jsdom behaves identically - checked, since
   the node half of the suite runs on it.
 - A scoped library reads the simulated `currentScript.src` in all three of `default`, `with` and
   `delivery: 'script'`.
 - **amcharts loads and exports `am4core` in all three modes** with the override alone - no node in
   the DOM at all. The node is for the other patterns, not for amcharts.
 - A `<script>` with a non-JS `type` and a real `src` produces no network request at all.
 - `insertBefore` against a `DocumentFragment` parent succeeds and the inserted node never reaches
   the document - which is why the fragment option was rejected rather than assumed broken.

Not verified: Firefox and Safari. The configurable accessor is what WebIDL specifies, so they
should agree, but nobody has run it.


## what this does not fix

 - `currentScript.getAttribute('data-api-key')` and friends: there is no tag, so there are no
   attributes to hand back. Nothing can fix this.
 - `currentScript.type` reads back as `application/rescope-marker`. If a library is ever found
   checking it, give that one library a node with a normal type and an own `src` property instead
   ( no `src` attribute means it is never fetched either ) - per library, not globally.
 - A library that inserts a `<script src>` next to itself gets a real, executing script in the
   **host** global scope. That leak is not new - `document.body.appendChild` already does it, since
   `document` is the real document by design - but this makes one more path to it.
 - A library that scans script tags to decide "am I already loaded?" will see its own URL and may
   bail out. This is the one thing the leftover node costs us. Known, accepted.


## what shipped

Everything below the line held; nothing in the plan had to be revised except one thing the plan did
not anticipate, in **`_ref`**: a library loaded by `name` / `version` / `path` has no `url` of its
own - the registry's answer was computed and thrown away - so there was nothing for the element to
carry. `_ref` now records it as `lib.resolved-url`. Deliberately *not* `lib.url`: `rsp.id` reads
`url`, and giving a by-name library a url-shaped id would change how the version machinery dedupes
it.

The gate passed cleanly: with this on by default, the whole suite's output is byte-identical to the
run before it, port numbers aside - the six real libraries, the iframe counts, and all four CSP
policies. The marker element trips no policy, which follows from it never being fetched.

Verified in the browser against the real thing, not just the fixtures: `amcharts-core.js` from
`/loader-tester/` loads and exports `am4core` in `default`, `with` and `delivery: 'script'`, and
still fails with `scriptElement: false`. The demo page at `/` is unchanged - both d3 versions draw,
the dialog opens - and now carries one marker per library it loads, which reads as a useful record
of what is scoped on the page.

Two things worth knowing that came out of the implementation:

 - **jsdom's peek window is a degraded context**: no `window`, no `document`, and top level `var`s
   do not attach to it. In the default mode it is therefore the peek's answer that reaches the
   caller there, not the wrapper's, so the node half asserts this in `with` mode only and prints a
   note. The browser half covers all three. That context is also shared with the harness's own
   scope - a fixture declaring a common identifier collides with whatever the runner declared,
   which is why `whereami.js` uses `__d`.
 - the element carries cross-origin urls ( `https://d3js.org/...` ) with no CORS or CSP
   consequence, again because nothing is ever fetched.


## the plan ( as written before the work )

1. `src/index.ls`: the element and the override, bracketing `gen.apply` in `load`, and the same
   around the peek's `iw.eval` in `_exports`. `scriptElement` option next to `scope` and
   `delivery`. Guard everything with `doc` and a `try` - node without jsdom has no document.
2. `./build` ( `dist/` is committed; rebuild in the same commit ).
3. Tests: a probe fixture reporting what it sees of `currentScript` and the last script tag, across
   `default` / `with` / `script`; an amcharts-shaped regression using the same publicPath idiom
   ( the real amcharts is 1MB and lives in `web/`, so the suite gets a small stand-in ); the node
   half too, since jsdom was checked and works.
4. **The gate:** run the six real libraries ( marked, d3, jszip, lodash, moment, vue ) with this on
   and confirm nothing about their behaviour changes. Any change gets reported before anything is
   pushed. The CSP group will also say whether a marker element trips a policy - it should not,
   since nothing is fetched.
5. Docs: `doc/spec.md` for the option, a section in `doc/no-iframe.md` for the reasoning and the
   trade-offs, the amcharts entry in `web/static/assets/loader-tester/README.md` rewritten as
   solved, `CHANGELOG.md` under the unreleased 5.1.0, and this note updated to say what shipped.


## backing out

The whole thing is two brackets in `load` and `_exports`. `scriptElement: false` disables it
without removing it. If the six-library gate turns up anything, the cheap retreat is to flip the
default to off and keep the mechanism - not to fall back to the marker-only or fragment variants,
both of which were considered and rejected above.
