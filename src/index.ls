var win, doc

# this helps for turning on/off rspvarsetcb feature. remove when we are confident about this.
enable-rspvarsetcb = true

_fetch = (u, c) ->
  if rsp.__node and fs? and !/^https?:/.exec(u) =>
    return new Promise (res, rej) ->
      fs.read-file u, (e, b) -> if e => rej e else res b.toString!
  (ret) <- fetch u, c .then _
  if ret and ret.ok => return ret.text!
  if !ret => return Promise.reject(new Error("404") <<< {name: \lderror, id: 404})
  ret.clone!text!then (t) ->
    i = ret.status or 404
    e = new Error("#i #t") <<< {name: \lderror, id: i, message: t}
    try
      if (j = JSON.parse(t)) and j.name == \lderror => e <<< j <<< {json: j}
    catch err
    return Promise.reject e

proxin = (o = {})->
  @lc = (o.context or {})
  @id = Math.random!toString(36)substring(2)
  # `with` mode: every free identifier in the library resolves through this proxy, so we don't have
  # to know the export names in advance. see doc/no-iframe.md.
  @mode = o.mode or \default
  if o.iframe => @iframe = o.iframe
  # we used to spawn an iframe here and keep nothing but `Reflect.ownKeys` of its window. classifying
  # the target window's own descriptors answers the same question without one - see `native-keys`.
  {attr, intrinsic} = proxin.native-keys (if o.iframe => o.iframe.contentWindow else o.target or win)
  func = {}
  unwrapped = {}
  wrapped = {}
  wm = new WeakMap!
  # rescoped code expects `event.source` to be our proxy rather than the real window.
  # we used to forge it with Object.defineProperty on the event object itself, but listeners
  # on the same target share one Event instance and run in registration order, so the forged
  # value leaked to every listener registered after ours. libraries identifying their own
  # iframe with `evt.source == iframe.contentWindow` - recaptcha, for one - then stopped
  # recognizing their own messages and silently hung. hand out a proxied view instead and
  # leave the event untouched.
  evt-proxy = (evt) ~>
    new Proxy evt, do
      get: (t, key) ~>
        if key == \source => return @_proxy
        v = t[key]
        if typeof(v) == \function => v.bind t else v

  @_proxy = new Proxy (o.target or win), do
    # in `with` mode every name has to be answered here, or it escapes to the real global scope.
    has: (t, k) ~> if @mode == \with => true else Reflect.has t, k
    get: (t, k, o) ~>
      if @mode == \with =>
        # `with` consults this before every lookup; answering with anything truthy would let the
        # object opt names out of the scope.
        if k == Symbol.unscopables => return undefined
        # nothing declares `var window` for us in this mode, so the proxy has to answer for itself.
        # this also closes the `window.parent` escape hatch noted in README.
        if proxin.self-keys[k] => return @_proxy
      if @lc[k]? => return @lc[k]
      # intrinsics must be handed back as they are. libraries fingerprint their global with
      # `global.Object === Object` ( lodash does exactly this ) and go looking for the real window
      # when it fails, which is how lodash ended up installing itself on the host page.
      if intrinsic[k] => return t[k]
      if func[k]? => return func[k]
      if unwrapped[k]? => return unwrapped[k]
      if wrapped[k]? => return wrapped[k]
      # intercept addEventListener to forge event.source. see `evt-proxy` above.
      # `rest` carries the options argument ( capture / once / passive / signal ), which is
      # silently dropped if we don't forward it.
      if k == \addEventListener =>
        return wrapped[k] = (n, ocb, ...rest) ~>
          if n != \message => return (o.target or win).addEventListener n, ocb, ...rest
          ncb = (evt) ~> ocb.call @_proxy, evt-proxy(evt)
          (o.target or win).addEventListener n, ncb, ...rest
          wm.set ocb, ncb
      # since we wrap user cb, we have to take care of it when user want to remove it.
      # options matter here too: removal only matches when `capture` is the same.
      if k == \removeEventListener =>
        return wrapped[k] = (n, ocb, ...rest) ~>
          if n != \message => return (o.target or win).removeEventListener n, ocb, ...rest
          (o.target or win).removeEventListener n, (wm.get(ocb) or ocb), ...rest
      if typeof(t[k]) == \function =>
        # NOTE: bound function doesn't contain original prototype and some other properties.
        # for example, webpack uses Symbol.prototype, and highcharts uses Node.TEXT_NODE.
        # thus we have to import attributes from original value with `<<<` here.
        # instead of using `<<<`, we use Proxy object here to retrieve members
        # inaccessible due to binding.
        #  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy
        # old code keeps here for reference.
        #ret = func[k] = (t[k].bind t) <<< t[k] # `<<<` doesn't work as expected
        #ret.prototype = t[k].prototype         # we still have to manually assign.
        try f = Reflect.get(t,k,o) catch e => f = void
        # `Reflect.get` with our proxy as the receiver doesn't always answer: jsdom implements its
        # interface objects ( Node, Element, URL, ... ) as getters that only reply to a real window
        # and hand back undefined otherwise. read it off the target directly in that case.
        if typeof(f) != \function => f = t[k]
        ret = func[k] = new Proxy(
          f.bind(t),
          {get: (d, g, o) -> Reflect.get((if g in d => d else f), g, o)}
        )
        return ret
      if !attr[k]? => return undefined
      return t[k]
    set: (t, k, v) ~>
      if enable-rspvarsetcb =>
        if k == '_rspvarsetcb_' =>
          var-setter.on(v.k, v.f)
          return true
        var-setter.fire k, v
      # intercept onmessage to forge event.source. see `evt-proxy` above.
      if k == \onmessage =>
        f = (v) ~> (evt) ~> if v => v.call @_proxy, evt-proxy(evt)
        # we store original value so we can return it to user when getter is call
        unwrapped[k] = v
        # onmessage is kinda native bridge / host setter only allowed in global realm
        # so we need global realm to set it
        queueMicrotask -> t[k] = f v
        return true
      if attr[k] =>
        t[k] = v
        return true
      @lc[k] = v
      return true
    # without this, we will lose defined property
    # and don't know how to access it without maximal callstack reached.
    defineProperty: (t, k, d) ~>
      Object.defineProperty @lc, k, d
      return @_proxy
  var-setter =
    evthdr: {}
    on: (n, cb) -> (if Array.isArray(n) => n else [n]).map (n) ~> @evthdr.[][n].push cb
    fire: (n, ...v) -> for cb in (@evthdr[n] or []) => cb.apply @, v
  @

