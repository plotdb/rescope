scope = new rescope do
  registry: ({url, name, version, path}) -> url

tester = ({ctx}) ->
  if ctx.JSZip? =>
    console.log "JSZip running test"
    zip = new ctx.JSZip!
    zip.file \hello.txt, "world"
    hdr = setTimeout (-> console.error "jszip generation timeout."), 2000
    zip.generate-async {type: \blob}
      .finally -> clearTimeout(hdr)
      .then -> console.log "jszip generate succeeded."
      .catch -> console.error "jszip generate failed."
  if ctx.message-test =>
    Promise.resolve!
      .then -> ctx.message-test.fire!
      .then -> debounce 1000
      .then -> ctx.message-test.revoke!
      .then -> debounce 1000
      .then -> ctx.message-test.fire!


load = ({url}) ->
  scope.load(url.split(' ').filter(->it).map(->{url:it.trim!}))
    .then (ctx) ->
      text = "success with:\n\n" + [" - #k" for k of ctx].join(\\n)
      view.get(\result).classList.toggle \border-danger, false
      view.get(\result).classList.toggle \text-danger, false
      view.get(\result).classList.toggle \text-success, true
      view.get(\result).classList.toggle \border-success, true
      view.get(\result).textContent = text
      tester {ctx}
    .catch (e) ->
      view.get(\result).classList.toggle \border-danger, true
      view.get(\result).classList.toggle \text-danger, true
      view.get(\result).classList.toggle \text-success, false
      view.get(\result).classList.toggle \border-success, false
      view.get(\result).textContent = "error: \n\n" + e.toString!
      throw e

view = new ldview do
  root: document.body
  action: click:
    sample: ({node}) ->
      view.get(\url).value = node.dataset.url
      load url: view.get(\url).value
    load: ->
      if !(url = view.get(\url).value) => return
      load {url}
