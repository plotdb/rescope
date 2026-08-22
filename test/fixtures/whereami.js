// reports what a library can find out about where it came from. `document` is guarded because
// jsdom's peek window does not have one; the run that matters ( the wrapper's ) does.
// `__d` rather than a short name: jsdom's peek context is shared with the harness's own
// scope, so a common identifier here collides with whatever the runner happens to declare.
var __d = (typeof document !== "undefined") ? document : null;
this.whereAmI = {
  currentScript: (__d && __d.currentScript) ? __d.currentScript.src : null,
  currentScriptAttr: (__d && __d.currentScript) ? __d.currentScript.getAttribute("src") : null,
  parentTag: (__d && __d.currentScript && __d.currentScript.parentNode) ? __d.currentScript.parentNode.tagName : null,
  lastScript: (function(){
    if (!__d) return "(no document)";
    var t = __d.getElementsByTagName("script");
    return t.length ? t[t.length - 1].src : "(no script tags)";
  })()
};
