var msghdr;
window.onmessage = function(evt){
  var flag;
  flag = evt.source === window;
  return console.log("%c[message-test] window.onmessage is called.%c\n>>> evt.source == window? <%c" + flag + "%c>\n>>> evt.data.trigger? <" + evt.data.trigger + ">", 'color:#099', "color:black", "color:" + (flag ? '#3b3' : '#f00'), "color:black");
};
window.parent.onmessage = function(evt){
  var flag;
  flag = evt.source === window;
  return console.log("%c[message-test] parent.onmessage called.%c\n>>> evt.source == window? <%c" + flag + "%c>\n>>> evt.data.trigger? <" + evt.data.trigger + ">", 'color:#099', "color:black", "color:" + (flag ? '#3b3' : '#f00'), "color:black");
};
window.addEventListener('message', msghdr = function(evt){
  var flag;
  flag = evt.source === window;
  return console.log("%c[message-test] addEventListener called.%c\n>>> evt.source == window? <%c" + flag + "%c>\n>>> evt.data.trigger? <" + evt.data.trigger + ">", 'color:#099', "color:black", "color:" + (flag ? '#3b3' : '#f00'), "color:black");
});
window.messageTest = {
  fire: function(){
    return window.postMessage({
      source: 'message-test',
      trigger: 'message-test-exported-function'
    });
  },
  revoke: function(){
    console.log("%c[message-test] Listener revoked\n`addEventListener called` shall not show again.", 'color:#099');
    return window.removeEventListener('message', msghdr);
  }
};
window.postMessage({
  source: 'message-test',
  trigger: 'postMessage'
});