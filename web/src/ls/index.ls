# the landing page. every section runs on a click and nothing runs on load - a demo that has
# already happened by the time you scroll to it shows you nothing, and half of what is worth
# watching here ( how many iframes, what leaks, which line a trace names ) only means something if
# you can see the before as well as the after.
#
# d3 checks for `window.d3` before initing, so this page must never do things like `window.d3 = ...`

registry =
  url: ({url, name, version, path}) ->
    url or "https://unpkg.com/#{name}#{version and "@#version" or ''}#{path and "/#path" or ''}"
  fetch: ({url, name, version, path}) ->
    (res) <- fetch url .then _
    ret = /^https:\/\/unpkg.com\/([^@]+)@([^/]+)\//.exec(res.url) or []
    res.text!then -> {version: ret.2 or version, content: it}

esc = (t) -> "#{if t? => t else ''}".replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

note = (key, text, cls = \text-secondary) ->
  n = view.get key
  n.className = "small mt-2 #cls"
  n.textContent = text

# `_cache` is static and holds the compiled wrapper, so a section that wants a fresh compile - a
# different scope or delivery, a bundle built from scratch - has to clear it.
reset = -> rescope._cache = {}; rescope._ver = {map: {}, list: {}}

frames-now = -> document.querySelectorAll(\iframe).length


# ---- two versions at once -----------------------------------------------------------------------

d3pkg =
  v3: {name: \d3, version: "3", path: "d3.min.js"}
  v4: [
    {url: "/assets/dev/d3.v4.js", async: false}, # test object with url
    "https://d3js.org/d3-format.v2.min.js",      # test plain text
    {name: "d3-array", version: "2", path: "dist/d3-array.min.js"} # test object with module info
    "https://d3js.org/topojson.v2.min.js",
    {url: "https://d3js.org/d3-color.v1.min.js", async: false},
    {url: "https://d3js.org/d3-interpolate.v1.min.js", async: false},
    "https://d3js.org/d3-scale-chromatic.v1.min.js",
    "https://d3js.org/d3-dispatch.v2.min.js",
    "https://d3js.org/d3-quadtree.v2.min.js",
    "https://d3js.org/d3-timer.v2.min.js",
    "https://d3js.org/d3-force.v2.min.js"
  ]

draw = (d3, id) ->
  node = document.getElementById id
  node.innerHTML = ''
  box = node.getBoundingClientRect!
  d3.select "svg##id" .selectAll \circle
    .data [0 to 100].map -> {x: Math.random!, y: Math.random!, r: Math.random!}
    .enter!append \circle
      .attr \cx, -> it.x * box.width
      .attr \cy, -> it.y * box.height
      .attr \r, -> it.r * 20
      .attr \fill, -> \#000

run-versions = ->
  note \versions-note, "loading ..."
  scope = new rescope {registry}
  before = frames-now!
  scope.load d3pkg.v3
    .then -> scope.load d3pkg.v4
    .then -> scope.context d3pkg.v3, ({d3}) -> draw d3, \d3v3; d3.version
    .then (v3) ->
      scope.context d3pkg.v4, ({d3}) -> draw d3, \d3v4; [v3, d3.version]
    .then ([v3, v4]) ->
      note \versions-note, "d3 #v3 on the left, d3 #v4 on the right. \
        the page's own `window.d3` is #{typeof window.d3}. \
        #{frames-now! - before} iframe(s) created.", \text-success
    .catch (e) -> note \versions-note, "#e", \text-danger


# ---- a dialog, from scoped libs -------------------------------------------------------------------

dialog-pkg = [
  \assets/lib/bootstrap.native/main/dist/bootstrap-native.min.js
  {url: \assets/lib/@loadingio/ldquery/main/index.min.js, async: false}
  \assets/lib/ldcover/main/index.min.js
  \assets/lib/ldview/main/index.min.js
  \js/functest.js
]

# ldcover consumes the `.ldcv` markup: it moves the card into an overlay of its own and takes that
# overlay away when dismissed, which leaves either nothing or an empty shell behind. so keep a
# pristine copy from before the first open and put a fresh one in place before every open, rather
# than only when the node has gone - an empty shell passes an `is it there` check and then opens a
# dialog with nothing in it.
dialog-tpl = null
ensure-dialog = ->
  # `:=` - a plain `=` inside a function declares a local in livescript, and this would then
  # capture the template into a variable that dies with the call.
  if !dialog-tpl and (node = document.querySelector \.ldcv) => dialog-tpl := node.cloneNode true
  if !dialog-tpl => return
  for n in document.querySelectorAll \.ldcv => n.remove!
  document.body.appendChild dialog-tpl.cloneNode true

