'use strict';
window.MindLiteBridge = (()=>{
  const native=!!window.ipc,preview=new URLSearchParams(location.search).has('preview');let seq=0;const pending=new Map();
  window.__mindliteReply = msg=>{const task=pending.get(msg.id);if(!task)return;pending.delete(msg.id);clearTimeout(task.timer);if(msg.ok)task.resolve(msg.data);else task.reject(Error(msg.error||'本地操作失败。'));};
  function call(command,args={}){
    if(!native)return Promise.reject(Error('请在 MindLite.exe 中使用本地文件功能。'));
    return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('操作超时，请重试。'));},30*60*1000);pending.set(id,{resolve,reject,timer});window.ipc.postMessage(JSON.stringify({id,command,...args}));});
  }
  return {native,preview,call};
})();
