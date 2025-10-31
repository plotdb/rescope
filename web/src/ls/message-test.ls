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

window.message-test = 
  fire: -> window.postMessage {source: \message-test, trigger: \message-test-exported-function}
  revoke: ->
    console.log """
    %c[message-test] Listener revoked
    `addEventListener called` shall not show again.
    """, 'color:#099'
    window.removeEventListener \message, msghdr

window.postMessage {source: \message-test, trigger: \postMessage}
