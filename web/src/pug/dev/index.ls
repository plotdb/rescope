libs = [
  {url: "https://d3js.org/d3.v4.js", async: false}
  {url: "https://d3js.org/d3-selection.v2.min.js"}
  {url: "https://d3js.org/d3-transition.v2.min.js"}
  {url: "https://d3js.org/d3-format.v2.min.js"}
  {url: "https://d3js.org/d3-array.v2.min.js"}
  {url: "https://d3js.org/topojson.v2.min.js"}
  {url: "https://d3js.org/d3-color.v2.min.js"}
  {url: "https://d3js.org/d3-path.v2.min.js"}
  {url: "https://d3js.org/d3-shape.v2.min.js"}
  {url: "https://d3js.org/d3-interpolate.v2.min.js", async: false}
  {url: "https://d3js.org/d3-scale-chromatic.v1.min.js"}
  {url: "https://d3js.org/d3-dispatch.v2.min.js", async: false}
  {url: "https://d3js.org/d3-ease.v2.min.js"}
  {url: "https://d3js.org/d3-quadtree.v2.min.js"}
  {url: "https://d3js.org/d3-timer.v2.min.js"}
  {url: "https://d3js.org/d3-force.v2.min.js", async: false}
  {url: "https://d3js.org/d3-hierarchy.v2.min.js"}
  {url: "https://unpkg.com/d3-force-boundary@0.0.1/dist/d3-force-boundary.min.js"}
  {url: "https://d3js.org/d3-random.v2.min.js"}
  {url: "https://unpkg.com/ldcolor@0.0.3/dist/ldcolor.min.js"}
  {url: "https://d3js.org/d3-drag.v2.min.js",async: false}
  {url: "https://d3js.org/d3-brush.v2.min.js"}
  {url: "https://cdn.jsdelivr.net/npm/pdmaptw@0.0.2/dist/pdmaptw.min.js"}
  {url: "https://unpkg.com/d3-cloud@1.2.5/build/d3.layout.cloud.js"}
  # voronoijs is a dead link ( 404 ). `load` batches the fetches, so one of these taking the
  # whole page down with it is what this list costs.
]

# the libs above are given by url, and the default string registry builds its path from
# name / version / path - it would ask for `/assets/lib/undefined/main/index.min.js`. every other
# page here passes the same registry for the same reason.
scope = new rescope registry: ({url}) -> url
scope.init!
  .then ->
    scope.load libs
  .then ->
    console.log d3
    scope.context libs, ->
      console.log \hi!, (d3.select document.body .transition)
