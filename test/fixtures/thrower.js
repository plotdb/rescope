// a library that fails while loading. the host page globals it shadowed must come back.
var boomlib = {};
throw new Error("thrown while loading");
