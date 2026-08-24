var registry, esc, note, reset, framesNow, d3sets, draw, runVersions, dialogPkg, dialogTpl, ensureDialog, runDialog, loaderCheck, loaderResult, loaderLoad, srcCache, source, elFrames, nameOf, elLibFrame, elExcerpt, elFmtFrame, elRender, elScoped, elPlain, elVerdict, elReallyThrow, elLast, elRunning, elPending, elRun, bundleLibs, runBundle, spy, view;
registry = {
  url: function(arg$){
    var url, name, version, path;
    url = arg$.url, name = arg$.name, version = arg$.version, path = arg$.path;
    return url || "https://unpkg.com/" + name + (version && "@" + version || '') + (path && "/" + path || '');
  },
  fetch: function(arg$){
    var url, name, version, path;
    url = arg$.url, name = arg$.name, version = arg$.version, path = arg$.path;
    return fetch(url).then(function(res){
      var ret;
      ret = /^https:\/\/unpkg.com\/([^@]+)@([^/]+)\//.exec(res.url) || [];
      return res.text().then(function(it){
        return {
          version: ret[2] || version,
          content: it
        };
      });
    });
  }
};
esc = function(t){
  return ((t != null ? t : '') + "").replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};
note = function(key, text, cls){
  var n;
  cls == null && (cls = 'text-secondary');
  n = view.get(key);
  n.className = "small mt-2 " + cls;
  return n.textContent = text;
};
reset = function(){
  rescope._cache = {};
  return rescope._ver = {
    map: {},
    list: {}
  };
};
framesNow = function(){
  return document.querySelectorAll('iframe').length;
};
d3sets = [
  {
    id: 'd3v3',
    libs: {
      name: 'd3',
      version: "3",
      path: "d3.min.js"
    }
  }, {
    id: 'd3v4',
    libs: [
      {
        url: "/assets/dev/d3.v4.js",
        async: false
      }, "https://d3js.org/d3-format.v2.min.js", {
        name: "d3-array",
        version: "2",
        path: "dist/d3-array.min.js"
      }, "https://d3js.org/topojson.v2.min.js", {
        url: "https://d3js.org/d3-color.v1.min.js",
        async: false
      }, {
        url: "https://d3js.org/d3-interpolate.v1.min.js",
        async: false
      }, "https://d3js.org/d3-scale-chromatic.v1.min.js", "https://d3js.org/d3-dispatch.v2.min.js", "https://d3js.org/d3-quadtree.v2.min.js", "https://d3js.org/d3-timer.v2.min.js", "https://d3js.org/d3-force.v2.min.js"
    ]
  }, {
    id: 'd3v5',
    libs: {
      name: 'd3',
      version: "5",
      path: "dist/d3.min.js"
    }
  }, {
    id: 'd3v6',
    libs: {
      name: 'd3',
      version: "6",
      path: "dist/d3.min.js"
    }
  }, {
    id: 'd3v7',
    libs: {
      name: 'd3',
      version: "7",
      path: "dist/d3.min.js"
    }
  }
];
draw = function(d3, id){
  var node, box;
  node = document.getElementById(id);
  node.innerHTML = '';
  box = node.getBoundingClientRect();
  return d3.select("svg#" + id).selectAll('circle').data([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60].map(function(){
    return {
      x: Math.random(),
      y: Math.random(),
      r: Math.random()
    };
  })).enter().append('circle').attr('cx', function(it){
    return it.x * box.width;
  }).attr('cy', function(it){
    return it.y * box.height;
  }).attr('r', function(it){
    return it.r * 9;
  }).attr('fill', function(){
    return '#000';
  });
};
runVersions = function(){
  var scope, before;
  note('versions-note', "loading ...");
  scope = new rescope({
    registry: registry
  });
  before = framesNow();
  return d3sets.reduce(function(p, set){
    return p.then(function(){
      return scope.load(set.libs);
    });
  }, Promise.resolve()).then(function(){
    return Promise.all(d3sets.map(function(set){
      return scope.context(set.libs, function(arg$){
        var d3;
        d3 = arg$.d3;
        draw(d3, set.id);
        return d3.version;
      });
    }));
  }).then(function(versions){
    return note('versions-note', versions.join(' / ') + " - five of them, at once. the page's own `window.d3` is " + typeof window.d3 + ". " + (framesNow() - before) + " iframe(s) created.", 'text-success');
  })['catch'](function(e){
    return note('versions-note', e + "", 'text-danger');
  });
};
dialogPkg = [
  'assets/lib/bootstrap.native/main/dist/bootstrap-native.min.js', {
    url: 'assets/lib/@loadingio/ldquery/main/index.min.js',
    async: false
  }, 'assets/lib/ldcover/main/index.min.js', 'assets/lib/ldview/main/index.min.js', 'js/functest.js'
];
dialogTpl = null;
ensureDialog = function(){
  var node, i$, ref$, len$, n;
  if (!dialogTpl && (node = document.querySelector('.ldcv'))) {
    dialogTpl = node.cloneNode(true);
  }
  if (!dialogTpl) {
    return;
  }
  for (i$ = 0, len$ = (ref$ = document.querySelectorAll('.ldcv')).length; i$ < len$; ++i$) {
    n = ref$[i$];
    n.remove();
  }
  return document.body.appendChild(dialogTpl.cloneNode(true));
};
runDialog = function(){
  var scope;
  note('dialog-note', "loading ...");
  ensureDialog();
  scope = new rescope({
    registry: registry
  });
  return scope.load(dialogPkg).then(function(){
    return scope.context(dialogPkg, function(arg$){
      var functest;
      functest = arg$.functest;
      return functest();
    });
  }).then(function(){
    return note('dialog-note', "opened from inside the scope. the page itself still has no `ldcover` ( " + typeof window.ldcover + " ).", 'text-success');
  })['catch'](function(e){
    return note('dialog-note', e + "", 'text-danger');
  });
};
loaderCheck = function(ctx){
  var zip, hdr;
  if (ctx.JSZip != null) {
    zip = new ctx.JSZip();
    zip.file('hello.txt', "world");
    hdr = setTimeout(function(){
      return console.error("jszip generation timeout.");
    }, 2000);
    zip.generateAsync({
      type: 'blob'
    })['finally'](function(){
      return clearTimeout(hdr);
    }).then(function(){
      return console.log("jszip generate succeeded.");
    })['catch'](function(){
      return console.error("jszip generate failed.");
    });
  }
  if (ctx.messageTest) {
    return Promise.resolve().then(function(){
      return ctx.messageTest.fire();
    }).then(function(){
      return debounce(1000);
    }).then(function(){
      return ctx.messageTest.revoke();
    }).then(function(){
      return debounce(1000);
    }).then(function(){
      return ctx.messageTest.fire();
    });
  }
};
loaderResult = function(text, ok){
  var n, i$, ref$, len$, c;
  n = view.get('lt-result');
  for (i$ = 0, len$ = (ref$ = ['border-danger', 'text-danger', 'border-success', 'text-success']).length; i$ < len$; ++i$) {
    c = ref$[i$];
    n.classList.remove(c);
  }
  if (ok != null) {
    n.classList.add(ok ? 'border-success' : 'border-danger', ok ? 'text-success' : 'text-danger');
  }
  return n.textContent = text;
};
loaderLoad = function(url){
  var scope;
  loaderResult("loading ...");
  scope = new rescope({
    registry: registry
  });
  return scope.load(url.split(' ').filter(function(it){
    return it;
  }).map(function(it){
    return {
      url: it.trim()
    };
  })).then(function(ctx){
    var k;
    loaderResult("success with:\n\n" + (function(){
      var results$ = [];
      for (k in ctx) {
        results$.push(" - " + k);
      }
      return results$;
    }()).join('\n'), true);
    return loaderCheck(ctx);
  })['catch'](function(e){
    loaderResult("error:\n\n" + e, false);
    throw e;
  });
};
srcCache = {};
source = function(url){
  var that;
  if (that = srcCache[url]) {
    return Promise.resolve(that);
  }
  return fetch(url).then(function(it){
    return it.text();
  }).then(function(t){
    return srcCache[url] = t.split('\n');
  });
};
elFrames = function(e){
  return ((e && e.stack
    ? e.stack
    : e + "") + '').split('\n').filter(function(it){
    return it.trim();
  }).map(function(line){
    var m;
    m = /[(@ ]([^\s()]+?):(\d+):(\d+)\)?\s*$/.exec(line);
    return {
      text: line.trim(),
      url: m ? m[1] : null,
      line: m ? +m[2] : 0,
      col: m ? +m[3] : 0
    };
  });
};
nameOf = function(u){
  return (u + "").split('?')[0].split('/').slice(-1)[0];
};
elLibFrame = function(fs, url){
  var target, i$, len$, f;
  target = nameOf(url);
  for (i$ = 0, len$ = fs.length; i$ < len$; ++i$) {
    f = fs[i$];
    if (f.url && nameOf(f.url) === target) {
      return f;
    }
  }
  return null;
};
elExcerpt = function(lines, f){
  var ref$, a, b, ret, i$, i, text, cls;
  ref$ = [Math.max(1, f.line - 3), Math.min(lines.length, f.line + 3)], a = ref$[0], b = ref$[1];
  ret = "\n\n<span class=\"text-secondary\">" + esc(nameOf(f.url)) + ", line " + f.line + ", column " + f.col + ":</span>\n";
  for (i$ = a; i$ <= b; ++i$) {
    i = i$;
    text = lines[i - 1];
    if (text != null && text.length > 160) {
      text = text.substr(0, 160) + " …";
    }
    cls = i === f.line ? 'text-danger' : 'text-secondary';
    ret += "<span class=\"" + cls + "\">" + ("    " + i).slice(-4) + " | " + esc(text) + "</span>\n";
  }
  if (f.line >= a && f.line <= b && f.col > 0 && f.col < 160) {
    ret += "<span class=\"text-danger\">" + Array(7 + f.col).join(' ') + "^</span>";
  }
  return ret;
};
elFmtFrame = function(x, hit){
  var cls;
  cls = hit && x === hit ? 'text-danger' : 'text-secondary';
  return "<span class=\"" + cls + "\">" + esc(x.text) + "</span>";
};
elRender = function(key, r, url){
  var node, f, fs, head, body, x;
  node = view.get(key);
  if (!r.error) {
    node.innerHTML = "<span class=\"text-success\">no error.</span>\n\n" + esc(r.note || '');
    return Promise.resolve(null);
  }
  f = elLibFrame(fs = elFrames(r.error), url);
  head = "<b>" + esc(String(r.error)) + "</b>\n<span class=\"text-secondary\">threw while " + r.phase + "</span>\n\n";
  body = (function(){
    var i$, ref$, len$, results$ = [];
    for (i$ = 0, len$ = (ref$ = fs).length; i$ < len$; ++i$) {
      x = ref$[i$];
      results$.push(elFmtFrame(x, f));
    }
    return results$;
  }()).join('\n');
  return (f
    ? source(url).then(function(lines){
      return elExcerpt(lines, f);
    })
    : Promise.resolve('')).then(function(ex){
    node.innerHTML = head + body + ex;
    return f;
  });
};
elScoped = function(arg$){
  var url, call, scope;
  url = arg$.url, call = arg$.call;
  reset();
  scope = new rescope({
    registry: function(arg$){
      var url;
      url = arg$.url;
      return url;
    },
    scope: view.get('el-scope').value,
    delivery: view.get('el-delivery').value
  });
  return scope.load([{
    url: url
  }]).then(function(ctx){
    var k, lib;
    if (!call) {
      return {
        note: "loaded. exports: " + (function(){
          var results$ = [];
          for (k in ctx) {
            results$.push(k);
          }
          return results$;
        }()).join(', ')
      };
    }
    if (!(lib = ctx[call]) || typeof lib.run !== 'function') {
      return {
        note: "loaded, but there is no `" + call + ".run()` in the context to call."
      };
    }
    return Promise.resolve().then(function(){
      return lib.run();
    }).then(function(){
      return {
        note: "`" + call + ".run()` returned without throwing."
      };
    })['catch'](function(e){
      return {
        error: e,
        phase: "calling `" + call + ".run()`"
      };
    });
  })['catch'](function(e){
    return {
      error: e,
      phase: 'loading'
    };
  });
};
elPlain = function(arg$){
  var url, call;
  url = arg$.url, call = arg$.call;
  return new Promise(function(res){
    var caught, handler, node, done;
    caught = null;
    handler = function(e){
      if (!caught && (e.filename || '').indexOf(url.split('?')[0]) >= 0) {
        return caught = e;
      }
    };
    window.addEventListener('error', handler);
    node = document.createElement('script');
    done = function(){
      var lib;
      window.removeEventListener('error', handler);
      node.remove();
      if (caught) {
        return res({
          error: caught.error || caught,
          phase: 'loading'
        });
      }
      if (!call) {
        return res({
          note: "loaded."
        });
      }
      if (!(lib = window[call]) || typeof lib.run !== 'function') {
        return res({
          note: "loaded, but `window." + call + ".run()` is not there to call."
        });
      }
      return Promise.resolve().then(function(){
        return lib.run();
      }).then(function(){
        return res({
          note: "`" + call + ".run()` returned without throwing."
        });
      })['catch'](function(e){
        return res({
          error: e,
          phase: "calling `" + call + ".run()`"
        });
      }).then(function(){
        var ref$;
        if (call) {
          return ref$ = window[call], delete window[call], ref$;
        }
      });
    };
    node.onload = done;
    node.onerror = done;
    node.src = url;
    return document.body.appendChild(node);
  });
};
elVerdict = function(a, b){
  var node, ref$, cls, text;
  node = view.get('el-verdict');
  node.classList.remove('border-success', 'border-danger', 'text-success', 'text-danger');
  ref$ = (function(){
    switch (false) {
    case !(!a && !b):
      return ['text-secondary', "neither run reported a frame in the library's own file."];
    case !!a:
      return ['text-danger', "the scoped run never named the library's file. the plain one pointed at line " + b.line + ". that is what a lost sourceURL looks like."];
    case !!b:
      return ['text-secondary', "only the scoped run named the library's file ( line " + a.line + ", column " + a.col + " ). nothing to compare it against."];
    case !(a.line === b.line && a.col === b.col):
      return ['text-success', "same place both ways: line " + a.line + ", column " + a.col + "."];
    case !(a.line === b.line && a.line === 1):
      return ['text-secondary', "same line ( 1 ), different column: " + a.col + " scoped, " + b.col + " plain - the wrapper's prologue has to share line 1 with the library to keep every other line honest, so line 1's columns carry its length."];
    case a.line !== b.line:
      return ['text-danger', "same line ( " + a.line + " ), different column: " + a.col + " scoped, " + b.col + " plain."];
    default:
      return ['text-danger', "different place: line " + a.line + ":" + a.col + " scoped, " + b.line + ":" + b.col + " plain - every line the library reports is off by " + (a.line - b.line) + "."];
    }
  }()), cls = ref$[0], text = ref$[1];
  if (a && b && a.url !== b.url) {
    text += " ( named `" + a.url + "` scoped and `" + b.url + "` plain - a sourceURL is shown as given. )";
  }
  node.classList.add(cls);
  node.classList.add(cls === 'text-success'
    ? 'border-success'
    : cls === 'text-danger' ? 'border-danger' : 'border');
  return node.textContent = text;
};
elReallyThrow = function(arg$){
  var url, call;
  url = arg$.url, call = arg$.call;
  return new Promise(function(res){
    var done, hdr, onError, onReject, finish, scope;
    done = false;
    hdr = null;
    onError = null;
    onReject = null;
    finish = function(r){
      if (done) {
        return;
      }
      done = true;
      clearTimeout(hdr);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onReject);
      return res(r);
    };
    onError = function(e){
      return finish({
        filename: e.filename,
        line: e.lineno,
        col: e.colno
      });
    };
    onReject = function(e){
      var frame;
      frame = (((e.reason && e.reason.stack) || '').split('\n')[1] || '').trim();
      return finish({
        kind: 'unhandled rejection',
        frame: frame
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onReject);
    hdr = setTimeout(function(){
      return finish(null);
    }, 4000);
    scope = new rescope({
      registry: function(arg$){
        var url;
        url = arg$.url;
        return url;
      },
      scope: view.get('el-scope').value,
      delivery: view.get('el-delivery').value
    });
    if (!call) {
      return scope.load([{
        url: url
      }]);
    } else {
      return scope.load([{
        url: url
      }]).then(function(ctx){
        if (ctx[call] && typeof ctx[call].run === 'function') {
          return setTimeout(function(){
            return ctx[call].run();
          }, 0);
        } else {
          return finish(null);
        }
      });
    }
  });
};
elLast = null;
elRunning = false;
elPending = null;
elRun = function(o){
  if (elRunning) {
    return elPending = o;
  }
  elRunning = true;
  elLast = o;
  view.get('el-url').value = o.url;
  view.get('el-call').value = o.call || '';
  view.get('el-scoped').textContent = view.get('el-plain').textContent = 'running ...';
  view.get('el-verdict').textContent = 'running ...';
  return Promise.all([
    elScoped(o).then(function(r){
      return elRender('el-scoped', r, o.url);
    }), elPlain(o).then(function(r){
      return elRender('el-plain', r, o.url);
    })
  ]).then(function(arg$){
    var a, b;
    a = arg$[0], b = arg$[1];
    return elVerdict(a, b);
  }).then(function(){
    var n;
    n = view.get('el-thrown');
    if (!view.get('el-throw').checked) {
      return n.textContent = '';
    }
    n.className = "small mb-2 text-secondary";
    n.textContent = "running it again with nothing catching it ...";
    return elReallyThrow(o).then(function(r){
      n.className = "small mb-2 text-secondary";
      return n.textContent = !r
        ? "left alone, it did not throw."
        : r.filename != null
          ? "thrown for real. the browser reported it at " + r.filename + ":" + r.line + ":" + r.col + " - the same entry is in the console, and those numbers are the engine's, not ours."
          : "thrown for real, as an " + r.kind + ": " + r.frame + " - the same entry is in the console.";
    });
  })['finally'](function(){
    var o2;
    elRunning = false;
    if (elPending) {
      o2 = elPending;
      elPending = null;
      return elRun(o2);
    }
  });
};
bundleLibs = [
  {
    name: 'd3',
    version: "^4.0.0",
    path: "build/d3.min.js"
  }, {
    name: 'ldview',
    version: "~0.1.0",
    path: "dist/index.min.js"
  }, {
    name: 'proxise',
    version: "^0.1.4",
    path: "dist/proxise.min.js"
  }
];
runBundle = function(){
  var n;
  n = view.get('bundle-result');
  n.textContent = "building the bundle ( this fetches each library once ) ...";
  reset();
  return new rescope({
    registry: registry
  }).bundle(bundleLibs).then(function(code){
    var scope, before;
    reset();
    window.eval(code);
    scope = new rescope({
      registry: registry
    });
    before = document.querySelectorAll('iframe').length;
    return scope.load(bundleLibs).then(function(ctx){
      var k;
      return n.textContent = "bundle: " + Math.round(code.length / 1024) + " kb, export names recorded: " + /"prop":\[/.test(code) + "\n\nloaded from it, in a fresh scope:\n" + (function(){
        var results$ = [];
        for (k in ctx) {
          results$.push(" - " + k);
        }
        return results$;
      }()).join('\n') + "\n\niframes created while loading: " + (document.querySelectorAll('iframe').length - before) + "\n( the export names came with the bundle, so nothing had to peek )";
    });
  })['catch'](function(e){
    return n.textContent = "error:\n\n" + e;
  });
};
spy = function(){
  var links, seen, cb, obs, i$, len$, s, results$ = [];
  links = Array.prototype.slice.call(document.querySelectorAll('.rsp-nav a'));
  seen = links.map(function(a){
    return document.querySelector(a.getAttribute('href'));
  });
  cb = function(entries){
    var i$, len$, e, lresult$, idx, j$, ref$, len1$, i, a, results$ = [];
    for (i$ = 0, len$ = entries.length; i$ < len$; ++i$) {
      e = entries[i$];
      lresult$ = [];
      if (e.isIntersecting) {
        idx = seen.indexOf(e.target);
        for (j$ = 0, len1$ = (ref$ = links).length; j$ < len1$; ++j$) {
          i = j$;
          a = ref$[j$];
          lresult$.push(a.classList.toggle('active', i === idx));
        }
      }
      results$.push(lresult$);
    }
    return results$;
  };
  obs = new IntersectionObserver(cb, {
    rootMargin: "0px 0px -70% 0px"
  });
  for (i$ = 0, len$ = seen.length; i$ < len$; ++i$) {
    s = seen[i$];
    if (s) {
      results$.push(obs.observe(s));
    }
  }
  return results$;
};
view = new ldview({
  root: document.body,
  action: {
    click: {
      'run-versions': function(){
        return runVersions();
      },
      'run-dialog': function(){
        return runDialog();
      },
      'run-bundle': function(){
        return runBundle();
      },
      'lt-sample': function(arg$){
        var node;
        node = arg$.node;
        view.get('lt-url').value = node.dataset.url;
        return loaderLoad(node.dataset.url);
      },
      'lt-load': function(){
        var url;
        if (url = view.get('lt-url').value) {
          return loaderLoad(url);
        }
      },
      'el-sample': function(arg$){
        var node;
        node = arg$.node;
        return elRun({
          url: node.dataset.url,
          call: node.dataset.call
        });
      },
      'el-load': function(){
        var url;
        if (url = view.get('el-url').value) {
          return elRun({
            url: url,
            call: view.get('el-call').value
          });
        }
      },
      'el-rerun': function(){
        if (elLast) {
          return elRun(elLast);
        }
      }
    },
    change: {
      'el-scope': function(){
        if (elLast) {
          return elRun(elLast);
        }
      },
      'el-delivery': function(){
        if (elLast) {
          return elRun(elLast);
        }
      }
    }
  }
});
spy();
ensureDialog();