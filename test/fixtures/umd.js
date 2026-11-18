// the tail of a typical UMD build ( @plotdb/chart's, for one ): no `module`, so it hangs itself on
// `window`. under `scope: 'with'` that `window` has to be the proxy, or the export lands on the host.
(function () {
  var umdLib = { name: "umd" };
  if (typeof module !== "undefined" && module !== null) module.exports = umdLib;
  else if (typeof window !== "undefined" && window !== null) window.umdLib = umdLib;
}).call(this);