proxin.native-re = /\{\s*\[native code\]\s*\}/
# `chrome` is an enumerable data object, so the rules below don't catch it. same kind of exception
# list as `rsp.prop.legacy`.
proxin.native-extra = <[chrome]>
# in `with` mode these have to answer with the proxy itself - see the `get` trap.
proxin.self-keys = {window: true, self: true, globalThis: true, global: true, top: true, parent: true, frames: true}
proxin.keys-cache = new WeakMap!
# which names belong to a pristine window, without asking a pristine window ( which is what the
# iframe used to be for ). classify the target's own property descriptors:
#  - accessor            -> WebIDL attribute ( document, innerWidth, name, ... )
#  - non enumerable      -> JS intrinsic or interface object ( Object, HTMLElement, ... )
#  - enumerable native fn -> WebIDL operation ( alert, fetch, postMessage, ... )
#  - anything else       -> the host page or another library put it there, so hide it.
# `intrinsic` marks the subset that must never be wrapped in a bound function. verified against a
# real iframe key list: 1211 names vs 1192, the only platform name missed being `chrome`.
proxin.native-keys = (w) ->
  if (ret = proxin.keys-cache.get w) => return ret
  [attr, intrinsic] = [{}, {}]
  p = Object.getPrototypeOf w
  while p =>
    for k in Reflect.ownKeys(p) => attr[k] = true
    p = Object.getPrototypeOf p
  for k in Reflect.ownKeys(w) =>
    if !(d = Object.getOwnPropertyDescriptor(w, k)) => continue
    if d.get or d.set => attr[k] = true
    else if !d.enumerable =>
      attr[k] = true
      if typeof(d.value) == \function => intrinsic[k] = true
    else if typeof(d.value) == \function and proxin.native-re.exec(Function::toString.call(d.value)) =>
      attr[k] = true
  for k in proxin.native-extra => attr[k] = true
  proxin.keys-cache.set w, (ret = {attr, intrinsic})
  return ret

