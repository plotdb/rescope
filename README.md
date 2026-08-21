# @plotdb/rescope

Load and scope any external JavaScript and reload scope on demand.

For example, assume here are the list of js url we'd like to load, which kept in `libs` variable:

 - assets/lib/bootstrap.native/main/bootstrap-native.min.js
 - assets/lib/bootstrap.ldui/main/bootstrap.ldui.min.js
 - assets/lib/@loadingio/ldquery/main/ldq.min.js
 - assets/lib/ldcover/main/ldcv.min.js
 - assets/lib/ldview/main/ldview.min.js


We can load all above js files with rescope, with a resolveed context containing all imported variables:

    scope = new rescope!
    scope.init!
      .then -> scope.load libs
      .then (context) -> myfunc(context)


Once loaded, we can access context for those libraries:

    myfunc = ->
      scope.context libs, (context) ->
        {ldcover, ld$} = context
        # now ldcover and ld$ are available ...
        ldcv = new ldcover do
          root: ld$.find('.ldcv', 0)

This is useful when you need the same library with different versions:

    d3 = do
      v3: 'https://d3js.org/d3.v3.min.js'
      v6: 'https://d3js.org/d3.v6.min.js'

    scope = new rescope!
    scope.load d3.v6
      .then -> scope.load d3.v3
      .then -> scope.context d3.v6, ({d3}) -> /* run v6 code with local d3 variable ... */
      .then -> scope.context d3.v3, ({d3}) -> /* run v3 code with local d3 variable ... */

While it's possible to load context into window object, we may run into trouble with concurrent overlapped context calls, so the context is always available as local variables. Always rely on the passed `context` object to access required libraries.


## Semantic URL / Module Loading

Instead of plain URLs, you can also request a library with its name, version and relative path. For example, 

    {url: "assets/lib/@loadingio/ldquery/main/ldq.min.js"}

can be represented as:

    {name: "@loadingio/ldquery", version: "main", path: "ldq.min.js"}

