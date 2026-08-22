# the point of this page: a scoped library is compiled into a wrapper and evaluated, so the only
# thing that keeps its stack traces honest is the `//# sourceURL` rescope appends and the shape of
# the wrapper around it ( see doc/no-iframe.md ). run a thrower both ways and compare.

esc = (t) -> "#{if t? => t else ''}".replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

abs = (url) -> (new URL url, location.href).href

src-cache = {}
source = (url) ->
  if src-cache[url] => return Promise.resolve that
  fetch url .then (-> it.text!) .then (t) -> src-cache[url] = t.split '\n'

# one entry per stack line. `url` is null for frames we can't place - `eval at <anonymous>` frames
# from the wrapper, for instance, which is exactly what a missing sourceURL looks like.
frames = (e) ->
  ((if e and e.stack => e.stack else "#e") + '').split '\n'
    .filter -> it.trim!
    .map (line) ->
      m = /[(@ ]([^\s()]+?):(\d+):(\d+)\)?\s*$/.exec line
      {text: line.trim!, url: (if m => m.1 else null), line: (if m => +m.2 else 0), col: (if m => +m.3 else 0)}

# match on the file name, not the whole url: devtools prints a `sourceURL` verbatim, so a scoped
# frame carries the url rescope was given ( often a path ) while a plain script always reports an
# absolute one. the line and the column are the part that has to agree.
name-of = (u) -> "#u".split('?').0.split('/').slice(-1).0

lib-frame = (fs, url) ->
  target = name-of url
  for f in fs => if f.url and name-of(f.url) == target => return f
  null

excerpt = (lines, f) ->
  [a, b] = [Math.max(1, f.line - 3), Math.min(lines.length, f.line + 3)]
  name = f.url.split('/').slice(-1).0
  ret = "\n\n<span class=\"text-secondary\">#{esc name}, line #{f.line}, column #{f.col}:</span>\n"
  for i from a to b
    text = lines[i - 1]
    if text? and text.length > 160 => text = text.substr(0, 160) + " …"
    cls = if i == f.line => \text-danger else \text-secondary
    ret += "<span class=\"#cls\">#{"    #i".slice(-4)} | #{esc text}</span>\n"
  # the minified sample is one long line, so the line number alone says nothing. point at the column.
  if f.line >= a and f.line <= b and f.col > 0 and f.col < 160 =>
    ret += "<span class=\"text-danger\">#{Array(7 + f.col).join(' ')}^</span>"
  ret

fmt-frame = (x, hit) ->
  cls = if hit and x == hit => \text-danger else \text-secondary
  "<span class=\"#cls\">#{esc x.text}</span>"

render = (key, r, url) ->
  node = view.get key
  if !r.error =>
    node.innerHTML = "<span class=\"text-success\">no error.</span>\n\n#{esc(r.note or '')}"
    return Promise.resolve null
  f = lib-frame (fs = frames r.error), url
  head = "<b>#{esc String(r.error)}</b>\n<span class=\"text-secondary\">threw while #{r.phase}</span>\n\n"
  body = [(fmt-frame x, f) for x in fs].join '\n'
  (if f => source(url).then (lines) -> excerpt lines, f else Promise.resolve '')
    .then (ex) ->
      node.innerHTML = head + body + ex
      f

# ---- the two ways of running it ---------------------------------------------------------------

# `_cache` is static and keeps the compiled wrapper, so a rerun under different options would get
# the previous one back.
reset = -> rescope._cache = {}; rescope._ver = {map: {}, list: {}}

run-scoped = ({url, call}) ->
  reset!
  scope = new rescope do
    registry: ({url}) -> url
    scope: view.get(\scope).value
    delivery: view.get(\delivery).value
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
run-plain = ({url, call}) ->
  new Promise (res) ->
    caught = null
    handler = (e) -> caught := e
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

# ---- verdict ------------------------------------------------------------------------------------

verdict = (a, b) ->
  node = view.get \verdict
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

last = null
run = (o) ->
  last := o
  view.get(\url).value = o.url
  view.get(\call).value = o.call or ''
  view.get(\scoped).textContent = view.get(\plain).textContent = 'running ...'
  view.get(\verdict).textContent = 'running ...'
  Promise.all [
    run-scoped(o).then (r) -> render \scoped, r, o.url
    run-plain(o).then (r) -> render \plain, r, o.url
  ] .then ([a, b]) -> verdict a, b

view = new ldview do
  root: document.body
  action:
    click:
      sample: ({node}) -> run {url: node.dataset.url, call: node.dataset.call}
      load: -> if (url = view.get(\url).value) => run {url: url, call: view.get(\call).value}
      rerun: -> if last => run last
    change:
      scope: -> if last => run last
      delivery: -> if last => run last