proxin.prototype = Object.create(Object.prototype) <<<
  proxy: -> @_proxy
  ctx: -> @lc

rsp = (o = {}) ->
  @id = Math.random!toString(36)substring(2)
  @_cache = {}
  # `scope`: 'default' pre-declares the exported names in the wrapper ( needs `prop`, thus the peek ),
  #   'with' resolves every name through the proxy instead, so nothing has to be discovered first.
  # `delivery`: 'eval' compiles the wrapper, 'script' hands it to a script element - see `_gen`.
  @_scope = o.scope or \default
  @_delivery = o.delivery or \eval
  @_preloads = o.preloads or []
  @proxy = new proxin!
  @registry(o.registry or "/assets/lib/")
  @

rsp.env = -> [win, doc] := [it, it.document]
# `//# sourceURL` is what turns a stack frame from `eval at _wrap (index.js:494), <anonymous>:7:9`
# into the library's own file and line, and registers the code in devtools as a real source so
# breakpoints survive a reload. the library's own sourceMappingURL then resolves against it too.
rsp.source-url = (src) -> if src => "\n//# sourceURL=#src" else ''
# the Function constructor prepends a header of its own, which shifts every line the library
# reports by two. an eval'd function expression doesn't. `win.eval` is an indirect eval, so the
# code is evaluated in the global scope rather than here.
rsp.compile = (code, src) ->
  if win and typeof(win.eval) == \function =>
    return win.eval "(function(scope, ctx, win){#code})#{rsp.source-url src}"
  return new Function "scope", "ctx", "win", code
rsp.prop = legacy: {webkitStorageInfo: true}
rsp.id = (o) ->
  path = o.path or if o.type == \js => \index.min.js else if o.type == \css => \index.min.css else \index.html
  o.id or o.url or "#{if o.ns => "#{o.ns}:" else ''}#{o.name}@#{o.version or 'main'}:#path"
rsp._cache = {}
rsp._ver = {map: {}, list: {}}
rsp.gen-registry = \__rescope_gen__
rsp.cache = (o) ->
  if typeof(o) == \string => o = {url: o}
  # `prop` recorded at bundle time, as a list of names. keep it, and mark the entry so `_exports`
  # doesn't run the library a second time just to rediscover them.
  if Array.isArray o.prop =>
    o <<< do
      prop: Object.fromEntries [[k, null] for k in o.prop]
      prop-cached: true
      prop-initing: true
  if !o.id => o.id = rsp.id o
  if @_cache[o.id] => return that
  if o.id and !o.name =>
    k = o.id.split(':')
    if k.length <= 2 => [nv,p,s] = k else [s,nv,p] = k
    if !(ret = /^(@?[^@]+)(?:@([^:]+))?$/.exec(nv)) => ret = ['',o.id,'']
    n = ret.1
    v = ret.2
  else [s,n,v,p] = [o.ns, o.name, o.version or '', o.path or '']
  if /^[0-9.]+$/.exec v =>
    if @_ver.map{}[n][v] => v = that
    if @_cache[rsp.id({ns: s, name: n, version: v, path: p})] => return that
    for i from 0 til @_ver.list[][n].length =>
      ver = @_ver.list[n][i]
      if !semver.fit(ver, v) => continue
      @_ver.map[n][v] = ver
      o.id = rsp.id {ns: s, name: n, version: ver, path: p}
      if @_cache[o.id] => return that
  if !(v in @_ver.list[][n]) => @_ver.list[n].push v
  return @_cache[o.id] = o

