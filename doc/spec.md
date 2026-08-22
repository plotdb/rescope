# rescope v4

lib spec

 - `id`: from `rescope.id` based on url or name / version / path
 - `url`: lib url. optional, `name` / `version` / `path` must be set if omitted
 - `name`, `version`, `path`: lib information
 - `gen(proxy, ctx, window)`: function to retrieve lib exports.
 - `prop`: object with members exported from this lib. in a bundle this is serialized as a list of
   names; `rescope.cache` turns it back into the object form and marks the entry so the peek is
   skipped for it.
 - `resolvedUrl`: where the registry sent a lib that was named rather than given a `url`. recorded
   by `_ref` so the script element ( `scriptElement` below ) has a url to carry. kept apart from
   `url` because `rescope.id` reads `url` and would derive a different id from it.
 - `prop-cached`: set by `rescope.cache` when `prop` arrived with the entry rather than being
   discovered. `_exports` skips such a lib entirely - it is the flag that keeps a bundled page from
   creating the peek window at all.
 - `prop-initing`: the lib has names but has not been run yet, so `load` must compile and run it.
 - `fprop`: hash with members named as values exported from this lib.
   - derived in iframe context, should not be used in host window.
   - should not be used outside `_exports`.
 - `code`: source code for this library.

declarative version ( used in dependency declaration )

    id, url, name, version, path, gen

bundled version ( what `bundle` writes and `rescope.cache` reads )

    url, id, ns, name, version, path, code, prop


rescope options ( `new rescope({...})` )

 - `registry`: where a lib's `name` / `version` / `path` resolves to. string prefix, function, or
   an object with `url` and optionally `fetch`.
 - `preloads`: scripts to put in the peek window before anything is peeked there.
 - `scope`: `default` pre-declares the names in `prop` in the wrapper, which is why the peek has to
   find them first. `with` runs the lib inside `with(scope)` instead, so nothing has to be known in
   advance: no peek, no window, better isolation, slower library run time.
 - `delivery`: `eval` compiles the wrapper, `script` hands it to a script element through a blob so
   a page's CSP sees a script load rather than `eval`. asynchronous.
 - `scriptElement`: on by default. while a library runs, `document.currentScript` answers with a
   `<script>` element carrying that library's own url, so a library asking where it was loaded
   from gets a true answer instead of `null`. the element is inert - its `type` is not a JS MIME
   type, so the browser neither fetches nor executes it - and it stays in the document afterwards,
   as a real script element would. `false` turns it off.

see doc/no-iframe.md for what each of these costs and why they exist.