This abstracts the location of libraries and thus can be customized if needed with `registry` option:

    new rescope({registry: function(opt) {  return opt.name + opt.version + opt.path; });

Return promise from a registry function call for a directly content resolving - in this case you should return an object in following form:

 - `version`: exact version of the return object.
 - `content`: content for the requested resource.

`registry` can also be an object with `url` and optionally `fetch` as a member function. Check `@plotdb/block` and `@plotdb/registry` for advanced registry usage.


where registry, if provided, should be a function:

 - accepting an object with following members:
   - `name`: module name
   - `version`: module version
   - `path`: relative path to the requested file
 - and return corresponding url based on those members, for example:
   - `return ["https://jsdelivr.net/npm", opt.name, opt.version, opt.path].join('/');`


## Customized Context

Libraries can be loaded correctly in one single `load` invocation because `rescope` take care of the scope issue in `load` stage for us.

However,

 - if we need `load` in separated stages, we may run into trouble of missing dependencies to libraries loaded earlier.
 - Additionally, we may want to load libraries into a specific context stored before.

To keep track of the context loaded , we pass an optional object directly into `load`:

    scope.load libs, (ctx = {}) .then -> ...

once loaded, the empty object `ctx` above will be filled with the loaded objects from libraries in `libs`. This `ctx` can then be used in turn in the following `load` calls:

    ctx = {}
    scope.load libs1, ctx
      .then -> scope.load libs2, ctx
      .then -> scope.load libs3, ctx
      .then -> ...

in this manner, following libraries `libs2` and `libs3` can be loaded with the context of previous loaded libraries `libs1` without them being written in 1 load call.


## Asynchronous Script Loading

By default all script are loaded asynchronously. You can force them loaded in synchronous manner, by extending URL into object with following options:

 - url: URL to load
 - async: load asynchronously if set to true. default true.


## Delegate Window

By default `rescope` uses iframe window to preload libraries and peek variables they defined. The iframe is called delegate window. Apparently behavior for the host and the delegate is not the same.

Since v5.1.0 this window is created only when something actually has to be peeked, so it never appears for libraries loaded from a bundle ( their export names are already recorded ) nor under `scope: "with"`. `proxin` no longer creates one at all.

**Note**: `delegate` and `useDelegateLib` below are not implemented in the current source - `proxin`
reads `iframe` / `target`, and nothing reads either of these names. They are kept here as the record
of an intended API; treat the rest of this section as a design note rather than as documentation of
what the code does today. What does work for running libraries against another window is passing
that window to `proxin` as `target` ( with its `iframe`, if it has one ), which is how
`@plotdb/block` uses it.

We specify an option `delegate` and set it to false to tell `@plotdb/rescope` that this instance doesn't use delegate ( itself is a delegate ):

    new rescope({delegate: false});

Additionally, you can also run code within delegate's context, by setting 'useDelegateLib' to `true`:

    new resope({useDelegateLib: true})

This will only work when `delegate` is set to true ( which is by default ). With `useDelegateLib` set to true, all libraries loaded with the rescope object will work under a separated window and document object. Please note, it won't work as expected when cross refer libraries between two different global scope, so don't mix up libraries in different global scope.

Even with `useDelegateLib` set to true, you can still enter host context by setting the second parameter to `false` when calling `context`:

    res = new rescope({useDelegateLib: true});
    res.context("some-lib", false, function() { ... });

## Scoping Mode

By default, `rescope` learns which names a library defines by running it once in a separate window
( the peek ), then pre-declares those names in the wrapper it builds around the library. Set
`scope` to `with` to skip that step entirely:

    new rescope({scope: "with"});

The library then runs inside `with(scope)`, so every free identifier - including its own top level
`var` declarations - resolves through the scope proxy. Nothing has to be discovered in advance, so
no extra window is created and the library runs once instead of twice. It also isolates better:
the host page's own globals stay invisible to the library, and `window.parent` no longer reaches
the real window.

The cost is library run time. Every function inside a `with` block loses fast variable lookup for
its whole lifetime - a `moment` formatting loop measured about 3x slower. Use it where load time
and isolation matter more than throughput, or where no window can be created at all.

## Delivery

By default the wrapper around a library is compiled with `eval`. Set `delivery` to `script` to have
it handed to a script element through a blob URL instead:

    new rescope({delivery: "script"});

The page's Content Security Policy then sees a script load rather than `eval`. Note this only
covers the wrapper: to run with no `'unsafe-eval'` grant at all, the peek has to go too, so combine
it with `scope: "with"` or with a bundle that carries `prop` ( see below ). With that combination
rescope was verified to run under `script-src 'nonce-…' 'strict-dynamic'` and under
`script-src 'self' 'unsafe-inline' blob:`.

Loading becomes asynchronous in this mode, and if the policy blocks the blob the load rejects with
a message saying which grant is missing.

## Caching

Instead of downloading libraries everytime, you can also precache libraries into a single js file.

After downloading all necessary libraries, get js for caching by:

    ret = rescope.cacheDump();

the return value `ret` is the runnable JS string which insert cached libraries into `rescope` class. Or, manually inject cache by calling:

    rescope.cache(
      "some-url",
      {
        code: "code",
        vars: [list of string for available variable names in dependency]
      }
    )

## Bundling

To bundle, load `bundle.js` and use `bundle` API:

    rsp = new rescop(...)
    rsp.bundle [{ ... }] .then (code) ->

The bundle records each library's export names alongside its code. A page loading the bundle
therefore already knows them, and skips the peek: it creates no extra window and runs each library
once rather than twice.


## Polyfills

use `prejs` when constructing for inserting pre-required JS into both host and delegate environment:

    new rescope({prejs: ["https://...", ...]});



## Note

 - This is not meant to be used for sandboxing or for security reason. `@plotdb/rescope` never prevent any scripts from accessing document, and all scripts are still run in the main thread.
 - some libraries such as `d3` may check and use object with the name they are going to use if exists. Thus we always have to restore context in case of disrupt their initialization process.
 - rescope mimics `window` object but there are still limitations. If a library declares a variable by `window.somevar` but accessing it with `somevar`, the wrapper keeps the two in sync for names it knows about ( the `_rspvarsetcb_` mechanism ), so this works for a library's own exports; a name it never declared and rescope never saw can still come out undefined. Under `scope: "with"` the question does not arise, since both spellings resolve through the same proxy.
 - in the default mode a library can still see the host page's own globals as free identifiers - rescope only hides the names it is loading. `scope: "with"` hides all of them. See `doc/no-iframe.md`.


## Limitation

rescope uses proxy object to replace global objects such as `global`, `self`, `window` and `this`, so accessing `global` in library will actually be accessing the proxy object.

However, there are still ways to get the actual window object, such as `window.parent` or `event.source`.


### Event.source

`event.source` in `message` event can be used to determine the source window of an event::

    global.fire("message", "hello");
    global.on("message", function(event) { event.source });

Some libraries check `event.source` before using it like:

    if(event.source == global) { ... }

This will fail since `event.source` (the real global) is not the same with `global` (the proxy object), since proxy object should never be equivalent to the proxied object.

We intercepte `event` to patch `source` by overriding `onmessage`, `addEventListener` and `removeEventListener`, however `onmessage` is native bridge and can't be run within proxy getter, so we solve it by adding a `queueMicrotask` in order to set `onmessage` in the correct realm, which introduced asynchronous behavior of onmessage. Since it's for messages which is also asynchronous actions, this won't cause too much trouble.


### window.parent

In the default mode this is still open: `window` inside the wrapper is a local variable holding the
proxy, but `window.parent` is answered by the real window, so a library that walks up from there
reaches the host.

`scope: "with"` closes it. Nothing declares `window` in that mode, so the proxy answers for the
name itself, and it answers `window`, `self`, `globalThis`, `global`, `top`, `parent` and `frames`
with itself. `window.parent === window` inside a scoped library, and the test suite pins that.


## Tests

    ./build && npm test

Runs the suite in `test/` against `dist/` - six real libraries through every scoping and delivery
mode, in chromium and under jsdom. See `test/README.md`.


## TODO

 - Browser compatibility check
   - works in all major browsers ( latest Chrome, Firefox, Safari, Opera, Edge )
   - doesn't work in IE11
 - Performance benchmark


## Resources

 - ShadowRealm may help in what we want to do:
   - https://github.com/tc39/proposal-shadowrealm/
 - Realm, predecessor of ShadowRealm
   - Note: Realms proposal has been superceded by the ShadowRealm Proposal
   - https://github.com/tc39/proposal-realms/#ecmascript-spec-proposal-for-realms-api
   - https://github.com/Agoric/realms-shim
     - based on their current statue: OBSOLETE, INSECURE, NOT RECOMMENDED FOR USE
   - https://www.figma.com/blog/how-we-built-the-figma-plugin-system/
 - also check how Vue does its own scoping in template:
   - https://github.com/vuejs/vue/blob/v2.6.10/src/core/instance/proxy.js#L9


## License 

MIT
