// the libraries the suite loads. real, minified, third party code - the point of the exercise is
// that rescope survives what these actually do, not what a toy fixture does.
//
//  - marked      : exports through a top level `var`, the case the peek exists for
//  - d3          : plain UMD, assigns onto the global
//  - jszip       : ships the setImmediate polyfill, which creates a global at run time and then
//                  reads it back as a bare identifier, and talks to itself over `message` events
//  - lodash      : fingerprints its global with `global.Object === Object`
//  - moment      : heavy enough to show what `with` costs at run time
//  - vue         : builds a real component tree against the document
//  - marked4     : a second version of marked, for the two-versions-at-once check ( optional )
const fs = require('fs');
const path = require('path');

const LIBS = {
  marked: 'marked/marked.min.js',
  d3: 'd3/dist/d3.min.js',
  jszip: 'jszip/dist/jszip.min.js',
  lodash: 'lodash/lodash.min.js',
  moment: 'moment/min/moment.min.js',
  vue: 'vue/dist/vue.min.js',
  marked4: 'marked4/marked.min.js',
};

// libs every case needs. `marked4` is optional: it is an npm alias, and older npm can't install it.
const REQUIRED = ['marked', 'd3', 'jszip', 'lodash', 'moment', 'vue'];

const libPath = (name) => path.join(__dirname, '..', '..', 'node_modules', LIBS[name]);
const has = (name) => !!LIBS[name] && fs.existsSync(libPath(name));
const missing = () => REQUIRED.filter(n => !has(n));

module.exports = {LIBS, REQUIRED, libPath, has, missing};
