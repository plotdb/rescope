window.onmessage = (evt) ->
  flag = evt.source == window
  console.log(
    """%c[message-test] window.onmessage is called.%c
    >>> evt.source == window? <%c#{flag}%c>
    >>> evt.data.trigger? <#{evt.data.trigger}>""",
    'color:#099', "color:black", "color:#{if flag => \#3b3 else \#f00}", "color:black"
  )

window.parent.onmessage = (evt) ->
  flag = evt.source == window
  console.log(
    """%c[message-test] parent.onmessage called.%c
    >>> evt.source == window? <%c#{flag}%c>
    >>> evt.data.trigger? <#{evt.data.trigger}>""",
    'color:#099', "color:black", "color:#{if flag => \#3b3 else \#f00}", "color:black"
  )

window.addEventListener \message, msghdr = (evt) ->
  flag = evt.source == window
  console.log(
    """%c[message-test] addEventListener called.%c
    >>> evt.source == window? <%c#{flag}%c>
    >>> evt.data.trigger? <#{evt.data.trigger}>""",
    'color:#099', "color:black", "color:#{if flag => \#3b3 else \#f00}", "color:black"
  )

# the 3rd argument of add/removeEventListener ( capture / once / passive / signal ) has to be
# forwarded by the wrapper. if it is dropped, a `once` listener keeps firing and a `capture`
# listener cannot be removed, since removal only matches when `capture` is the same.
report = (name, ok, msg) ->
  console.log(
    """%c[message-test] #name%c
    >>> %c#msg%c""",
    'color:#099', "color:black", "color:#{if ok => \#3b3 else \#f00}", "color:black"
  )

once-count = 0
once-hdr = (evt) ->
  once-count += 1
  report "addEventListener with {once: true}", (once-count == 1),
    "fired #once-count time(s). expected exactly 1, no matter how many messages are sent."
window.addEventListener \message, once-hdr, {once: true}

capture-count = 0
capture-revoked = false
capture-hdr = (evt) ->
  capture-count += 1
  report "addEventListener with {capture: true}", (not capture-revoked),
    if capture-revoked =>
      "fired again after being removed with the same options - the options were dropped."
    else "fired #capture-count time(s)."
window.addEventListener \message, capture-hdr, {capture: true}

window.message-test = 
  fire: -> window.postMessage {source: \message-test, trigger: \message-test-exported-function}
  revoke: ->
    console.log """
    %c[message-test] Listener revoked
    `addEventListener called` and the {capture: true} one shall not show again.
    """, 'color:#099'
    window.removeEventListener \message, msghdr
    window.removeEventListener \message, capture-hdr, {capture: true}
    capture-revoked := true

window.postMessage {source: \message-test, trigger: \postMessage}
