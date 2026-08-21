// a library that throws from a known line, for checking stack traces.
var boomlib = {};
function boomer(msg) {
  throw new Error(msg);   // <- line 4. a trace has to point here.
}
boomlib.run = function(){ boomer("deferred boom") };   // line 6
