var semver, fetch, fs;
semver = typeof window != 'undefined' && window !== null
  ? window.semver
  : (typeof module != 'undefined' && module !== null) && (typeof require != 'undefined' && require !== null) ? require("@plotdb/semver") : null;
fetch = typeof window != 'undefined' && window !== null
  ? window.fetch
  : (typeof module != 'undefined' && module !== null) && (typeof require != 'undefined' && require !== null) ? require("node-fetch") : null;
fs = require('fs');var win, doc, enableRspvarsetcb, _fetch, proxin, ref$, rsp, slice$ = [].slice, arrayFrom$ = Array.from || function(x){return slice$.call(x);};
enableRspvarsetcb = true;
_fetch = function(u, c){
  if (rsp.__node && (typeof fs != 'undefined' && fs !== null) && !/^https?:/.exec(u)) {
    return new Promise(function(res, rej){
      return fs.readFile(u, function(e, b){
        if (e) {
          return rej(e);
        } else {
          return res(b.toString());
        }
      });
    });
  }
  return fetch(u, c).then(function(ret){
    var ref$;
    if (ret && ret.ok) {
      return ret.text();
    }
    if (!ret) {
      return Promise.reject((ref$ = new Error("404"), ref$.name = 'lderror', ref$.id = 404, ref$));
    }
    return ret.clone().text().then(function(t){
      var i, e, ref$, j, err;
      i = ret.status || 404;
      e = (ref$ = new Error(i + " " + t), ref$.name = 'lderror', ref$.id = i, ref$.message = t, ref$);
      try {
        if ((j = JSON.parse(t)) && j.name === 'lderror') {
          import$(e, j).json = j;
        }
      } catch (e$) {
        err = e$;
      }
      return Promise.reject(e);
    });
  });
};
proxin = function(o){
  var ref$, attr, intrinsic, func, unwrapped, wrapped, wm, evtProxy, varSetter, this$ = this;
  o == null && (o = {});
  this.lc = o.context || {};
  this.id = Math.random().toString(36).substring(2);
  this.mode = o.mode || 'default';
  if (o.iframe) {
    this.iframe = o.iframe;
  }
  ref$ = proxin.nativeKeys(o.iframe
    ? o.iframe.contentWindow
    : o.target || win), attr = ref$.attr, intrinsic = ref$.intrinsic;
  func = {};
  unwrapped = {};
  wrapped = {};
  wm = new WeakMap();
  evtProxy = function(evt){
    return new Proxy(evt, {
      get: function(t, key){
        var v;
        if (key === 'source') {
          return this$._proxy;
        }
        v = t[key];
        if (typeof v === 'function') {
          return v.bind(t);
        } else {
          return v;
        }
      }
    });
  };
  this._proxy = new Proxy(o.target || win, {
    has: function(t, k){
      if (this$.mode === 'with') {
        return true;
      } else {
        return Reflect.has(t, k);
      }
    },
    get: function(t, k, o){
      var f, e, ret;
      if (this$.mode === 'with') {
        if (k === Symbol.unscopables) {
          return undefined;
        }
        if (proxin.selfKeys[k]) {
          return this$._proxy;
        }
      }
      if (this$.lc[k] != null) {
        return this$.lc[k];
      }
      if (intrinsic[k]) {
        return t[k];
      }
      if (func[k] != null) {
        return func[k];
      }
      if (unwrapped[k] != null) {
        return unwrapped[k];
      }
      if (wrapped[k] != null) {
        return wrapped[k];
      }
      if (k === 'addEventListener') {
        return wrapped[k] = function(n, ocb){
          var rest, res$, i$, to$, ref$, ncb;
          res$ = [];
          for (i$ = 2, to$ = arguments.length; i$ < to$; ++i$) {
            res$.push(arguments[i$]);
          }
          rest = res$;
          if (n !== 'message') {
            return (ref$ = o.target || win).addEventListener.apply(ref$, [n, ocb].concat(arrayFrom$(rest)));
          }
          ncb = function(evt){
            return ocb.call(this$._proxy, evtProxy(evt));
          };
          (ref$ = o.target || win).addEventListener.apply(ref$, [n, ncb].concat(arrayFrom$(rest)));
          return wm.set(ocb, ncb);
        };
      }
      if (k === 'removeEventListener') {
        return wrapped[k] = function(n, ocb){
          var rest, res$, i$, to$, ref$;
          res$ = [];
          for (i$ = 2, to$ = arguments.length; i$ < to$; ++i$) {
            res$.push(arguments[i$]);
          }
          rest = res$;
          if (n !== 'message') {
            return (ref$ = o.target || win).removeEventListener.apply(ref$, [n, ocb].concat(arrayFrom$(rest)));
          }
          return (ref$ = o.target || win).removeEventListener.apply(ref$, [n, wm.get(ocb) || ocb].concat(arrayFrom$(rest)));
        };
      }
      if (typeof t[k] === 'function') {
        try {
          f = Reflect.get(t, k, o);
        } catch (e$) {
          e = e$;
          f = void 8;
        }
        if (typeof f !== 'function') {
          f = t[k];
        }
        ret = func[k] = new Proxy(f.bind(t), {
          get: function(d, g, o){
            return Reflect.get(in$(g, d) ? d : f, g, o);
          }
        });
        return ret;
      }
      if (attr[k] == null) {
        return undefined;
      }
      return t[k];
    },
    set: function(t, k, v){
      var f;
      if (enableRspvarsetcb) {
        if (k === '_rspvarsetcb_') {
          varSetter.on(v.k, v.f);
          return true;
        }
        varSetter.fire(k, v);
      }
      if (k === 'onmessage') {
        f = function(v){
          return function(evt){
            if (v) {
              return v.call(this$._proxy, evtProxy(evt));
            }
          };
        };
        unwrapped[k] = v;
        queueMicrotask(function(){
          return t[k] = f(v);
        });
        return true;
      }
      if (attr[k]) {
        t[k] = v;
        return true;
      }
      this$.lc[k] = v;
      return true;
    },
    defineProperty: function(t, k, d){
      Object.defineProperty(this$.lc, k, d);
      return this$._proxy;
    }
  });
  varSetter = {
    evthdr: {},
    on: function(n, cb){
      var this$ = this;
      return (Array.isArray(n)
        ? n
        : [n]).map(function(n){
        var ref$;
        return ((ref$ = this$.evthdr)[n] || (ref$[n] = [])).push(cb);
      });
    },
    fire: function(n){
      var v, res$, i$, to$, ref$, len$, cb, results$ = [];
      res$ = [];
      for (i$ = 1, to$ = arguments.length; i$ < to$; ++i$) {
        res$.push(arguments[i$]);
      }
      v = res$;
      for (i$ = 0, len$ = (ref$ = this.evthdr[n] || []).length; i$ < len$; ++i$) {
        cb = ref$[i$];
        results$.push(cb.apply(this, v));
      }
      return results$;
    }
  };
  return this;
};
proxin.nativeRe = /\{\s*\[native code\]\s*\}/;
proxin.nativeExtra = ['chrome'];
proxin.selfKeys = {
  window: true,
  self: true,
  globalThis: true,
  global: true,
  top: true,
  parent: true,
  frames: true
};
proxin.keysCache = new WeakMap();
proxin.nativeKeys = function(w){
  var ret, ref$, attr, intrinsic, p, i$, len$, k, d;
  if (ret = proxin.keysCache.get(w)) {
    return ret;
  }
  ref$ = [{}, {}], attr = ref$[0], intrinsic = ref$[1];
  p = Object.getPrototypeOf(w);
  while (p) {
    for (i$ = 0, len$ = (ref$ = Reflect.ownKeys(p)).length; i$ < len$; ++i$) {
      k = ref$[i$];
      attr[k] = true;
    }
    p = Object.getPrototypeOf(p);
  }
  for (i$ = 0, len$ = (ref$ = Reflect.ownKeys(w)).length; i$ < len$; ++i$) {
    k = ref$[i$];
    if (!(d = Object.getOwnPropertyDescriptor(w, k))) {
      continue;
    }
    if (d.get || d.set) {
      attr[k] = true;
    } else if (!d.enumerable) {
      attr[k] = true;
      if (typeof d.value === 'function') {
        intrinsic[k] = true;
      }
    } else if (typeof d.value === 'function' && proxin.nativeRe.exec(Function.prototype.toString.call(d.value))) {
      attr[k] = true;
    }
  }
  for (i$ = 0, len$ = (ref$ = proxin.nativeExtra).length; i$ < len$; ++i$) {
    k = ref$[i$];
    attr[k] = true;
  }
  proxin.keysCache.set(w, ret = {
    attr: attr,
    intrinsic: intrinsic
  });
  return ret;
};
proxin.prototype = (ref$ = Object.create(Object.prototype), ref$.proxy = function(){
  return this._proxy;
}, ref$.ctx = function(){
  return this.lc;
}, ref$);
rsp = function(o){
  o == null && (o = {});
  this.id = Math.random().toString(36).substring(2);
  this._cache = {};
  this._scope = o.scope || 'default';
  this._delivery = o.delivery || 'eval';
  this._preloads = o.preloads || [];
  this.proxy = new proxin();
  this.registry(o.registry || "/assets/lib/");
  return this;
};
rsp.env = function(it){
  var ref$;
  return ref$ = [it, it.document], win = ref$[0], doc = ref$[1], ref$;
};
rsp.sourceUrl = function(src){
  if (src) {
    return "\n//# sourceURL=" + src;
  } else {
    return '';
  }
};
rsp.compile = function(code, src){
  if (win && typeof win.eval === 'function') {
    return win.eval("(function(scope, ctx, win){" + code + "})" + rsp.sourceUrl(src));
  }
  return new Function("scope", "ctx", "win", code);
};
rsp.prop = {
  legacy: {
    webkitStorageInfo: true
  }
};
rsp.id = function(o){
  var path;
  path = o.path || (o.type === 'js'
    ? 'index.min.js'
    : o.type === 'css' ? 'index.min.css' : 'index.html');
  return o.id || o.url || (o.ns ? o.ns + ":" : '') + "" + o.name + "@" + (o.version || 'main') + ":" + path;
};
rsp._cache = {};
rsp._ver = {
  map: {},
  list: {}
};
rsp.genRegistry = '__rescope_gen__';
rsp.cache = function(o){
  var k, that, nv, p, s, ret, n, v, ref$, i$, to$, i, ver;
  if (typeof o === 'string') {
    o = {
      url: o
    };
  }
  if (Array.isArray(o.prop)) {
    import$(o, {
      prop: Object.fromEntries((function(){
        var i$, ref$, len$, results$ = [];
        for (i$ = 0, len$ = (ref$ = o.prop).length; i$ < len$; ++i$) {
          k = ref$[i$];
          results$.push([k, null]);
        }
        return results$;
      }())),
      propCached: true,
      propIniting: true
    });
  }
  if (!o.id) {
    o.id = rsp.id(o);
  }
  if (that = this._cache[o.id]) {
    return that;
  }
  if (o.id && !o.name) {
    k = o.id.split(':');
    if (k.length <= 2) {
      nv = k[0], p = k[1], s = k[2];
    } else {
      s = k[0], nv = k[1], p = k[2];
    }
    if (!(ret = /^(@?[^@]+)(?:@([^:]+))?$/.exec(nv))) {
      ret = ['', o.id, ''];
    }
    n = ret[1];
    v = ret[2];
  } else {
    ref$ = [o.ns, o.name, o.version || '', o.path || ''], s = ref$[0], n = ref$[1], v = ref$[2], p = ref$[3];
  }
  if (/^[0-9.]+$/.exec(v)) {
    if (that = ((ref$ = this._ver.map)[n] || (ref$[n] = {}))[v]) {
      v = that;
    }
    if (that = this._cache[rsp.id({
      ns: s,
      name: n,
      version: v,
      path: p
    })]) {
      return that;
    }
    for (i$ = 0, to$ = ((ref$ = this._ver.list)[n] || (ref$[n] = [])).length; i$ < to$; ++i$) {
      i = i$;
      ver = this._ver.list[n][i];
      if (!semver.fit(ver, v)) {
        continue;
      }
      this._ver.map[n][v] = ver;
      o.id = rsp.id({
        ns: s,
        name: n,
        version: ver,
        path: p
      });
      if (that = this._cache[o.id]) {
        return that;
      }
    }
  }
  if (!in$(v, (ref$ = this._ver.list)[n] || (ref$[n] = []))) {
    this._ver.list[n].push(v);
  }
  return this._cache[o.id] = o;
};
rsp.prototype = (ref$ = Object.create(Object.prototype), ref$.peekScope = function(){
  return false;
}, ref$.init = function(){
  return Promise.resolve();
}, ref$._ref = function(o){
  var r, ref$;
  if (typeof o === 'string') {
    o = {
      url: o
    };
  }
  if (typeof (r = this._reg.url || this._reg) === 'function') {
    o = (ref$ = import$({}, o), ref$.url = r(o), ref$);
  }
  return this._reg.fetch
    ? this._reg.fetch(o)
    : o.url;
}, ref$.registry = function(v){
  if (typeof v === 'string') {
    if (v[v.length - 1] === '/') {
      v = v.substring(0, v.length - 1);
    }
    return this._reg = function(v){
      return function(o){
        return v + "/" + o.name + "/" + (o.version || 'main') + "/" + (o.path || 'index.min.js');
      };
    }(v);
  } else {
    return this._reg = v;
  }
}, ref$.cache = function(o){
  var that;
  if (typeof o === 'string') {
    o = {
      url: o
    };
  }
  if (!o.id) {
    o.id = rsp.id(o);
  }
  if (that = this._cache[o.id]) {
    return that;
  }
  return this._cache[o.id] = rsp.cache(o);
}, ref$.ifr = function(){
  var that, ifr, ref$;
  if (that = this.iframe) {
    return that;
  }
  this.iframe = ifr = doc.createElement('iframe');
  ref$ = ifr.style;
  ref$.position = 'absolute';
  ref$.top = 0;
  ref$.left = 0;
  ref$.width = 0;
  ref$.height = 0;
  ref$.pointerEvents = 'none';
  ref$.opacity = 0;
  ifr.setAttribute('title', "rescope script loader");
  ifr.setAttribute('name', "pdb-rescope-" + this.id);
  doc.body.appendChild(ifr);
  ifr.contentWindow.document.body.innerHTML = this._preloads.map(function(it){
    return "<script type=\"text/javascript\" src=\"" + it + "\"></script>";
  }).join('');
  return ifr;
}, ref$.exports = function(o){
  var ctx, libs, ref$, hash, iw, k, this$ = this, results$ = [];
  o == null && (o = {});
  ctx = o.ctx || {};
  libs = typeof o.libs === 'string'
    ? [o.libs]
    : o.libs || [];
  if (libs.every(function(lib){
    return this$.cache(lib).propCached;
  })) {
    return;
  }
  ref$ = [{}, this.ifr().contentWindow], hash = ref$[0], iw = ref$[1];
  for (k in ctx) {
    hash[k] = iw[k];
    iw[k] = ctx[k];
  }
  this._exports(libs, 0, ctx);
  for (k in hash) {
    results$.push(iw[k] = hash[k]);
  }
  return results$;
}, ref$._exports = function(libs, idx, ctx){
  var lib, ref$, hash, fprop, iw, k, att1, e, att2, results$ = [];
  idx == null && (idx = 0);
  ctx == null && (ctx = {});
  if (!(lib = libs[idx])) {
    return;
  }
  lib = this.cache(lib);
  if (lib.propCached) {
    return this._exports(libs, idx + 1, ctx);
  }
  ref$ = [{}, lib.fprop, this.ifr().contentWindow], hash = ref$[0], fprop = ref$[1], iw = ref$[2];
  if (!fprop) {
    lib.fprop = fprop = {};
    lib.prop = {};
    lib.propIniting = true;
    if (lib.gen) {
      import$(fprop, lib.gen.apply(iw, [iw, iw, iw]));
      lib.prop = Object.fromEntries((function(){
        var results$ = [];
        for (k in fprop) {
          results$.push([k, null]);
        }
        return results$;
      }()));
    } else {
      att1 = Object.fromEntries(Reflect.ownKeys(iw).filter(function(it){
        return !rsp.prop.legacy[it];
      }).map(function(it){
        return [it, true];
      }));
      for (k in att1) {
        hash[k] = iw[k];
      }
      try {
        iw.eval((lib.code || '').replace('"use strict";', '') + rsp.sourceUrl(lib.url || lib.id));
      } catch (e$) {
        e = e$;
        console.error("[@plotdb/rescope] Parse failed", {
          url: lib.url,
          ns: lib.ns,
          name: lib.name,
          version: lib.version,
          path: lib.path
        });
        console.error("[@plotdb/rescope] with this error:", e);
        throw e;
      }
      att2 = Object.fromEntries(Reflect.ownKeys(iw).filter(function(it){
        return !rsp.prop.legacy[it];
      }).map(function(it){
        return [it, true];
      }));
      for (k in att2) {
        if (iw[k] === hash[k] || k === 'NaN') {
          continue;
        }
        fprop[k] = iw[k];
        lib.prop[k] = null;
      }
    }
  } else {
    for (k in fprop) {
      hash[k] = iw[k];
      iw[k] = fprop[k];
    }
  }
  for (k in fprop) {
    ctx[k] = fprop[k];
  }
  this._exports(libs, idx + 1, ctx);
  for (k in fprop) {
    results$.push(iw[k] = hash[k]);
  }
  return results$;
}, ref$._wrapWith = function(o, ctx, opt){
  var code;
  o == null && (o = {});
  ctx == null && (ctx = {});
  opt == null && (opt = {});
  code = "with(scope){" + o.code + "\n}";
  if (opt.codeOnly) {
    return "function(scope, ctx, win){" + code + "}";
  }
  return rsp.compile(code, o.url || o.id);
}, ref$._wrap = function(o, ctx, opt){
  var varre, prop, code, _, k;
  o == null && (o = {});
  ctx == null && (ctx = {});
  opt == null && (opt = {});
  if ((opt.scope || this._scope) === 'with') {
    return this._wrapWith(o, ctx, opt);
  }
  varre = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
  prop = o.prop || {};
  code = "var window, global, globalThis, self, __ret = {}, __win = {}; window = global = globalThis = self = scope;";
  _ = !enableRspvarsetcb
    ? function(){}
    : function(k){
      return "window['_rspvarsetcb_'] = {k:'" + k + "',f:function(v){" + k + "=v}};";
    };
  for (k in prop) {
    if (varre.exec(k)) {
      code += "var " + k + ";" + _(k);
    }
    code += "__win['" + k + "'] = win['" + k + "']; win['" + k + "'] = undefined;";
  }
  for (k in ctx) {
    code += "window['" + k + "'] = ctx['" + k + "'];";
    if (varre.exec(k)) {
      code += "var " + k + " = window['" + k + "'];" + _(k);
    }
  }
  code += "try {" + o.code + "\n;";
  for (k in prop) {
    if (varre.exec(k)) {
      code += "if(!(" + k + ")) { " + k + " = scope['" + k + "']; }\n__ret['" + k + "'] = " + k + " || window['" + k + "'] || win['" + k + "'] || this['" + k + "'];";
    } else {
      code += "__ret['" + k + "'] = window['" + k + "'] || win['" + k + "'] || this['" + k + "'];";
    }
  }
  code += "} finally {";
  for (k in prop) {
    code += "win['" + k + "'] = __win['" + k + "'];";
  }
  code += "}return __ret;";
  if (opt.codeOnly) {
    return "function(scope, ctx, win){" + code + "}";
  }
  return rsp.compile(code, o.url || o.id);
}, ref$._gen = function(lib, ctx){
  var that, code, id, reg, body, url;
  if (that = lib.gen) {
    return Promise.resolve(that);
  }
  if (this._delivery !== 'script' || rsp.__node || !doc) {
    return Promise.resolve(lib.gen = this._wrap(lib, ctx));
  }
  code = this._wrap(lib, ctx, {
    codeOnly: true
  });
  id = this.id + "-" + Math.random().toString(36).substring(2);
  reg = win[rsp.genRegistry] = win[rsp.genRegistry] || {};
  body = "window['" + rsp.genRegistry + "']['" + id + "'] = " + code + ";" + rsp.sourceUrl(lib.url || lib.id);
  url = URL.createObjectURL(new Blob([body], {
    type: 'text/javascript'
  }));
  return new Promise(function(res, rej){
    var node, done;
    node = doc.createElement('script');
    done = function(e){
      var gen, ref$;
      node.remove();
      URL.revokeObjectURL(url);
      if (!(gen = reg[id])) {
        return rej((ref$ = new Error("[@plotdb/rescope] wrapper script blocked or failed for " + lib.id + ". with `delivery: 'script'` the page's CSP has to allow `blob:` in script-src, or use a nonce with 'strict-dynamic'."), ref$.name = 'lderror', ref$.id = 403, ref$));
      }
      delete reg[id];
      return res(lib.gen = gen);
    };
    node.onload = done;
    node.onerror = done;
    node.src = url;
    return doc.body.appendChild(node);
  });
}, ref$.load = function(libs, dctx, forceFetch, onlyFetch){
  var px, ctx, proxy, segs, _, this$ = this;
  dctx == null && (dctx = {});
  forceFetch == null && (forceFetch = false);
  onlyFetch == null && (onlyFetch = false);
  libs = (Array.isArray(libs)
    ? libs
    : [libs]).map(function(o){
    return this$.cache(o);
  });
  px = libs.px
    ? libs.px
    : libs.px = dctx && dctx.p
      ? dctx.p
      : new proxin({
        mode: this._scope
      });
  ctx = px.ctx();
  proxy = px.proxy();
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
  segs = [libs];
  _ = function(idx){
    var libs, ps;
    idx == null && (idx = 0);
    if (!(libs = segs[idx])) {
      return Promise.resolve(ctx);
    }
    ps = libs.map(function(lib){
      var ref;
      if ((lib.code || lib.gen) && !forceFetch) {
        return Promise.resolve();
      }
      ref = this$._ref(lib);
      if (ref.then) {
        return ref.then(function(it){
          lib.code = it.content;
          return this$.cache((lib.id = undefined, lib.version = it.version, lib.code = it.content, lib));
        });
      } else {
        return _fetch(ref, {
          method: 'GET'
        }).then(function(it){
          return lib.code = it;
        });
      }
    });
    return Promise.all(ps).then(function(){
      var i$, ref$, len$, lib;
      if (onlyFetch) {
        return;
      }
      if (this$._scope === 'with') {
        for (i$ = 0, len$ = (ref$ = libs).length; i$ < len$; ++i$) {
          lib = ref$[i$];
          if (!lib.gen && !lib.prop) {
            lib.prop = {};
            lib.propIniting = true;
          }
        }
      } else {
        this$.exports({
          libs: libs,
          ctx: dctx.f
        });
      }
      return libs.reduce(function(p, lib){
        return p.then(function(){
          if (!lib.propIniting) {
            return import$(ctx, lib.prop);
          }
          return this$._gen(lib, ctx).then(function(gen){
            var seen, k;
            if (this$._scope !== 'with') {
              lib.prop = gen.apply(proxy, [proxy, ctx, win]);
            } else {
              seen = Object.fromEntries((function(){
                var results$ = [];
                for (k in ctx) {
                  results$.push([k, true]);
                }
                return results$;
              }()));
              gen.apply(proxy, [proxy, ctx, win]);
              lib.prop = Object.fromEntries((function(){
                var results$ = [];
                for (k in ctx) {
                  if (!seen[k]) {
                    results$.push([k, ctx[k]]);
                  }
                }
                return results$;
              }()));
            }
            lib.propIniting = false;
            return import$(ctx, lib.prop);
          });
        });
      }, Promise.resolve());
    }).then(function(){
      return ctx;
    }).then(function(){
      return _(idx + 1);
    });
  };
  return _(0);
}, ref$.context = function(libs, func, px){
  var ref$;
  if (typeof func !== 'function') {
    ref$ = [px, func], func = ref$[0], px = ref$[1];
  }
  return this.load(libs, px).then(function(ctx){
    if (func) {
      return func(ctx);
    } else {
      return ctx;
    }
  });
}, ref$);
rsp.env(typeof self != 'undefined' && self !== null ? self : globalThis);
rsp.proxin = proxin;
rsp.dualContext = function(){
  return {
    p: new proxin(),
    f: {},
    ctx: function(){
      return this.p.ctx();
    }
  };
};
function import$(obj, src){
  var own = {}.hasOwnProperty;
  for (var key in src) if (own.call(src, key)) obj[key] = src[key];
  return obj;
}
function in$(x, xs){
  var i = -1, l = xs.length >>> 0;
  while (++i < l) if (x === xs[i]) return true;
  return false;
}rsp.prototype.bundle = function(libs){
  var hash, res$, k, v, this$ = this;
  libs == null && (libs = {});
  libs = (Array.isArray(libs)
    ? libs
    : [libs]).map(function(o){
    return this$.cache(o);
  });
  hash = {};
  libs.filter(function(it){
    return it && it.id;
  }).map(function(it){
    return hash[it.id] = it;
  });
  res$ = [];
  for (k in hash) {
    v = hash[k];
    res$.push(v);
  }
  libs = res$;
  return this.load(libs, null, true, true).then(function(){
    var codes;
    this$.exports({
      libs: libs
    });
    codes = libs.filter(function(it){
      return it.code;
    }).map(function(o){
      /*
      code = @_wrap o, {}, code-only: true
      """{#{if o.url => "url: '#{o.url}'," else ''}id: '#{o.id}',gen: #code}"""
      */
      var ref$;
      return JSON.stringify((ref$ = {
        url: o.url,
        id: o.id,
        ns: o.ns,
        name: o.name,
        version: o.version,
        path: o.path,
        code: o.code
      }, ref$.prop = Object.keys(o.prop || {}), ref$));
    });
    return Promise.resolve("[" + codes.join(',') + "].forEach(function(o){rescope.cache(o);})");
  });
};rsp.__node = true;
if (typeof module != 'undefined' && module !== null) {
  module.exports = rsp;
} else if (typeof window != 'undefined' && window !== null) {
  window.rescope = rsp;
}