run-dialog = ->
  note \dialog-note, "loading ..."
  ensure-dialog!
  scope = new rescope {registry}
  scope.load dialog-pkg
    # `functest` is scoped too, and it calls `ldcover` - which only exists inside this context
    .then -> scope.context dialog-pkg, ({functest}) -> functest!
    .then -> note \dialog-note, "opened from inside the scope. the page itself still has no \
      `ldcover` ( #{typeof window.ldcover} ).", \text-success
    .catch (e) -> note \dialog-note, "#e", \text-danger


# ---- loader test ----------------------------------------------------------------------------------

# what a loaded lib should be able to do, for the ones we know something about
loader-check = (ctx) ->
  if ctx.JSZip? =>
    zip = new ctx.JSZip!
    zip.file \hello.txt, "world"
    hdr = setTimeout (-> console.error "jszip generation timeout."), 2000
    zip.generate-async {type: \blob}
      .finally -> clearTimeout hdr
      .then -> console.log "jszip generate succeeded."
      .catch -> console.error "jszip generate failed."
  if ctx.message-test =>
    Promise.resolve!
      .then -> ctx.message-test.fire!
      .then -> debounce 1000
      .then -> ctx.message-test.revoke!
      .then -> debounce 1000
      .then -> ctx.message-test.fire!

loader-result = (text, ok) ->
  n = view.get \lt-result
  for c in <[border-danger text-danger border-success text-success]> => n.classList.remove c
  if ok? => n.classList.add (if ok => \border-success else \border-danger),
                           (if ok => \text-success else \text-danger)
  n.textContent = text

loader-load = (url) ->
  loader-result "loading ..."
  scope = new rescope {registry}
  scope.load url.split(' ').filter(->it).map(-> {url: it.trim!})
    .then (ctx) ->
      loader-result "success with:\n\n" + [" - #k" for k of ctx].join('\n'), true
      loader-check ctx
    .catch (e) ->
      loader-result "error:\n\n#e", false
      throw e


# ---- error line -------------------------------------------------------------------------------

src-cache = {}
source = (url) ->
  if src-cache[url] => return Promise.resolve that
  fetch url .then (-> it.text!) .then (t) -> src-cache[url] = t.split '\n'

# one entry per stack line. `url` is null for frames we can't place - `eval at <anonymous>` frames
# from the wrapper, for instance, which is exactly what a missing sourceURL looks like.
el-frames = (e) ->
  ((if e and e.stack => e.stack else "#e") + '').split '\n'
    .filter -> it.trim!
    .map (line) ->
      m = /[(@ ]([^\s()]+?):(\d+):(\d+)\)?\s*$/.exec line
      {text: line.trim!, url: (if m => m.1 else null), line: (if m => +m.2 else 0), col: (if m => +m.3 else 0)}

# match on the file name, not the whole url: devtools prints a `sourceURL` verbatim, so a scoped
# frame carries the url rescope was given ( often a path ) while a plain script always reports an
# absolute one. the line and the column are the part that has to agree.
name-of = (u) -> "#u".split('?').0.split('/').slice(-1).0

el-lib-frame = (fs, url) ->
  target = name-of url
  for f in fs => if f.url and name-of(f.url) == target => return f
  null

el-excerpt = (lines, f) ->
  [a, b] = [Math.max(1, f.line - 3), Math.min(lines.length, f.line + 3)]
  ret = "\n\n<span class=\"text-secondary\">#{esc name-of f.url}, line #{f.line}, column #{f.col}:</span>\n"
  for i from a to b
    text = lines[i - 1]
    if text? and text.length > 160 => text = text.substr(0, 160) + " …"
    cls = if i == f.line => \text-danger else \text-secondary
    ret += "<span class=\"#cls\">#{"    #i".slice(-4)} | #{esc text}</span>\n"
  # the minified sample is one long line, so the line number alone says nothing. point at the column.
  if f.line >= a and f.line <= b and f.col > 0 and f.col < 160 =>
    ret += "<span class=\"text-danger\">#{Array(7 + f.col).join(' ')}^</span>"
  ret

el-fmt-frame = (x, hit) ->
  cls = if hit and x == hit => \text-danger else \text-secondary
  "<span class=\"#cls\">#{esc x.text}</span>"

el-render = (key, r, url) ->
  node = view.get key
  if !r.error =>
    node.innerHTML = "<span class=\"text-success\">no error.</span>\n\n#{esc(r.note or '')}"
    return Promise.resolve null
  f = el-lib-frame (fs = el-frames r.error), url
  head = "<b>#{esc String(r.error)}</b>\n<span class=\"text-secondary\">threw while #{r.phase}</span>\n\n"
  body = [(el-fmt-frame x, f) for x in fs].join '\n'
  (if f => source(url).then (lines) -> el-excerpt lines, f else Promise.resolve '')
    .then (ex) ->
      node.innerHTML = head + body + ex
      f

