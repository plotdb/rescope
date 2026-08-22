// a library that throws out of a timer, so the trace has no frame of ours left on the stack.
var asyncThrower = {};
asyncThrower.run = function () {
  return new Promise(function (res, rej) {
    setTimeout(function () { rej(new Error("boom from a timer")) }, 0);   // <- line 5
  });
};
