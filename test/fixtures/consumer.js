// second half: reads `provided` as a bare identifier - both while loading and afterwards. the
// wrapper's prologue only declares the names that were in the context when it was compiled, so
// this stays undefined if the whole batch is compiled before any of it has run.
this.consumer = {
  atLoad: typeof provided !== "undefined" ? provided() : "missing at load",
  later: function () { return typeof provided !== "undefined" ? provided() : "missing later"; }
};
