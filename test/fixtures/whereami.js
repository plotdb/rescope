// reports what a library can find out about where it came from. the `document` guard and the
// deliberately odd name are belt and braces for a peek window that isn't a real one: a jsdom
// created without `runScripts` evaluates in a global with no document, shared with the caller's
// own scope. the suite passes `runScripts: 'outside-only'` so neither applies, but a library
// should survive being peeked in a poor imitation of a window.
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
