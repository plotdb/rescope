rsp = new rescope!
rsp.registry ({name, version, path}) ->
  if version == \main => version = \latest
  "https://cdn.jsdelivr.net/npm/#{name}@#{version}/#{path or 'index.min.js'}"

libs = [
  #* url: "/assets/dev/d3.v4.js"
  * name: "d3", version: "^4.0.0", path: "build/d3.min.js"
  #* name: "ldview", version: "0.2.7", path: "dist/index.min.js"
  * name: "ldview", version: "~0.1.0", path: "dist/index.min.js"
  #* name: "ldfile", version: "main", path: "dist/index.min.js"
  * name: "proxise", version: "^0.1.4", path: "dist/proxise.min.js"
]

bundle = ->
  rsp.bundle libs
    .then -> ldfile.download data: it, name: "bundle.js"

loader = ->
  rsp.load libs
    .then ->
      rsp.context libs
    .then (ctx) ->
      console.log "1", ctx
      libs.map (lib) ->
        console.log rsp.cache lib
      #d3 = ctx.d3
      #d3.selectAll \body
      #  .style \background, \#f00

view = new ldview do
  root: document.body
  action: click:
    download: -> bundle!
    loader: -> loader!
  handler:
    lib:
      list: -> libs
      view: text: "@": ({ctx}) -> JSON.stringify(ctx)