el-scoped = ({url, call}) ->
  reset!
  scope = new rescope do
    registry: ({url}) -> url
    scope: view.get(\el-scope).value
    delivery: view.get(\el-delivery).value
  scope.load [{url}]
    .then (ctx) ->
      if !call => return {note: "loaded. exports: #{[k for k of ctx].join ', '}"}
      if !(lib = ctx[call]) or typeof(lib.run) != \function =>
        return {note: "loaded, but there is no `#call.run()` in the context to call."}
      Promise.resolve!
        .then -> lib.run!
        .then -> {note: "`#call.run()` returned without throwing."}
        .catch (e) -> {error: e, phase: "calling `#call.run()`"}
    .catch (e) -> {error: e, phase: \loading}

# the reference: the same file as an ordinary script element. a library throwing while loading
# never reaches a `.catch` here - it goes to window.onerror, same as any other page script.
el-plain = ({url, call}) ->
  new Promise (res) ->
    caught = null
    # window 'error' is global, so match the file: another run in flight must not be able to hand
    # us its error as this file's reference.
    handler = (e) -> if !caught and (e.filename or '').index-of(url.split('?')[0]) >= 0 => caught := e
    window.addEventListener \error, handler
    node = document.createElement \script
    done = ->
      window.removeEventListener \error, handler
      node.remove!
      if caught => return res {error: (caught.error or caught), phase: \loading}
      if !call => return res {note: "loaded."}
      if !(lib = window[call]) or typeof(lib.run) != \function =>
        return res {note: "loaded, but `window.#call.run()` is not there to call."}
      Promise.resolve!
        .then -> lib.run!
        .then -> res {note: "`#call.run()` returned without throwing."}
        .catch (e) -> res {error: e, phase: "calling `#call.run()`"}
      .then -> if call => delete window[call]
    node.onload = done
    node.onerror = done
    node.src = url
    document.body.appendChild node

el-verdict = (a, b) ->
  node = view.get \el-verdict
  node.classList.remove \border-success, \border-danger, \text-success, \text-danger
  [cls, text] = switch
  | !a and !b => [\text-secondary, "neither run reported a frame in the library's own file."]
  | !a => [\text-danger, "the scoped run never named the library's file. the plain one pointed at line #{b.line}. that is what a lost sourceURL looks like."]
  | !b => [\text-secondary, "only the scoped run named the library's file ( line #{a.line}, column #{a.col} ). nothing to compare it against."]
  | a.line == b.line and a.col == b.col => [\text-success, "same place both ways: line #{a.line}, column #{a.col}."]
  | a.line == b.line and a.line == 1 => [\text-secondary, "same line ( 1 ), different column: #{a.col} scoped, #{b.col} plain - the wrapper's prologue has to share line 1 with the library to keep every other line honest, so line 1's columns carry its length."]
  | a.line == b.line => [\text-danger, "same line ( #{a.line} ), different column: #{a.col} scoped, #{b.col} plain."]
  | otherwise => [\text-danger, "different place: line #{a.line}:#{a.col} scoped, #{b.line}:#{b.col} plain - every line the library reports is off by #{a.line - b.line}."]
  # the one difference that is expected: a sourceURL is printed verbatim, so it stays whatever url
  # rescope was handed, while a plain script always reports an absolute one.
  if a and b and a.url != b.url => text += " ( named `#{a.url}` scoped and `#{b.url}` plain - a sourceURL is shown as given. )"
  node.classList.add cls
  node.classList.add (if cls == \text-success => \border-success else if cls == \text-danger => \border-danger else \border)
  node.textContent = text

# the two panes above are our own reading of `e.stack`. this runs the sample once more with nothing
# catching it anywhere, so the throw reaches the browser: `filename` / `lineno` / `colno` on the
# error event are the engine's own attribution, not ours, and the console gets the same entry. we
# listen without calling preventDefault, so it is still reported as uncaught.
el-really-throw = ({url, call}) ->
  new Promise (res) ->
    done = false
    hdr = null
    on-error = null
    on-reject = null
    finish = (r) ->
      if done => return
      done := true
      clearTimeout hdr
      window.removeEventListener \error, on-error
      window.removeEventListener \unhandledrejection, on-reject
      res r
    on-error := (e) -> finish {filename: e.filename, line: e.lineno, col: e.colno}
    on-reject := (e) ->
      frame = (((e.reason and e.reason.stack) or '').split('\n')[1] or '').trim!
      finish {kind: 'unhandled rejection', frame: frame}
    window.addEventListener \error, on-error
    window.addEventListener \unhandledrejection, on-reject
    hdr := setTimeout (-> finish null), 4000
    scope = new rescope do
      registry: ({url}) -> url
      scope: view.get(\el-scope).value
      delivery: view.get(\el-delivery).value
    # a library that throws while loading rejects, and nobody here is listening to that promise
    if !call => scope.load [{url}]
    else scope.load [{url}] .then (ctx) ->
      # `setTimeout` puts the call outside the promise chain, so a throw from it is the real thing
      # rather than something a `.then` would swallow
      if ctx[call] and typeof(ctx[call].run) == \function => setTimeout (-> ctx[call].run!), 0
      else finish null

