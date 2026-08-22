// a library that loads fine and throws later, from a call the page makes.
var callThrower = {};
function inner(msg) {
  throw new Error(msg);                         // <- line 4
}
function outer() { inner("boom from outer") }   // <- line 6
callThrower.run = function () { outer() };      // <- line 7
