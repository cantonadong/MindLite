'use strict';
// Runs before the editor so startup failures are visible even if app.js stops.
(()=>{
  let reported=false;
  function report(message){
    if(window.ipc)window.ipc.postMessage(JSON.stringify({id:0,command:'diagnostic',message}));
  }
  function show(message){
    report(message);
    if(reported)return;reported=true;
    const mount=()=>{
      const panel=document.createElement('section');panel.setAttribute('role','alert');panel.style.cssText='position:fixed;inset:100px 30px auto;z-index:9999;background:white;border:1px solid #e4c9c9;border-radius:12px;padding:26px;color:#30333b;box-shadow:0 10px 50px #0002;font:14px/1.8 Segoe UI,Microsoft YaHei UI,sans-serif;white-space:pre-wrap';
      const title=document.createElement('strong');title.textContent='MindLite 界面启动失败';panel.append(title,document.createTextNode('\n'+message+'\n\n请将此错误信息反馈给开发者。'));document.body.append(panel);
    };
    if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount,{once:true});
  }
  window.addEventListener('error',event=>{
    if(event.message)show(event.message+'\n'+(event.filename||'')+':'+event.lineno);
    else if(event.target?.src||event.target?.href)show('无法载入界面资源：'+(event.target.src||event.target.href));
  },true);
  window.addEventListener('unhandledrejection',event=>show(String(event.reason?.stack||event.reason)));
  document.addEventListener('securitypolicyviolation',event=>report('content policy: '+event.violatedDirective+' '+event.blockedURI));
  report('bootstrap loaded');
})();
