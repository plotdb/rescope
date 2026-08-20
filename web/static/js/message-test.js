var msghdr, report, onceCount, onceHdr, captureCount, captureRevoked, captureHdr;
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
report = function(name, ok, msg){
  return console.log("%c[message-test] " + name + "%c\n>>> %c" + msg + "%c", 'color:#099', "color:black", "color:" + (ok ? '#3b3' : '#f00'), "color:black");
};
onceCount = 0;
onceHdr = function(evt){
  onceCount += 1;
  return report("addEventListener with {once: true}", onceCount === 1, "fired " + onceCount + " time(s). expected exactly 1, no matter how many messages are sent.");
};
window.addEventListener('message', onceHdr, {
  once: true
});
captureCount = 0;
captureRevoked = false;
captureHdr = function(evt){
  captureCount += 1;
  return report("addEventListener with {capture: true}", !captureRevoked, captureRevoked
    ? "fired again after being removed with the same options - the options were dropped."
    : "fired " + captureCount + " time(s).");
};
window.addEventListener('message', captureHdr, {
  capture: true
});
window.messageTest = {
  fire: function(){
    return window.postMessage({
      source: 'message-test',
      trigger: 'message-test-exported-function'
    });
  },
  revoke: function(){
    console.log("%c[message-test] Listener revoked\n`addEventListener called` and the {capture: true} one shall not show again.", 'color:#099');
    window.removeEventListener('message', msghdr);
    window.removeEventListener('message', captureHdr, {
      capture: true
    });
    return captureRevoked = true;
  }
};
window.postMessage({
  source: 'message-test',
  trigger: 'postMessage'
});