# one run at a time: both runs write into the same two panes, so overlapping them would interleave
# the output. a click during a run is remembered rather than dropped - the last thing you clicked
# is what you get.
el-last = null
el-running = false
el-pending = null
el-run = (o) ->
  if el-running => return el-pending := o
  el-running := true
  el-last := o
  view.get(\el-url).value = o.url
  view.get(\el-call).value = o.call or ''
  view.get(\el-scoped).textContent = view.get(\el-plain).textContent = 'running ...'
  view.get(\el-verdict).textContent = 'running ...'
  Promise.all [
    el-scoped(o).then (r) -> el-render \el-scoped, r, o.url
    el-plain(o).then (r) -> el-render \el-plain, r, o.url
  ] .then ([a, b]) -> el-verdict a, b
    .then ->
      n = view.get \el-thrown
      if !view.get(\el-throw).checked => return n.textContent = ''
      n.className = "small mb-2 text-secondary"
      n.textContent = "running it again with nothing catching it ..."
      el-really-throw(o).then (r) ->
        # deliberately not red: green and red in this section mean "the two traces agreed" or
        # "they did not", and a throw landing in the console is the expected outcome here.
        n.className = "small mb-2 text-secondary"
        n.textContent =
          if !r => "left alone, it did not throw."
          else if r.filename? =>
            "thrown for real. the browser reported it at #{r.filename}:#{r.line}:#{r.col} - \
             the same entry is in the console, and those numbers are the engine's, not ours."
          else "thrown for real, as an #{r.kind}: #{r.frame} - the same entry is in the console."
    .finally ->
      el-running := false
      if el-pending =>
        o2 = el-pending
        el-pending := null
        el-run o2


# ---- bundle round trip --------------------------------------------------------------------------

bundle-libs = [
  {name: \d3, version: "^4.0.0", path: "build/d3.min.js"}
  {name: \ldview, version: "~0.1.0", path: "dist/index.min.js"}
  {name: \proxise, version: "^0.1.4", path: "dist/proxise.min.js"}
]

run-bundle = ->
  n = view.get \bundle-result
  n.textContent = "building the bundle ( this fetches each library once ) ..."
  reset!
  (new rescope {registry}).bundle bundle-libs
    .then (code) ->
      reset!
      # this is what a page including the bundle does. `window.eval` rather than a bare `eval`:
      # a direct eval would run the bundle in this function's scope instead of the global one.
      window.eval code
      scope = new rescope {registry}
      before = document.querySelectorAll(\iframe).length
      scope.load bundle-libs .then (ctx) ->
        n.textContent = """
        bundle: #{Math.round(code.length / 1024)} kb, export names recorded: #{/"prop":\[/.test(code)}

        loaded from it, in a fresh scope:
        #{[" - #k" for k of ctx].join '\n'}

        iframes created while loading: #{document.querySelectorAll(\iframe).length - before}
        ( the export names came with the bundle, so nothing had to peek )
        """
    .catch (e) -> n.textContent = "error:\n\n#e"


# ---- nav ------------------------------------------------------------------------------------------

spy = ->
  links = Array::slice.call document.querySelectorAll('.rsp-nav a')
  seen = links.map (a) -> document.querySelector a.getAttribute \href
  cb = (entries) ->
    for e in entries => if e.is-intersecting =>
      idx = seen.index-of e.target
      for a, i in links => a.classList.toggle \active, i == idx
  obs = new IntersectionObserver cb, {rootMargin: "0px 0px -70% 0px"}
  for s in seen => if s => obs.observe s


# the keys are `ld` attribute values, so they have to be quoted: an unquoted dashed key in
# livescript comes out camelCased, and `run-versions` would never match `ld="run-versions"`.
view = new ldview do
  root: document.body
  action:
    click:
      'run-versions': -> run-versions!
      'run-dialog': -> run-dialog!
      'run-bundle': -> run-bundle!
      'lt-sample': ({node}) ->
        view.get(\lt-url).value = node.dataset.url
        loader-load node.dataset.url
      'lt-load': -> if (url = view.get(\lt-url).value) => loader-load url
      'el-sample': ({node}) -> el-run {url: node.dataset.url, call: node.dataset.call}
      'el-load': -> if (url = view.get(\el-url).value) => el-run {url: url, call: view.get(\el-call).value}
      'el-rerun': -> if el-last => el-run el-last
    change:
      'el-scope': -> if el-last => el-run el-last
      'el-delivery': -> if el-last => el-run el-last

spy!
ensure-dialog!
