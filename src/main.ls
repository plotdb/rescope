rescope = (opt = {}) ->
  @opt = {delegate: true, use-delegate-lib: false} <<< opt
  @global = opt.global or window
  @scope = {}
  @

rescope.prototype = Object.create(Object.prototype) <<< do
  peek-scope: -> console.log "in delegate frame: #{!!@global._rescopeDelegate}"; return @global._rescopeDelegate
  init: ->
    if !@opt.delegate => return Promise.resolve!
    # if we are in the host window, use delegate iframe to load script
    # so we won't affect host window object.
    new Promise (res, rej) ~>
      node = document.createElement \iframe
      node.setAttribute \name, "delegator-#{Math.random!toString(36)substring(2)}"
      node.setAttribute \sandbox, ('allow-same-origin allow-scripts')
      node.style <<< opacity: 0, z-index: -1, pointer-events: \none, width: '0px', height: '0px'
      # `load` is exposed via contentWindow and used to load libs in sandbox.
      # it actually execute this object's load function so scope will be written back to this object.
      code = """<html><body>
      <script>
      function init() {
        if(!window._scope) { window._scope = new rescope({delegate:false,global:window}) }
      }
      function load(url) {
        init();
        return _scope.load(url,false);
      }
      function context(url,func,delegate,untilResolve) {
        init();
        _scope.context(url,func,false,untilResolve);
      }
      </script></body></html>"""
      node.onerror = -> rej it
      # pass this object to delegate so we can run it there.
      node.onload = ~> (@delegate = node.contentWindow) <<< {rescope: rescope, _rescopeDelegate: true}; res!
      node.src = URL.createObjectURL(new Blob([code], {type: \text/html}))
      document.body.appendChild node

  # until-resolve: is this call for loading procedure?
  #   - we should always wait func returned promise to resolve, if it's loading procedure.
  #   - this should be lib only since it may lead strange behavior in concurrent contexts.
  context: (url, func, delegate = true, until-resolve = false) ->
    if delegate and @opt.delegate and @opt.use-delegate-lib =>
      return @delegate.context(url, func)

    url = if Array.isArray(url) => url else [url]
    stacks = []
    scopes = []
    context = {}
    for i from 0 til url.length =>
      [stack,scope] = [{}, @scope[url[i].url or url[i]] or {}]
      for k of scope =>
        stack[k] = @global[k]
        @global[k] = scope[k]
        context[k] = scope[k]
      stacks.push stack
      scopes.push scope

    ret = func context

    # func may be `load` in rescope, and it is batched until a sync script is found.
    # we need to wait until it resolves otherwise its dependenies may fail.
    p = if until-resolve and ret and ret.then => ret else Promise.resolve!
    p.then ~>
      for i from scopes.length - 1 to 0 by -1
        scope = scopes[i]
        stack = stacks[i]
        for k of scope => @global[k] = stack[k]

  load: (url, delegate = true) ->
    if !url => return Promise.resolve!
    url = if Array.isArray(url) => url else [url]
    Promise.resolve!
      .then ~>
        return if delegate and @opt.delegate =>
          @delegate.load(url).then ~>
            @scope <<< @delegate._scope.scope
            return it
        else Promise.resolve!
      .then ~>
        ret = {}
        new Promise (res, rej) ~>
          _ = (list, idx) ~>
            items = []
            if idx >= list.length => return res ret
            for i from idx til list.length =>
              items.push list[i]
              if list[i].async? and !list[i].async => break
            if !items.length => return res ret
            Promise.all(items.map ~> @_load(it.url or it).then ~> ret <<< it)
              .then ~> @context(items.map(-> it.url or it), (-> _(list, idx + items.length)), false, true)
              .catch -> rej it
          _ url, 0

  _load: (url) ->
    new Promise (res, rej) ~>
      script = @global.document.createElement("script")
      hash = {}
      for k,v of @global => hash[k] = v
      script.onerror = ~> rej it
      script.onload = ~>
        # if we have @scope - it either is load twice, or is from delegate.
        # we can simply adopt the calculated scope members, and copy them from vars loaded in host.
        if @scope[url] =>
          scope = @scope[url]
          for k,v of scope =>
            scope[k] = @global[k]
            @global[k] = hash[k]
        else
          @scope[url] = scope = {}
          for k,v of @global =>
            # treat `k` as imported var if:
            # A. `k` changed.
            # if (hash[k]? and hash[k] == @global[k]) or !(@global[k]?) => continue
            # B. `k` added. can't detect/restore overwritten object.
            #    however in delegate this should be okay.
            if hash[k]? or !(@global[k]?) => continue
            # if host script touches window object, both A. and B. might give incorrect result.
            # thus, we always use delegate to load, but run with context of host.
            scope[k] = @global[k]
            @global[k] = hash[k]
        res scope
      # we might in iframe sandbox run in blob URL. so we have to use absolute URL.
      full-url = if /(https?:)?\/\//.exec(url) => url
      else window.location.origin + (if url.0 == \/ => '' else \/) + url
      script.setAttribute \src, full-url
      @global.document.body.appendChild script

if module? => module.exports = rescope
if window? => window.rescope = rescope
