# tests

    ./build && npm test

Runs against `dist/`, so build first. `npm test -- --node` or `--browser` runs one half.

The browser half drives a chromium through `playwright-core`, which does not download one. It looks
in `PLAYWRIGHT_BROWSERS_PATH`, in `~/.cache/ms-playwright` and in the usual system locations;
`RESCOPE_CHROMIUM=/path/to/chrome` overrides. With no browser it skips rather than fails, so the
node half still means something on a machine without one.

## what it covers

The libraries are real and minified, from `node_modules` - the point is surviving what these
actually do. Each one has to export something *and still work* afterwards: markdown rendered, a zip
generated ( which is the only thing that exercises jszip's `message` plumbing ), a scale evaluated,
a component mounted.

 - **modes** - every library through `default`, `scope: 'with'` and `delivery: 'script'`, checking
   the host page's own globals survive and the wrapper leaks nothing onto `window`. `with` mode is
   pinned at zero iframes.
 - **bundle** - build a bundle, load it in a fresh instance, and assert it records the export names
   and creates no iframe.
 - **debuggability** - a library throwing from its line 4 has to report line 4 of its own file, the
   same place a plain `<script src>` reports. And a library that throws while loading must leave the
   host page's globals as it found them.
 - **isolation** - what scoped code can see of the host page, in both modes.
 - **load order** - one `load` call with two libraries, the second reading the first's export as a
   bare name - the web demo's own shape, where `functest.js` calls `ldcover`. Each wrapper's
   prologue only declares the names the context held when it was compiled, so compiling a batch
   before any of it has run leaves every lib blind to the ones before it.
 - **versions** - two versions of one library live at once, behaving like their own version.
 - **native key set** - the classification that replaced the pristine-iframe key list, checked both
   ways against a real iframe: no platform name missed, nothing the page defined mistaken for one.
 - **content security policy** - the same page under four policies, against four combinations of
   `scope` and `delivery`. This is where it shows that `delivery: 'script'` is not enough on its
   own: the peek has an `eval` of its own, so getting off `'unsafe-eval'` needs `scope: 'with'` or
   a bundle carrying `prop`.
 - **node** - `dist/node.js` against jsdom, which hands out its interface objects through getters
   that only answer for a real window - a different set of quirks from a browser.

## layout

    run.js          entry point
    node.js         the jsdom half
    browser.js      the browser half: assertions live here
    page/index.html the harness the browser half calls into
    fixtures/       small libraries with known behaviour ( a known throw line, a probe, a
                    provider/consumer pair for load order )
    lib/            server, chromium lookup, library paths, pass/fail reporting

Findings are recorded as `note` rather than an assertion where they are known limitations rather
than guarantees - `doc/no-iframe.md` has the reasoning behind them.
