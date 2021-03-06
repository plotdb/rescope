(function(){
  var rescope;
  rescope = function(opt){
    opt == null && (opt = {});
    this.opt = import$({
      delegate: true,
      useDelegateLib: false
    }, opt);
    this.global = opt.global || window;
    this.scope = {};
    return this;
  };
  rescope.prototype = import$(Object.create(Object.prototype), {
    peekScope: function(){
      console.log("in delegate frame: " + !!this.global._rescopeDelegate);
      return this.global._rescopeDelegate;
    },
    init: function(){
      var this$ = this;
      if (!this.opt.delegate) {
        return Promise.resolve();
      }
      return new Promise(function(res, rej){
        var node, ref$, code;
        node = document.createElement('iframe');
        node.setAttribute('name', "delegator-" + Math.random().toString(36).substring(2));
        node.setAttribute('sandbox', 'allow-same-origin allow-scripts');
        ref$ = node.style;
        ref$.opacity = 0;
        ref$.zIndex = -1;
        ref$.pointerEvents = 'none';
        ref$.width = '0px';
        ref$.height = '0px';
        code = "<html><body>\n<script>\nfunction init() {\n  if(!window._scope) { window._scope = new rescope({delegate:false,global:window}) }\n}\nfunction load(url) {\n  init();\n  return _scope.load(url,false);\n}\nfunction context(url,func,delegate,untilResolve) {\n  init();\n  _scope.context(url,func,false,untilResolve);\n}\n</script></body></html>";
        node.onerror = function(it){
          return rej(it);
        };
        node.onload = function(){
          var ref$;
          ref$ = this$.delegate = node.contentWindow;
          ref$.rescope = rescope;
          ref$._rescopeDelegate = true;
          return res();
        };
        node.src = URL.createObjectURL(new Blob([code], {
          type: 'text/html'
        }));
        return document.body.appendChild(node);
      });
    },
    context: function(url, func, delegate, untilResolve){
      var stacks, scopes, context, i$, to$, i, ref$, stack, scope, k, ret, p, this$ = this;
      delegate == null && (delegate = true);
      untilResolve == null && (untilResolve = false);
      if (delegate && this.opt.delegate && this.opt.useDelegateLib) {
        return this.delegate.context(url, func);
      }
      url = Array.isArray(url)
        ? url
        : [url];
      stacks = [];
      scopes = [];
      context = {};
      for (i$ = 0, to$ = url.length; i$ < to$; ++i$) {
        i = i$;
        ref$ = [{}, this.scope[url[i].url || url[i]] || {}], stack = ref$[0], scope = ref$[1];
        for (k in scope) {
          stack[k] = this.global[k];
          this.global[k] = scope[k];
          context[k] = scope[k];
        }
        stacks.push(stack);
        scopes.push(scope);
      }
      ret = func(context);
      p = untilResolve && ret && ret.then
        ? ret
        : Promise.resolve();
      return p.then(function(){
        var i$, i, lresult$, scope, stack, k, results$ = [];
        for (i$ = scopes.length - 1; i$ >= 0; --i$) {
          i = i$;
          lresult$ = [];
          scope = scopes[i];
          stack = stacks[i];
          for (k in scope) {
            lresult$.push(this$.global[k] = stack[k]);
          }
          results$.push(lresult$);
        }
        return results$;
      });
    },
    load: function(url, delegate){
      var this$ = this;
      delegate == null && (delegate = true);
      if (!url) {
        return Promise.resolve();
      }
      url = Array.isArray(url)
        ? url
        : [url];
      return Promise.resolve().then(function(){
        return delegate && this$.opt.delegate
          ? this$.delegate.load(url).then(function(it){
            import$(this$.scope, this$.delegate._scope.scope);
            return it;
          })
          : Promise.resolve();
      }).then(function(){
        var ret;
        ret = {};
        return new Promise(function(res, rej){
          var _;
          _ = function(list, idx){
            var items, i$, to$, i;
            items = [];
            if (idx >= list.length) {
              return res(ret);
            }
            for (i$ = idx, to$ = list.length; i$ < to$; ++i$) {
              i = i$;
              items.push(list[i]);
              if (list[i].async != null && !list[i].async) {
                break;
              }
            }
            if (!items.length) {
              return res(ret);
            }
            return Promise.all(items.map(function(it){
              return this$._load(it.url || it).then(function(it){
                return import$(ret, it);
              });
            })).then(function(){
              return this$.context(items.map(function(it){
                return it.url || it;
              }), function(){
                return _(list, idx + items.length);
              }, false, true);
            })['catch'](function(it){
              return rej(it);
            });
          };
          return _(url, 0);
        });
      });
    },
    _load: function(url){
      var this$ = this;
      return new Promise(function(res, rej){
        var script, hash, k, ref$, v, fullUrl;
        script = this$.global.document.createElement("script");
        hash = {};
        for (k in ref$ = this$.global) {
          v = ref$[k];
          hash[k] = v;
        }
        script.onerror = function(it){
          return rej(it);
        };
        script.onload = function(){
          var scope, k, v, ref$;
          if (this$.scope[url]) {
            scope = this$.scope[url];
            for (k in scope) {
              v = scope[k];
              scope[k] = this$.global[k];
              this$.global[k] = hash[k];
            }
          } else {
            this$.scope[url] = scope = {};
            for (k in ref$ = this$.global) {
              v = ref$[k];
              if (hash[k] != null || !(this$.global[k] != null)) {
                continue;
              }
              scope[k] = this$.global[k];
              this$.global[k] = hash[k];
            }
          }
          return res(scope);
        };
        fullUrl = /(https?:)?\/\//.exec(url)
          ? url
          : window.location.origin + (url[0] === '/' ? '' : '/') + url;
        script.setAttribute('src', fullUrl);
        return this$.global.document.body.appendChild(script);
      });
    }
  });
  if (typeof module != 'undefined' && module !== null) {
    module.exports = rescope;
  }
  if (typeof window != 'undefined' && window !== null) {
    window.rescope = rescope;
  }
  function import$(obj, src){
    var own = {}.hasOwnProperty;
    for (var key in src) if (own.call(src, key)) obj[key] = src[key];
    return obj;
  }
}).call(this);
