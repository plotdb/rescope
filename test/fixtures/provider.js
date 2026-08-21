// first half of the load-order pair: exports a name the next library in the same batch reads.
// assigned onto `this` rather than declared with `var` - jsdom's peek window does not turn a
// top level `var` into a property, so a `var` here would test nothing in the node half.
this.provided = function () { return "provided"; };