rsp.prototype = Object.create(Object.prototype) <<<
  peek-scope: -> false # deprecated
  init: -> Promise.resolve! # deprecated

  _ref: (o) ->
    if typeof(o) == \string => o = {url: o}
    # promise from r(o) is deprecated. but if it is, url:r(o) is kinda weird. but ...
    if typeof(r = @_reg.url or @_reg) == \function => o = {} <<< o <<< {url: r o}
    # ... it will be return directly since then @_reg.fetch won't exist.
    return if @_reg.fetch => @_reg.fetch(o) else o.url

  registry: (v) ->
    if typeof(v) == \string =>
      if v[* - 1] == \/ => v = v.substring(0, v.length - 1)
      @_reg = ((v) -> (o) -> "#{v}/#{o.name}/#{o.version or 'main'}/#{o.path or 'index.min.js'}") v
    else @_reg = v

  cache: (o) ->
    if typeof(o) == \string => o = {url: o}
    if !o.id => o.id = rsp.id o
    if @_cache[o.id] => return that
    return @_cache[o.id] = rsp.cache o

  # the peek window. created on demand: a page whose libraries all carry a recorded `prop`
  # ( see `bundle` ) never needs one, and neither does `scope: 'with'`.
  ifr: ->
    if @iframe => return that
    @iframe = ifr = doc.createElement \iframe
    ifr.style <<< position: \absolute, top: 0, left: 0, width: 0, height: 0, pointerEvents: \none, opacity: 0
    ifr.setAttribute \title, "rescope script loader"
    ifr.setAttribute \name, "pdb-rescope-#{@id}"
    doc.body.appendChild ifr
    ifr.contentWindow.document.body.innerHTML = @_preloads
      .map(-> """<script type="text/javascript" src="#it"></script>""").join('')
    return ifr

  exports: (o = {}) ->
    ctx = o.ctx or {}
    libs = if typeof(o.libs) == \string => [o.libs] else (o.libs or [])
    # nothing to discover - don't touch ( or create ) the peek window.
    if libs.every((lib) ~> (@cache lib).prop-cached) => return
    [hash, iw] = [{}, @ifr!contentWindow]
    for k of ctx => hash[k] = iw[k]; iw[k] = ctx[k]
    @_exports libs, 0, ctx
    for k of hash => iw[k] = hash[k]

  _exports: (libs, idx = 0, ctx = {}) ->
    if !(lib = libs[idx]) => return
    lib = @cache lib
    # `prop` came from the bundle: the names are already known, so don't run the library here just
    # to rediscover them. `load` still compiles and runs it once, as usual.
    if lib.prop-cached => return @_exports libs, idx + 1, ctx
    [hash, fprop, iw] = [{}, lib.fprop, @ifr!contentWindow]
    if !fprop =>
      lib <<< {fprop: fprop = {}, prop: {}, prop-initing: true}
      if lib.gen =>
        fprop <<< lib.gen.apply iw, [iw, iw, iw]
        lib.prop = Object.fromEntries [[k,null] for k of fprop]
      else
        att1 = Object.fromEntries(Reflect.ownKeys(iw).filter(->!rsp.prop.legacy[it]).map -> [it, true])
        for k of att1 => hash[k] = iw[k]
        # TODO use this to guarantee a global scope??
        # iw.run = function(code) { (new Function(code))(); }; iw.run(code);
        try
          # strict mode keeps global variables from window, but we need them for establish prop list.
          # for example, `marked` below can not be found in att2:
          #
          #     "use strict";var marked = "...";
          #
          # which was found in `marked` ({name: 'marked', version: '7.0.0', path: 'marked.min.js'})
          # thus, we remove `use strict` at the beginning of the code to nullify it.
          # this is a bad hack and we will need alternative method to overcome this. (TODO)
          # hopefully this is used only here for resolve export vars from a module -
          # we still enable strict mode in actual environment (`_wrap` below)
          # the peek runs the library too, and it runs it *first* - so a library that throws while
          # loading throws from here, and this is the trace the caller gets. without a sourceURL
          # it reads as `eval at <anonymous> ( rescope's own file )`. `source-url` opens with a
          # newline, which is also what keeps it clear of a trailing `//# sourceMappingURL`.
          iw.eval((lib.code or '').replace('"use strict";','') + rsp.source-url(lib.url or lib.id))
        catch e
          console.error "[@plotdb/rescope] Parse failed", lib{url, ns, name, version, path}
          console.error "[@plotdb/rescope] with this error:", e
          throw e
        att2 = Object.fromEntries(Reflect.ownKeys(iw).filter(->!rsp.prop.legacy[it]).map -> [it, true])
        for k of att2 =>
          if iw[k] == hash[k] or (k in <[NaN]>) => continue
          fprop[k] = iw[k]
          # TODO how to determine if it's export only or loaded successfully?
          # may need additional flag
          lib.prop[k] = null
    else
      for k of fprop => hash[k] = iw[k]; iw[k] = fprop[k]
    for k of fprop => ctx[k] = fprop[k]
    # ctx has to be carried along, or only the first lib's props ever reach the caller's `dctx.f`.
    @_exports libs, idx + 1, ctx
    for k of fprop => iw[k] = hash[k]
    # NOTE we can only retrieve synchronously assigned props.

  # `with` puts every free identifier - `var` declarations included - through the proxy, so no name
  # has to be known in advance ( thus no peek ) and nothing has to be blanked on the host window.
  # `load` reads the exports back out of the context afterwards. costs library run time, so this is
  # opt-in: see doc/no-iframe.md.
  _wrap-with: (o = {}, ctx = {}, opt = {}) ->
    code = "with(scope){#{o.code}\n}"
    if opt.code-only => return "function(scope, ctx, win){#code}"
    return rsp.compile code, (o.url or o.id)

  _wrap: (o = {}, ctx = {}, opt = {}) ->
    if (opt.scope or @_scope) == \with => return @_wrap-with o, ctx, opt
    varre = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/
    prop = o.prop or {}
    # NOTE 1: some libs may detect existency of themselves.
    #   so if we are using global scope, we will have to exclude them.
    #   however, since we scope everything in a isolated global, there is no need for this.
    # NOTE 2: some libs, such as setimmediate ( used by jszip), compare event source against `global`
    #   yet we overwrite `global` with our scope ( proxin ) object, thus this check will fail.
    # NOTE 3: everything we put in front of the library's code has to stay on ONE line. a newline
    #   here shifts every line number the library reports in a stack trace by one.
    #   `__win` also used to be assigned without `var`, which in sloppy mode made it a global on
    #   the real window.
    code = "var window, global, globalThis, self, __ret = {}, __win = {}; window = global = globalThis = self = scope;"
    # in nodejs we use env to prepare win,
    # but loaded js may still access sth like `Element`, `docuemtn` directly, instead of `window.Element`
    # in this case, we will have to manually prepare these variables.
    # however, this can also be done by manually inject them into `global` by called.
    # before we decide what's the best practice, we will keep this in comment for reference only.
    # for k of win => if varre.exec(k) => code += "var #k = win['#k'];"

    # libs may set window.somevar then trying to access `somvar` as local var.
    # without monitoring `window.somvar` and when changed update `somevar`, local var will be undefined.
    # thus, we use `_rspvarsetcb_` as a special kw to notify Proxy to add a cb for `k`,
    # so in Proxy we can call cb for `k` when `window[k]` is updated.
    #
    _ = if !enable-rspvarsetcb => (->) else (k) -> "window['_rspvarsetcb_'] = {k:'#k',f:function(v){#{k}=v}};"
    # some libs may still access window directly ( perhaps via (function() { var window = this; })();
    # so we store original win[k] in __win, and restore them later.
    # we check `/-/` against k to prevent illegal varible names;
    # we may want to extend this check to complete variable patterns
    for k of prop =>
      if varre.exec(k) => code += "var #k;#{_(k)}"
      code += "__win['#k'] = win['#k']; win['#k'] = undefined;"
    for k of ctx =>
      code += "window['#k'] = ctx['#k'];"
      if varre.exec(k) => code += "var #k = window['#k'];#{_(k)}"
    # the `win[k]` restores below used to sit plainly after the library's code, so a library that
    # threw skipped every one of them and left the host page's globals blanked. they belong in
    # `finally`. note this opening brace stays on the prologue line - see NOTE 3 above.
    # a newline after the library's code, before anything of ours: minified files routinely end with
    # `//# sourceMappingURL=...` and no trailing newline, and everything we append would land inside
    # that comment. ( a newline *after* the library can't shift the line numbers it reports. )
    code += "try {#{o.code}\n;"
    for k of prop =>
      # either local variable, fake window obj, real window obj
      #   or possibly `this` variable if some libs use `this` as window object. ( yes, bad practice )
      # some libs may update global.k, but access variable k. in this case, k will undefined
      #   so we have to update k if it's undefined. ( the `if(!(k)) { ... }` code )
      #   this was the earlier patch before we realize that lib itself may also access k,
      #   so we actually have to update k right after global.k is updated.
      #   this is done by above `rspvarsetcb` callback mechanism
      #   thus the `if(!(k))` probably won't be needed anymore.
      if varre.exec(k) =>
        code += """
        if(!(#k)) { #k = scope['#k']; }
        __ret['#k'] = #k || window['#k'] || win['#k'] || this['#k'];
        """
      else
        code += """
        __ret['#k'] = window['#k'] || win['#k'] || this['#k'];
        """
    code += "} finally {"
    for k of prop => code += "win['#k'] = __win['#k'];"
    code += "}return __ret;"
    if opt.code-only => return "function(scope, ctx, win){#code}"
    return rsp.compile code, (o.url or o.id)

  # compile the wrapper for a lib, as a promise since one of the deliveries is asynchronous.
  #  - 'eval' ( default ): compile it here.
  #  - 'script': put it in a blob and let a script element run it. CSP then sees a script load
  #    rather than `eval`, so the host page doesn't have to grant 'unsafe-eval' - under a
  #    nonce + 'strict-dynamic' policy it needs no grant at all, and otherwise `blob:` is a much
  #    narrower one. see doc/no-iframe.md.
  _gen: (lib, ctx) ->
    if lib.gen => return Promise.resolve that
    if @_delivery != \script or rsp.__node or !doc =>
      return Promise.resolve(lib.gen = @_wrap lib, ctx)
    code = @_wrap lib, ctx, {code-only: true}
    id = "#{@id}-#{Math.random!toString(36)substring(2)}"
    reg = win[rsp.gen-registry] = (win[rsp.gen-registry] or {})
    body = "window['#{rsp.gen-registry}']['#id'] = #code;#{rsp.source-url(lib.url or lib.id)}"
    url = URL.createObjectURL(new Blob([body], {type: \text/javascript}))
    new Promise (res, rej) ~>
      node = doc.createElement \script
      done = (e) ~>
        node.remove!
        URL.revokeObjectURL url
        if !(gen = reg[id]) =>
          return rej(new Error("[@plotdb/rescope] wrapper script blocked or failed for #{lib.id}. \
            with `delivery: 'script'` the page's CSP has to allow `blob:` in script-src, or use a \
            nonce with 'strict-dynamic'.") <<< {name: \lderror, id: 403})
        delete reg[id]
        res(lib.gen = gen)
      node.onload = done
      node.onerror = done
      node.src = url
      doc.body.appendChild node

  # force-fetch: always refetch data
  # only-fetch: totally ignore updating ctx part. for bundling.
  load: (libs, dctx = {}, force-fetch = false, only-fetch = false) ->
    libs = (if Array.isArray(libs) => libs else [libs]).map (o) ~> @cache o
    # store px in libs and create on load, otherwise different libs will intervene each other
    # TODO should we wrap libs in some kind of object so we can keep their state?
    px = if libs.px => libs.px else libs.px = (if dctx and dctx.p => dctx.p else new proxin {mode: @_scope})
    ctx = px.ctx!
    proxy = px.proxy!

    /*
    # this tries to segment libs based on async flag.
    # however, current implementation batches fetches and then loads by order
    # in this case segment seems to be unnecessary.
    # we will keep the code here for reference.
    [segs, seg] = [[], []]
    for lib in libs =>
      seg.push lib
      if !(lib.async? and !lib.async) => continue
      segs.push seg
      seg = []
    if seg.length => segs.push seg
    */
    segs = [libs]

    _ = (idx = 0) ~>
      if !(libs = segs[idx]) => return Promise.resolve(ctx)
      ps = libs.map (lib) ~>
        if (lib.code or lib.gen) and !force-fetch => return Promise.resolve!
        ref = @_ref(lib)
        if ref.then => ref.then ~>
          lib.code = it.content
          @cache(lib <<< {id: undefined, version: it.version, code: it.content})
        else _fetch ref, {method: \GET} .then -> lib.code = it
      Promise.all ps
        .then ~>
          if only-fetch => return
          if @_scope == \with =>
            # nothing to peek in this mode: the names come out of the context after the run.
            for lib in libs => if !lib.gen and !lib.prop => lib <<< {prop: {}, prop-initing: true}
          # libs carrying a `prop` from the bundle are skipped inside, iframe and all.
          else @exports {libs, ctx: dctx.f}
          # compile and run one lib at a time, in order. the wrapper's prologue snapshots the
          # names in `ctx` ( `for k of ctx` in `_wrap` ), so a lib has to be compiled only after
          # every lib before it in the batch has run and merged its exports - compiling the whole
          # batch up front hands each of them an empty ctx, and a lib referring to an earlier one
          # ( ldcover to ldview, our own page's functest to ldcover ) sees undefined.
          # `_gen` is a promise because `delivery: 'script'` is asynchronous; with the default
          # `eval` delivery this chain settles entirely in microtasks, so libs still run back to
          # back with nothing of the page's interleaved.
          libs.reduce do
            (p, lib) ~> p.then ~>
              if !lib.prop-initing => return ctx <<< lib.prop
              @_gen lib, ctx .then (gen) ~>
                if @_scope != \with => lib.prop = gen.apply proxy, [proxy, ctx, win]
                else
                  seen = Object.fromEntries [[k, true] for k of ctx]
                  gen.apply proxy, [proxy, ctx, win]
                  lib.prop = Object.fromEntries [[k, ctx[k]] for k of ctx when !seen[k]]
                lib.prop-initing = false
                ctx <<< lib.prop
            Promise.resolve!
        .then ~> ctx
        .then ~> _ idx + 1
    _ 0

  context: (libs, func, px) ->
    if typeof(func) != \function => [func, px] = [px, func]
    @load libs, px .then (ctx) -> if func => func ctx else return ctx

rsp.env if self? => self else globalThis
rsp.proxin = proxin

# for creating empty context of both main window and iframe, so we call it `dual-context`.
#  - `p`: proxy ( for main window )
#  - `f`: context object for iframe
#  - `ctx()`: get context from main window
rsp.dual-context = -> {p: new proxin!, f: {}, ctx: -> @p.ctx!}
