// a library that fails while it is still loading.
// the trace has to point at line 5 of this file.
var loadThrower = {ready: false};

throw new Error("thrown while loading");
