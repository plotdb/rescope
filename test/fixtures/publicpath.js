// the amcharts idiom: derive a base url from the script element that loaded me, and do not start
// without one. both halves fail under rescope unless it is handed a script of its own - a document
// with no scripts gives `undefined.src`, and an inline script's empty `src` makes the regex null.
this.publicPath = {
  base: /(.*\/)[^\/]*$/.exec((function(){
    if (document.currentScript) return document.currentScript;
    var t = document.getElementsByTagName("script");
    return t[t.length - 1];
  })().src)[1]
};
