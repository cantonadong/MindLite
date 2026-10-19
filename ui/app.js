'use strict';
(()=>{
  const M=MindLiteModel,L=MindLiteLayout,F=MindLiteFormats,B=MindLiteBridge;
  const $=id=>document.getElementById(id),canvas=$('canvas'),world=$('world'),nodesEl=$('nodes'),edgesEl=$('edges');
  const store=new M.Store(B.preview?MindLiteScenes.createScene('normal'):M.blank());
  let selected=store.doc.root.id,editing=null,composing=false,path=null,graph=null,positions=new Map(),records=M.index(store.doc.root),zoom=1,pan={x:0,y:0},pointer=null,drag=null,busy=false,toastTimer,recoveryTimer,animationTimer,paused=false,animationRunning=false,animationTick=0,currentScene='normal',status='normal',experience=null,dragFrame=0,lastPointer=null,spacePan=false;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let selectedIds=new Set([selected]);
  const selectionBox=document.createElement('div');selectionBox.className='selection-box';selectionBox.hidden=true;selectionBox.setAttribute('aria-hidden','true');canvas.append(selectionBox);
  let suppressLayoutMotion=false;
  let titleEditing=false,titleOriginal='';
  const layoutNames={auto:'自动',right:'右',left:'左',down:'下',both:'左右'};
  const signal=()=>{if(B.native)B.call('state',{dirty:store.dirty,title:documentName()}).catch(()=>{});};
  function documentName(){return store.doc.title||(path?path.split(/[\\/]/).pop():'未命名导图');}
  function finishTitle(cancel=false){if(!titleEditing)return;titleEditing=false;const value=$('doc-title-input').value.replace(/[\r\n]/g,' ').trim().slice(0,120);$('doc-title-input').hidden=true;$('doc-name').hidden=false;if(!cancel&&value&&value!==titleOriginal&&value!==documentName())store.apply(doc=>doc.title=value);changed();}
  function editTitle(){if(busy||$('modal').open||titleEditing)return;finishEdit();hideMenus();titleEditing=true;$('doc-name').hidden=true;const input=$('doc-title-input');input.hidden=false;input.value=store.doc.title||documentName().replace(/\.(mm|mindlite)$/i,'');titleOriginal=input.value;input.focus();input.select();}
  $('doc-name').addEventListener('dblclick',editTitle);$('doc-name').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='F2'){e.preventDefault();e.stopPropagation();editTitle();}});$('doc-title-input').addEventListener('blur',()=>finishTitle());
  function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3600);}
  function modal(title,message,buttons=[['确定',true,'primary']]){
    return new Promise(resolve=>{
      const d=$('modal');if(d.open){resolve(null);return;}
      $('modal-content').replaceChildren();const h=document.createElement('h2');h.textContent=title;$('modal-content').append(h,document.createTextNode(message));$('modal-actions').replaceChildren();
      const finish=value=>{d.oncancel=null;d.close();resolve(value);};
      buttons.forEach(([label,value,cls])=>{const button=document.createElement('button');button.textContent=label;button.className=cls||'';button.onclick=()=>finish(value);$('modal-actions').append(button);});
      d.oncancel=e=>{e.preventDefault();finish(null);};d.showModal();
    });
  }
  function changed(){render();signal();if(B.native){clearTimeout(recoveryTimer);recoveryTimer=setTimeout(()=>B.call('checkpoint',{content:store.dirty?store.snapshot:null}).catch(()=>{}),800);}}
  function updateChrome(){
    $('doc-name').textContent=documentName();$('dirty').hidden=!store.dirty;
    $('undo').disabled=!store.past.length;$('redo').disabled=!store.future.length;
    const n=M.find(store.doc.root,selected);$('format-bar').hidden=!n||status!=='normal';
    for(const k of ['bold','italic','underline','done']){$(k).classList.toggle('active',!!n?.[k]);$(k).setAttribute('aria-pressed',String(!!n?.[k]));}
    $('done-label').textContent=n?.done?'取消完成':'标记完成';
    document.querySelectorAll('[data-action="delete"],[data-action="cut"]').forEach(el=>el.disabled=!Array.from(selectedIds).some(id=>id!==store.doc.root.id));
    document.querySelector('[data-action="fold"]').disabled=!n?.children.length;
    $('context-fold-label').textContent=n?.collapsed?'展开分支':'收起分支';$('context-done-label').textContent=n?.done?'取消完成':'标记完成';$('context-title').textContent=n?.text||'空白节点';
    document.querySelectorAll('[data-layout]').forEach(el=>el.classList.toggle('active',el.dataset.layout===store.doc.layout));
    document.querySelectorAll('[data-line]').forEach(el=>el.classList.toggle('active',el.dataset.line===store.doc.line));
    document.querySelectorAll('[data-color-mode]').forEach(el=>el.classList.toggle('active',el.dataset.colorMode===store.doc.colorMode));
    document.querySelectorAll('[data-swatch]').forEach(el=>{const active=store.doc.colorMode==='single'&&el.dataset.swatch.toLowerCase()===store.doc.color.toLowerCase();el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    document.title=(store.dirty?'● ':'')+documentName()+' — MindLite';
  }
  function transform(animated=false){if(animated&&!reducedMotion.matches&&!paused){const previous=world.style.transform;world.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`;world.getAnimations().forEach(a=>a.cancel());world.animate([{transform:previous},{transform:world.style.transform}],{duration:200,easing:'cubic-bezier(.2,.7,.2,1)'});}else{world.getAnimations().forEach(a=>a.cancel());world.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`;}$('zoom-value').textContent=Math.round(zoom*100)+'%';canvas.style.backgroundPosition=`${pan.x}px ${pan.y}px`;$('empty-tip').hidden=!!store.doc.root.text||store.doc.root.children.length>0||status!=='normal'||Math.abs(pan.x-canvas.clientWidth/2)>80||Math.abs(pan.y-canvas.clientHeight/2)>80;}
  function center(animated=false){const root=positions.get(store.doc.root.id);pan={x:canvas.clientWidth/2-(root?.x||0)*zoom,y:canvas.clientHeight/2-(root?.y||0)*zoom};transform(animated);}
  function fit(){finishEdit();const b=L.bounds(graph.nodes),w=b.right-b.left,h=b.bottom-b.top;zoom=Math.min(1,Math.max(.25,Math.min((canvas.clientWidth-100)/w,(canvas.clientHeight-190)/h)));pan={x:canvas.clientWidth/2-(b.left+b.right)*zoom/2,y:canvas.clientHeight/2-(b.top+b.bottom)*zoom/2-15};transform(true);}
  function setZoom(value,clientX,clientY){
    const next=Math.max(.25,Math.min(3,value)),rect=canvas.getBoundingClientRect(),x=clientX===undefined?rect.width/2:clientX-rect.left,y=clientY===undefined?rect.height/2:clientY-rect.top;
    pan={x:x-(x-pan.x)*next/zoom,y:y-(y-pan.y)*next/zoom};zoom=next;transform();
  }
  function point(e){const rect=canvas.getBoundingClientRect();return {x:(e.clientX-rect.left-pan.x)/zoom,y:(e.clientY-rect.top-pan.y)/zoom};}
  function makeNode(p,n){
    const el=document.createElement('div'),color=F.color(store.doc,p);el.className='node'+(p.parentId===null?' root':'')+(selectedIds.has(p.id)?' selected':'')+(n.done?' done':'');el.dataset.id=n.id;el.tabIndex=-1;el.setAttribute('role','treeitem');el.setAttribute('aria-label',n.text||'空白节点');el.setAttribute('aria-selected',String(selectedIds.has(n.id)));el.setAttribute('aria-level',String((records.depths.get(n.id)||0)+1));if(n.children.length)el.setAttribute('aria-expanded',String(!n.collapsed));el.style.cssText=`left:${p.x-p.width/2}px;top:${p.y-p.height/2}px;width:${p.width}px;min-height:${p.height}px;--node-color:${color};--root-color:${color};--root-ink:${F.ink(color)};`;
    if(n.bold)el.style.fontWeight='700';if(n.italic)el.style.fontStyle='italic';if(n.underline)el.style.textDecoration='underline';
    if(n.done){const marker=document.createElement('span');marker.className='node-complete-icon';marker.setAttribute('aria-hidden','true');marker.innerHTML=icon('check-circle');el.append(marker);}
    const text=document.createElement('span');text.className='node-text';text.textContent=p.lines.join('\n');el.append(text);
    if(!n.text){text.textContent=p.parentId===null?'中心主题':'输入文字';text.classList.add('placeholder');}
    return el;
  }
  function render(){
    if(editing)return;F.prepareColors(store.doc);const previous=positions;graph=L.layoutTree(store.doc.root,store.doc.layout);positions=new Map(graph.nodes.map(n=>[n.id,n]));records=M.index(store.doc.root);
    selectedIds=new Set(Array.from(selectedIds).filter(id=>positions.has(id)));if(selected&&!positions.has(selected))selected=null;if(selected)selectedIds.add(selected);else selected=selectedIds.values().next().value||null;
    const fragment=document.createDocumentFragment();
    graph.nodes.forEach(p=>{
      const n=records.byId.get(p.id),group=document.createElement('div'),el=makeNode(p,n);group.className='node-group'+(selectedIds.has(p.id)?' selected-group':'');group.append(el);fragment.append(group);
      const before=previous.get(p.id);if(before&&!suppressLayoutMotion&&graph.nodes.length<350&&!reducedMotion.matches){const dx=before.x-p.x,dy=before.y-p.y;if(Math.abs(dx)+Math.abs(dy)>1){const animation=el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:180,easing:'cubic-bezier(.2,.7,.2,1)'});if(paused)animation.pause();}}
      const tools=document.createElement('div'),button=document.createElement('button');tools.className='node-tools'+(!n.children.length?' leaf':'');tools.style.setProperty('--fold-color',F.color(store.doc,p));
      if(n.children.length){button.dataset.fold=n.id;button.title=n.collapsed?`展开 ${n.children.length} 个子分支`:'收起分支';button.textContent=n.collapsed?'+':'−';}else{button.dataset.add=n.id;button.title='添加子节点 Tab';button.textContent='+';}
      button.innerHTML=`<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8${!n.children.length||n.collapsed?'M6 2v8':''}"/></svg>`;
      button.setAttribute('aria-label',button.title);button.tabIndex=-1;tools.append(button);
      const down=store.doc.layout==='down',side=p.parentId===null?(store.doc.layout==='left'?-1:1):p.side;
      tools.style.left=(down?p.x-13:p.x+side*(p.width/2+16)-13)+'px';tools.style.top=(down?p.y+p.height/2+3:p.y-13)+'px';group.append(tools);
    });nodesEl.replaceChildren(fragment);edgesEl.replaceChildren();
    const edgeFragment=document.createDocumentFragment();graph.edges.forEach(edge=>{const a=positions.get(edge.from),b=positions.get(edge.to),line=document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d',L.path(a,b,store.doc.layout==='down',store.doc.line==='curve'));line.setAttribute('stroke',F.color(store.doc,b));line.dataset.to=edge.to;line.classList.add('edge');edgeFragment.append(line);});edgesEl.append(edgeFragment);
    $('empty-tip').hidden=!!store.doc.root.text||store.doc.root.children.length>0||status!=='normal'||Math.abs(pan.x-canvas.clientWidth/2)>100||Math.abs(pan.y-canvas.clientHeight/2)>100;
    suppressLayoutMotion=false;world.querySelectorAll('.animation-ring[data-node]').forEach(el=>{const p=positions.get(el.dataset.node);if(p)el.style.cssText=`left:${p.x-p.width/2-5}px;top:${p.y-p.height/2-5}px;width:${p.width+10}px;height:${p.height+10}px`;});updateChrome();experience?.refresh();
  }
  function select(id,ids=null){selected=id;selectedIds=new Set(ids||(id?[id]:[]));nodesEl.querySelectorAll('.node').forEach(el=>{const active=selectedIds.has(el.dataset.id);el.classList.toggle('selected',active);el.parentElement.classList.toggle('selected-group',active);el.setAttribute('aria-selected',String(active));});edgesEl.querySelectorAll('[data-to]').forEach(el=>el.classList.toggle('related',selectedIds.has(el.dataset.to)));updateChrome();}
  function selectionRoots(skipRoot=false){const index=M.index(store.doc.root),ids=new Set(Array.from(selectedIds).filter(id=>index.byId.has(id)&&(!skipRoot||id!==store.doc.root.id)));return Array.from(ids).filter(id=>{let parent=index.parents.get(id);while(parent){if(ids.has(parent.id))return false;parent=index.parents.get(parent.id);}return true;}).map(id=>index.byId.get(id));}
  function selectViewport(){finishEdit();getSelection()?.removeAllRanges();const ids=graph.nodes.filter(n=>{const x=pan.x+n.x*zoom,y=pan.y+n.y*zoom;return x+n.width*zoom/2>0&&x-n.width*zoom/2<canvas.clientWidth&&y+n.height*zoom/2>0&&y-n.height*zoom/2<canvas.clientHeight;}).map(n=>n.id);select(ids.includes(selected)?selected:ids[0]||null,ids);canvas.focus();}
  function startEdit(id,replace=null){
    if(busy||status!=='normal')return;finishEdit();select(id);const n=M.find(store.doc.root,id),el=nodesEl.querySelector(`[data-id="${CSS.escape(id)}"]`);if(!n||!el)return;
    editing={id,original:n.text,el};el.classList.add('editing');el.contentEditable='plaintext-only';el.spellcheck=false;el.textContent=replace===null?n.text:replace;el.setAttribute('role','textbox');el.setAttribute('aria-multiline','true');el.focus();
    const range=document.createRange();range.selectNodeContents(el);range.collapse(false);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);
    el.addEventListener('blur',()=>{queueMicrotask(()=>{if(editing?.el===el)finishEdit();});},{once:true});
  }
  function finishEdit(cancel=false){
    if(!editing)return;const {id,original,el}=editing;editing=null;let text=cancel?original:el.innerText.replace(/\r\n/g,'\n').replace(/\n$/,'');if(text.length>20000){text=text.slice(0,20000);toast('单个节点最多 20,000 字符，超出部分未保留。');}el.contentEditable='false';composing=false;
    const n=M.find(store.doc.root,id);if(n&&text!==original)store.apply(()=>{n.text=text;});changed();
  }
  function mutate(fn){finishEdit();store.apply(fn);changed();}
  function addNode(sibling=false){
    finishEdit();if(!selected)return;const n=M.find(store.doc.root,selected);if(!n)return;
    const target=sibling?M.parent(store.doc.root,selected)||n:n;let depth=0,ancestor=target;while((ancestor=M.parent(store.doc.root,ancestor.id)))depth++;
    if(M.count(store.doc.root)>=10000||depth>=100){toast('已达到节点数或层级限制。');return;}
    const fresh=M.node();if(target.done)fresh.done=true;store.apply(()=>{target.collapsed=false;if(sibling&&target!==n)target.children.splice(target.children.indexOf(n)+1,0,fresh);else target.children.push(fresh);});selected=fresh.id;selectedIds=new Set([selected]);changed();reveal(fresh.id);startEdit(fresh.id);
  }
  function reveal(id,force=false){const p=positions.get(id);if(!p)return;const x=pan.x+p.x*zoom,y=pan.y+p.y*zoom;if(force||x-p.width*zoom/2<50||x+p.width*zoom/2>canvas.clientWidth-50||y-p.height*zoom/2<65||y+p.height*zoom/2>canvas.clientHeight-145){pan.x=canvas.clientWidth/2-p.x*zoom;pan.y=canvas.clientHeight/2-p.y*zoom-15;transform(true);}}
  function visibleSiblings(id){
    const p=positions.get(id),parent=records.parents.get(id);if(!p||!parent)return [];
    const down=store.doc.layout==='down';
    return parent.children.map(n=>positions.get(n.id)).filter(n=>n&&n.side===p.side).sort((a,b)=>down?a.x-b.x:a.y-b.y);
  }
  function navigateNode(key){
    const p=positions.get(selected),n=records.byId.get(selected);if(!p||!n)return;
    const down=store.doc.layout==='down',siblingAxis=down?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];let next=null;
    if(siblingAxis.includes(key)){
      const siblings=visibleSiblings(selected),at=siblings.findIndex(n=>n.id===selected),direction=key==='ArrowUp'||key==='ArrowLeft'?-1:1;
      if(at>=0)next=siblings[at+direction];
      else if(n===store.doc.root){
        const axis=down?'x':'y';next=n.children.map(c=>positions.get(c.id)).filter(c=>c&&direction*(c[axis]-p[axis])>1).sort((a,b)=>Math.abs(a[axis]-p[axis])-Math.abs(b[axis]-p[axis]))[0];
      }
    }else{
      const parent=records.parents.get(selected),axis=down?'y':'x',cross=down?'x':'y',direction=key==='ArrowLeft'||key==='ArrowUp'?-1:1;
      const family=[...(parent?[parent]:[]),...n.children].map(c=>positions.get(c.id)).filter(c=>c&&direction*(c[axis]-p[axis])>1);
      next=family.sort((a,b)=>Math.abs(a[cross]-p[cross])-Math.abs(b[cross]-p[cross])||Math.abs(a[axis]-p[axis])-Math.abs(b[axis]-p[axis]))[0];
    }
    if(next){select(next.id);reveal(next.id);}
  }
  function moveSibling(direction){
    const siblings=visibleSiblings(selected),at=siblings.findIndex(n=>n.id===selected),peer=siblings[at+direction],parent=records.parents.get(selected);if(at<0||!peer||!parent)return;
    const currentId=selected;
    store.apply(doc=>{
      // Preserve visual left/right groups when root children are interleaved.
      if(parent===doc.root)doc.root.children.forEach(n=>{const p=positions.get(n.id);if(p)n.side=p.side===-1?'left':'right';});
      const siblings=M.parent(doc.root,currentId).children,from=siblings.findIndex(n=>n.id===currentId),to=siblings.findIndex(n=>n.id===peer.id);
      [siblings[from],siblings[to]]=[siblings[to],siblings[from]];
    });
    select(currentId);changed();reveal(currentId);
  }
  function remove(id=null){finishEdit();let roots;if(Array.isArray(id)){const wanted=new Set(id.filter(key=>key!==store.doc.root.id)),index=M.index(store.doc.root);roots=Array.from(wanted).filter(key=>{let p=index.parents.get(key);while(p){if(wanted.has(p.id))return false;p=index.parents.get(p.id);}return true;}).map(key=>index.byId.get(key)).filter(Boolean);}else roots=id?[M.find(store.doc.root,id)].filter(n=>n&&n!==store.doc.root):selectionRoots(true);if(!roots.length)return;const index=M.index(store.doc.root),fallback=index.parents.get(roots[0].id);store.apply(()=>{roots.forEach(n=>{const p=index.parents.get(n.id);p.children=p.children.filter(c=>c.id!==n.id);});});selected=fallback?.id||store.doc.root.id;selectedIds=new Set([selected]);changed();}
  function setStyle(key){if(!selectedIds.size)return;mutate(()=>{const nodes=key==='done'?selectionRoots():Array.from(selectedIds).map(id=>M.find(store.doc.root,id)).filter(Boolean),value=!nodes.every(n=>n[key]);nodes.forEach(n=>{if(key==='done')M.walk(n,c=>c.done=value);else n[key]=value;});});}
  function hideMenus(){document.querySelectorAll('.popover').forEach(el=>el.hidden=true);document.querySelectorAll('[aria-expanded][data-action$="-menu"]').forEach(el=>el.setAttribute('aria-expanded','false'));}
  function toggleMenu(id){finishEdit();const show=$(id).hidden;hideMenus();$(id).hidden=!show;document.querySelector(`[data-action="${id}"]`)?.setAttribute('aria-expanded',String(show));}
  async function canDiscard(){
    finishTitle();finishEdit();if(!store.dirty)return true;
    const answer=await modal('保存当前导图？','当前导图有未保存的修改。',[['取消',null],['不保存','discard'],['保存','save','primary']]);
    if(answer==='save')return await save();return answer==='discard';
  }
  async function loadDoc(doc,newPath=null,unsaved=false){
    stopAnimation();finishEdit();clearTimeout(recoveryTimer);const valid=M.normalize(doc);if(B.native)await B.call('set_current',{path:newPath});store.load(valid);path=newPath;selected=store.doc.root.id;selectedIds=new Set([selected]);status='normal';$('scene-message').hidden=true;experience?.reset();if(unsaved)store.saved='';zoom=1;changed();center();
  }
  async function save(as=false){
    finishTitle();finishEdit();if(B.preview){toast('预览模式：保存仅演示，不写入文件。');return false;}
    if(!B.native){toast('请使用 MindLite.exe 保存文档。');return false;}
    const snapshot=store.snapshot,result=await B.call('save',{content:F.toMM(store.doc),saveAs:as,suggested:store.doc.title||store.doc.root.text.slice(0,40)||'未命名导图'});
    if(!result)return false;path=result.path;store.markSaved(snapshot);signal();updateChrome();clearTimeout(recoveryTimer);await B.call('checkpoint',{content:store.dirty?store.snapshot:null});toast('已保存到 '+path);return true;
  }
  async function openFile(importMM=false){
    if(B.preview){toast('预览模式：文件操作仅演示。');return;}
    if(!B.native){toast('请使用 MindLite.exe 打开本地文件。');return;}
    if(!await canDiscard())return;
    const result=await B.call('open',{importMM});if(!result)return;
    const doc=F.parse(result.content,result.path.split('.').pop().toLowerCase());if(doc.requiresCopy&&!await confirmCopy())return;const copy=importMM||doc.requiresCopy;await loadDoc(doc,!copy?result.path:null,copy);toast(copy?'已打开导图副本，保存时另存为 .mm':'已打开导图');
  }
  function confirmCopy(){return modal('以副本打开 FreeMind 文件','这份文件包含当前版本不能完整保留的备注、链接或其他属性。可打开已支持的节点内容，并另存为 .mm；原文件不会被直接覆盖。',[['取消',false],['打开副本',true,'primary']]);}
  async function exportFile(kind){
    finishTitle();finishEdit();if(B.preview){toast('预览模式：导出仅演示，不写入文件。');return;}
    if(!B.native){toast('请在 MindLite.exe 中导出文件。');return;}
    let content,encoding='utf8';const snapshot=M.clone(store.doc);
    if(kind==='mm'){
      const answer=await modal('导出 FreeMind','文字、层级、折叠、粗体和斜体可映射到 FreeMind；布局、位置、配色、下划线和完成状态使用 MindLite 扩展属性保存，其他软件可能忽略这些属性。',[['取消',false],['导出',true,'primary']]);if(!answer)return;content=F.toMM(snapshot);
    }else if(kind==='svg')content=F.svg(snapshot).text;
    else{
      const result=F.svg(snapshot),safe=Math.min(1,16384/result.width,16384/result.height,Math.sqrt(48000000/(result.width*result.height)))*.99;
      let scale=1;
      if(result.width>16384||result.height>16384||result.width*result.height>48000000){const answer=await modal('调整图片尺寸',`完整导图为 ${result.width} × ${result.height} 像素。建议按 ${Math.floor(safe*100)}% 导出，或改用无损 SVG。`,[['取消',null],['导出 SVG','svg'],['缩小导出','small','primary']]);if(!answer)return;if(answer==='svg')return exportFile('svg');scale=safe;}
      content=await F.png(snapshot,scale);encoding='base64';
    }
    const result=await B.call('export',{kind,content,encoding,suggested:snapshot.title||snapshot.root.text.slice(0,40)||'思维导图'});if(result)toast('已导出到 '+result.path);
  }
  async function action(name){
    if(busy)return;
    if(pointer||drag)clearDrag();
    if(['file-menu','layout-menu','palette-menu'].includes(name)){toggleMenu(name);return;}
    hideMenus();
    const asynchronous=['save','save-as','open','import','new','demo','export-mm','export-svg','export-png','copy','cut','paste'];
    if(asynchronous.includes(name)){busy=true;$('activity-label').textContent=({'save':'正在保存…','save-as':'正在另存…',open:'正在打开…',import:'正在导入…','export-mm':'正在导出…','export-svg':'正在导出…','export-png':'正在生成图片…',copy:'正在复制…',cut:'正在剪切…',paste:'正在粘贴…'})[name]||'正在处理…';document.body.classList.add('busy');}
    try{
      switch(name){
        case 'undo':finishEdit();if(store.undo())changed();break;
        case 'redo':finishEdit();if(store.redo())changed();break;
        case 'bold':case 'italic':case 'underline':case 'done':setStyle(name);break;
        case 'child':addNode();break;case 'delete':remove();break;
        case 'sibling':addNode(true);break;case 'edit':if(selected)startEdit(selected);break;
        case 'fold':if(selected)mutate(()=>{const n=M.find(store.doc.root,selected);if(n?.children.length)n.collapsed=!n.collapsed;});break;
        case 'center':finishEdit();select(store.doc.root.id);center(true);canvas.focus();break;
        case 'copy':case 'cut':case 'paste':case 'search':case 'search-close':case 'search-next':case 'search-prev':await experience.action(name);break;
        case 'zoom-in':setZoom(zoom*1.15);break;case 'zoom-out':setZoom(zoom/1.15);break;case 'reset-zoom':setZoom(1);break;case 'fit':fit();break;
        case 'new':if(await canDiscard())await loadDoc(M.blank());break;
        case 'demo':if(await canDiscard())await loadDoc(MindLiteScenes.createScene('normal'),null,true);break;
        case 'save':await save();break;case 'save-as':await save(true);break;
        case 'open':await openFile();break;case 'import':await openFile(true);break;
        case 'export-mm':await exportFile('mm');break;case 'export-svg':await exportFile('svg');break;case 'export-png':await exportFile('png');break;
        case 'help':await modal('让想法，自由生长。','双击节点编辑，或选中后直接输入\nTab：添加子节点　编辑中 Enter：提交并退出\n未编辑时 Enter：添加同级（根节点为子级）\nShift+Enter：文字换行　Ctrl+A：选择视口内节点\nEsc：结束编辑 / 取消拖拽　F2：编辑\n拖拽仅调整结构：节点中心挂接，边缘调整顺序\n节点始终自动布局，空白松手取消\n右键节点打开操作菜单\n拖拽空白或按住鼠标中键：平移\n方向键：按层级与视觉方向切换节点\nShift+↑ / ↓：调整当前节点及子树的同级顺序\nHome：回到中心\nSpace：折叠/展开分支　Delete：删除子树\nCtrl+C / X / V：复制 / 剪切 / 粘贴子树\n粘贴多行文字时，缩进自动转换为节点层级\nCtrl+F：搜索全部节点，Enter / Shift+Enter 切换结果\nCtrl+Z / Ctrl+Y：撤销 / 重做\nCtrl+B / I / U：粗体 / 斜体 / 下划线\n默认 100%，仅手动缩放；Ctrl+0 重置\nCtrl+滚轮、Ctrl +/-：缩放\n\n文件保存在本地。默认保存为 FreeMind .mm 文件，标题可双击编辑。\nPNG / SVG 导出完整可见导图，不包含工具栏。');break;
        case 'animate':startAnimation();break;case 'pause':paused=!paused;document.body.classList.toggle('paused',paused);document.getAnimations().forEach(a=>paused?a.pause():a.play());$('pause').textContent=paused?'继续':'暂停';break;
        case 'replay':setScene(currentScene);break;
      }
    }catch(e){await modal('操作未完成',e.message||String(e));}
    finally{busy=false;document.body.classList.remove('busy');if(!editing&&!$('modal').open&&$('search-bar').hidden)canvas.focus({preventScroll:true});}
  }
  function configureMenus(){
    const shapes={auto:'M2 12h8m4 0h8M10 12V5H4m6 7v7H4m10-7V5h6m-6 7v7h6',right:'M3 12h8m0 0V4h10m-10 8h10m-10 0v8h10',left:'M21 12H11m0 0V4H1m10 8H1m10 0v8H1',down:'M12 2v8m0 0H3v10m9-10h9v10m-9-10v10',both:'M3 12h18M9 12V4H2m7 8v8H2m13-8V4h7m-7 8v8h7'};
    for(const [key,name]of Object.entries(layoutNames)){const button=document.createElement('button');button.dataset.layout=key;button.innerHTML=`<svg class="icon" viewBox="0 0 24 24"><path d="${shapes[key]}"/></svg><span>${name}</span>`;$('layout-options').append(button);}
    MindLiteScenes.colors.forEach((color,i)=>{const wrap=document.createElement('div');wrap.className='swatch';wrap.innerHTML=`<button class="swatch-color" data-swatch="${color}" style="--swatch:${color};--tick:${F.ink(color)}" title="${MindLiteScenes.names[i]}" aria-label="${MindLiteScenes.names[i]}" aria-pressed="false"><svg class="swatch-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg></button><span class="swatch-name">${MindLiteScenes.names[i]}</span>`;$('swatches').append(wrap);});
  }
  document.addEventListener('click',async e=>{
    const actionEl=e.target.closest('[data-action]');if(actionEl){action(actionEl.dataset.action);return;}
    const layout=e.target.closest('[data-layout]'),line=e.target.closest('[data-line]'),colorMode=e.target.closest('[data-color-mode]'),swatch=e.target.closest('[data-swatch]'),fold=e.target.closest('[data-fold]'),add=e.target.closest('[data-add]');
    if(busy)return;
    if(layout){mutate(doc=>{doc.layout=layout.dataset.layout;M.walk(doc.root,n=>{delete n.offset;delete n.side;});});hideMenus();zoom=1;center(true);canvas.focus();}
    else if(line)mutate(doc=>doc.line=line.dataset.line);
    else if(colorMode)mutate(doc=>doc.colorMode=colorMode.dataset.colorMode);
    else if(swatch)mutate(doc=>doc.color=swatch.dataset.swatch);
    else if(fold){const id=fold.dataset.fold;mutate(()=>{const n=M.find(store.doc.root,id);n.collapsed=!n.collapsed;if(n.collapsed&&selected!==id&&M.find(n,selected))selected=id;});canvas.focus();}
    else if(add){select(add.dataset.add);addNode();}
    else if(!e.target.closest('.popover'))hideMenus();
  });
  // Keep editor focus until the chosen button action has captured its target.
  // Otherwise blur commits rebuild the SVG/DOM before click reaches a fold button.
  document.addEventListener('pointerdown',e=>{if(e.button===0&&editing&&e.target.closest('button')&&!e.target.closest('dialog'))e.preventDefault();},true);
  canvas.addEventListener('contextmenu',e=>{
    if(editing?.el.contains(e.target))return;
    e.preventDefault();if(busy)return;finishEdit();hideMenus();const node=e.target.closest('.node');if(!node)return;
    if(!selectedIds.has(node.dataset.id))select(node.dataset.id);else{selected=node.dataset.id;updateChrome();}canvas.focus();const menu=$('context-menu');menu.hidden=false;
    menu.style.left=Math.max(8,Math.min(e.clientX,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(e.clientY,innerHeight-menu.offsetHeight-8))+'px';
  });
  canvas.addEventListener('dblclick',e=>{const el=e.target.closest('.node');if(el&&!busy)startEdit(el.dataset.id);});
  canvas.addEventListener('compositionstart',()=>{composing=true;if(!editing&&selected&&!busy)startEdit(selected);});canvas.addEventListener('compositionend',()=>composing=false);
  canvas.addEventListener('input',()=>{if(!editing)return;const n=M.find(store.doc.root,editing.id),s=L.size({...n,text:editing.el.innerText},n===store.doc.root),p=positions.get(n.id);editing.el.style.width=s.width+'px';editing.el.style.minHeight=s.height+'px';editing.el.style.left=(p.x-s.width/2)+'px';editing.el.style.top=(p.y-s.height/2)+'px';});
  canvas.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();setZoom(zoom*Math.exp(-e.deltaY*.002),e.clientX,e.clientY);}else{e.preventDefault();pan.x-=e.deltaX;pan.y-=e.deltaY;transform();$('empty-tip').hidden=true;}},{passive:false});
  function clearDrag(){
    if(pointer?.kind==='marquee'&&pointer.originalIds)select(pointer.originalSelected,pointer.originalIds);
    selectionBox.hidden=true;
    cancelAnimationFrame(dragFrame);dragFrame=0;if(pointer?.pointerId!==undefined&&canvas.hasPointerCapture(pointer.pointerId))canvas.releasePointerCapture(pointer.pointerId);
    resetDragPreview();
    drag=null;pointer=null;lastPointer=null;canvas.classList.remove('layout-preview');document.body.classList.remove('dragging','panning');$('drag-layer').replaceChildren();$('drag-hint').hidden=true;document.querySelectorAll('.drag-source,.drop-target').forEach(el=>el.classList.remove('drag-source','drop-target'));
  }
  function reparent(doc,id,target,placement='child'){
    const index=M.index(doc.root),n=index.byId.get(id),p=index.parents.get(id),hovered=index.byId.get(target),to=placement==='child'?hovered:index.parents.get(target);if(!p||!to||id===target||M.find(n,to.id))return false;let subtreeDepth=0;M.walk(n,(_,__,depth)=>subtreeDepth=Math.max(subtreeDepth,depth));if(index.depths.get(to.id)+1+subtreeDepth>100)return false;
    // Structural edits preserve visible branch directions; span changes must
    // not make the automatic balancer move a branch to the opposite side.
    doc.root.children.forEach(child=>{const pos=positions.get(child.id);if(pos)child.side=pos.side===-1?'left':'right';});
    p.children=p.children.filter(c=>c.id!==id);if(placement==='child')to.children.push(n);else{const at=to.children.findIndex(c=>c.id===target);to.children.splice(at+(placement==='after'?1:0),0,n);}to.collapsed=false;delete n.side;if(to.done)M.walk(n,c=>c.done=true);
    if(to===doc.root)n.side=placement==='child'?(positions.get(id)?.side===-1?'left':'right'):(positions.get(target)?.side===-1?'left':'right');
    return true;
  }
  function reparentSelection(doc,ids,target,placement){
    const copy=M.clone(doc),ordered=placement==='after'?[...ids].reverse():ids;
    for(const id of ordered)if(!reparent(copy,id,target,placement))return false;
    doc.root=copy.root;return true;
  }
  canvas.addEventListener('pointerdown',e=>{
    if(busy||status!=='normal'||![0,1].includes(e.button)||e.target.closest('.node-tools'))return;
    const el=e.target.closest('.node');if(editing&&el?.dataset.id===editing.id)return;finishEdit();
    const matrix=new DOMMatrix(getComputedStyle(world).transform);pan={x:matrix.e,y:matrix.f};zoom=matrix.a||zoom;transform();nodesEl.getAnimations({subtree:true}).forEach(a=>a.cancel());hideMenus();canvas.focus({preventScroll:true});e.preventDefault();
    if(e.button===0&&e.ctrlKey&&!spacePan&&!el){pointer={kind:'marquee',start:point(e),clientX:e.clientX,clientY:e.clientY,pointerId:e.pointerId,originalSelected:selected,originalIds:[...selectedIds]};select(null);canvas.setPointerCapture(e.pointerId);updateGesture(e);}
    else if(el&&e.button===0&&!spacePan){if(!selectedIds.has(el.dataset.id))select(el.dataset.id);else select(el.dataset.id,selectedIds);pointer=selectedIds.has(store.doc.root.id)?null:{kind:'node',id:el.dataset.id,start:point(e),clientX:e.clientX,clientY:e.clientY,pointerId:e.pointerId};}
    else{if(e.button===0&&!spacePan)select(null);e.preventDefault();pointer={kind:'pan',x:pan.x,y:pan.y,clientX:e.clientX,clientY:e.clientY,pointerId:e.pointerId};}
  });
  function resetDragPreview(){
    nodesEl.querySelectorAll('.node-group').forEach(el=>el.style.transform='');
    edgesEl.querySelectorAll('[data-to]').forEach(el=>{const p=positions.get(el.dataset.to),parent=positions.get(p?.parentId);if(parent)el.setAttribute('d',L.path(parent,p,store.doc.layout==='down',store.doc.line==='curve'));});
  }
  function paintDrag(ghostNodes){
    resetDragPreview();const staged=new Map(positions);
    for(const [id,p]of drag.displaced||[]){
      const original=positions.get(id),el=nodesEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if(el&&original){el.parentElement.style.transform=`translate(${p.x-original.x}px,${p.y-original.y}px)`;staged.set(id,p);}
    }
    edgesEl.querySelectorAll('[data-to]').forEach(el=>{const p=positions.get(el.dataset.to);if(!p||drag.ids.has(p.id))return;const child=staged.get(p.id),parent=staged.get(p.parentId);if(parent)el.setAttribute('d',L.path(parent,child,store.doc.layout==='down',store.doc.line==='curve'));});
    const layer=$('drag-layer');layer.replaceChildren();const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('ghost-edges');layer.append(svg);
    const ghostMap=new Map(ghostNodes.map(n=>[n.id,n]));
    for(const p of ghostNodes){
      const parent=ghostMap.get(p.parentId)||staged.get(p.parentId);
      if(parent&&drag.target){const edge=document.createElementNS('http://www.w3.org/2000/svg','path');edge.setAttribute('d',L.path(parent,p,store.doc.layout==='down',store.doc.line==='curve'));edge.setAttribute('stroke',F.color(store.doc,p));edge.setAttribute('fill','none');edge.setAttribute('stroke-width','2.6');svg.append(edge);}
      const el=makeNode(p,drag.projectedRecords.byId.get(p.id));el.classList.remove('selected');el.classList.add('ghost-node');el.removeAttribute('data-id');el.removeAttribute('role');el.setAttribute('aria-hidden','true');layer.append(el);
      const n=records.byId.get(p.id);if(n.children.length){const badge=document.createElement('span'),down=store.doc.layout==='down',side=p.side===-1?-1:1;badge.className='drag-fold-count';badge.innerHTML='<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M6 2v8"/></svg>';const count=document.createElement('span');count.className='fold-count';count.textContent=M.count(n)-1;badge.append(count);badge.style.left=(down?p.x:p.x+side*(p.width/2+5.5))+'px';badge.style.top=(down?p.y+p.height/2+5.5:p.y)+'px';badge.style.transform=down?'translateX(-50%)':side===-1?'translate(-100%,-50%)':'translateY(-50%)';badge.style.setProperty('--fold-color',F.color(store.doc,p));layer.append(badge);}
    }
  }
  function updateGesture(e){
    if(!pointer)return;
    if(pointer.kind==='marquee'){
      const now=point(e),left=Math.min(pointer.start.x,now.x),right=Math.max(pointer.start.x,now.x),top=Math.min(pointer.start.y,now.y),bottom=Math.max(pointer.start.y,now.y);
      selectionBox.hidden=false;selectionBox.style.left=(pan.x+left*zoom)+'px';selectionBox.style.top=(pan.y+top*zoom)+'px';selectionBox.style.width=((right-left)*zoom)+'px';selectionBox.style.height=((bottom-top)*zoom)+'px';
      const ids=graph.nodes.filter(n=>n.x+n.width/2>=left&&n.x-n.width/2<=right&&n.y+n.height/2>=top&&n.y-n.height/2<=bottom).map(n=>n.id);select(ids[0]||null,ids);return;
    }
    if(pointer.kind==='node'&&!records.byId.has(pointer.id)){clearDrag();return;}
    if(pointer.kind==='pan'){if(Math.hypot(e.clientX-pointer.clientX,e.clientY-pointer.clientY)>3){document.body.classList.add('panning');if(!canvas.hasPointerCapture(pointer.pointerId))canvas.setPointerCapture(pointer.pointerId);}pan={x:pointer.x+e.clientX-pointer.clientX,y:pointer.y+e.clientY-pointer.clientY};transform();return;}
    if(!drag&&Math.hypot(e.clientX-pointer.clientX,e.clientY-pointer.clientY)<6)return;
    if(!drag){
      const roots=selectionRoots(),ids=new Set();roots.forEach(root=>M.walk(root,n=>ids.add(n.id)));drag={id:pointer.id,roots:roots.map(n=>n.id),ids,target:null,placement:'child',cacheKey:undefined,projection:null};document.body.classList.add('dragging');canvas.setPointerCapture(pointer.pointerId);nodesEl.getAnimations({subtree:true}).forEach(a=>a.cancel());
      nodesEl.querySelectorAll('.node').forEach(el=>{if(ids.has(el.dataset.id))el.classList.add('drag-source');});
      edgesEl.querySelectorAll('[data-to]').forEach(el=>{if(ids.has(el.dataset.to))el.classList.add('drag-source');});
    }
    const now=point(e),visible=drag.target?drag.displaced:null;drag.target=null;drag.placement='child';let distance=28/zoom;
    if(drag.id!==store.doc.root.id)graph.nodes.filter(n=>!drag.ids.has(n.id)).map(n=>visible?.get(n.id)||n).forEach(p=>{
      const dx=Math.max(Math.abs(now.x-p.x)-p.width/2,0),dy=Math.max(Math.abs(now.y-p.y)-p.height/2,0),down=store.doc.layout==='down',side=p.parentId===null?(store.doc.layout==='left'?-1:1):p.side;
      const controlX=down?p.x:p.x+side*(p.width/2+16),controlY=down?p.y+p.height/2+16:p.y;
      const d=Math.min(Math.hypot(dx,dy),Math.max(0,Math.hypot(now.x-controlX,now.y-controlY)-13));
      if(d<distance){distance=d;drag.target=p.id;}
    });
    nodesEl.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));
    if(drag.target){
      const hovered=visible?.get(drag.target)||positions.get(drag.target),down=store.doc.layout==='down',delta=down?now.x-hovered.x:now.y-hovered.y,half=down?hovered.width/2:hovered.height/2;
      // The entire node body (and its outward +/- control) means child.
      // Reordering requires leaving the body across its cross-axis boundary.
      if(hovered.parentId&&Math.abs(delta)>half+6/zoom)drag.placement=delta<0?'before':'after';
      const key=drag.target+':'+drag.placement;if(drag.cacheKey!==key){
        drag.cacheKey=key;const copy=M.clone(store.doc);drag.projection=null;drag.anchorDelta=null;
        if(reparentSelection(copy,drag.roots,drag.target,drag.placement)){
          // Only the preview copy is collapsed; committing preserves fold states.
          drag.roots.forEach(id=>{M.find(copy.root,id).collapsed=true;});
          const projected=L.layoutTree(copy.root,copy.layout).nodes,target=projected.find(n=>n.id===drag.target);
          // Keep the hovered node at its original screen position. This is a
          // camera translation, never a stored/free node coordinate.
          if(target){
            const dx=hovered.x-target.x,dy=hovered.y-target.y;drag.anchorDelta={x:dx,y:dy};drag.projectedRecords=M.index(copy.root);
            const subtree=projected.filter(n=>drag.ids.has(n.id)).map(n=>({...n,x:n.x+dx,y:n.y+dy}));
            const original=positions.get(drag.target),anchorX=hovered.x-original.x,anchorY=hovered.y-original.y,anchored=new Set();
            M.walk(records.byId.get(drag.target),n=>anchored.add(n.id));
            const base=graph.nodes.map(n=>anchored.has(n.id)?{...n,x:n.x+anchorX,y:n.y+anchorY}:n);
            const preview=L.insertionPreview(subtree,base,drag.ids,drag.target,copy.layout,drag.placement,Math.sign(down?anchorX:anchorY));
            drag.projection=preview.incoming;drag.displaced=new Map(base.filter(n=>{const old=positions.get(n.id);return n.x!==old.x||n.y!==old.y;}).map(n=>[n.id,n]));
            preview.displaced.forEach((n,id)=>drag.displaced.set(id,n));
          }
        }
      }
      if(drag.projection){nodesEl.querySelector(`[data-id="${CSS.escape(drag.target)}"]`)?.classList.add('drop-target');}else drag.target=null;
    }
    if(!drag.target){drag.cacheKey=undefined;drag.displaced=null;}
    if(drag.target)paintDrag(drag.projection);else{drag.projectedRecords=records;const dx=now.x-pointer.start.x,dy=now.y-pointer.start.y;paintDrag(drag.roots.map(id=>{const p=positions.get(id);return {...p,x:p.x+dx,y:p.y+dy};}));}const hint=$('drag-hint');hint.hidden=false;hint.textContent=drag.target?(drag.placement==='child'?'移入「':'放到「')+(records.byId.get(drag.target).text||'空白节点')+'」'+(drag.placement==='before'?'之前':drag.placement==='after'?'之后':'')+' · 插入预览 · 松手确认 · Esc 取消':'拖到节点框内移入，框外边缘调整顺序 · 空白松手取消';hint.style.left=Math.max(8,Math.min(e.clientX+18,innerWidth-300))+'px';hint.style.top=Math.max(8,Math.min(e.clientY+20,innerHeight-45))+'px';
  }
  document.addEventListener('pointermove',e=>{
    if(!pointer||e.pointerId!==pointer.pointerId)return;lastPointer={clientX:e.clientX,clientY:e.clientY,pointerId:e.pointerId};if(!dragFrame)dragFrame=requestAnimationFrame(()=>{dragFrame=0;if(lastPointer)updateGesture(lastPointer);});
  });
  document.addEventListener('pointerup',e=>{
    if(!pointer||e.pointerId!==pointer.pointerId)return;cancelAnimationFrame(dragFrame);dragFrame=0;updateGesture(e);
    if(pointer.kind==='marquee'){const ids=selectionRoots().map(n=>n.id);pointer.originalIds=null;select(ids[0]||null,ids);clearDrag();}
    else if(drag){const d=drag;clearDrag();if(d.target&&d.projection){store.apply(doc=>reparentSelection(doc,d.roots,d.target,d.placement));pan.x+=d.anchorDelta.x*zoom;pan.y+=d.anchorDelta.y*zoom;transform();suppressLayoutMotion=true;changed();}}
    else clearDrag();
  });
  document.addEventListener('pointercancel',clearDrag);window.addEventListener('blur',()=>{clearDrag();spacePan=false;document.body.classList.remove('space-pan');});
  document.addEventListener('keydown',e=>{
    if(titleEditing){if(!e.isComposing&&e.keyCode!==229){if(e.key==='Enter'){e.preventDefault();finishTitle();canvas.focus();}else if(e.key==='Escape'){e.preventDefault();finishTitle(true);canvas.focus();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();finishTitle();action(e.shiftKey?'save-as':'save');}}return;}
    if(composing||e.isComposing||e.keyCode===229){if(!editing&&selected&&(e.target===canvas||e.target.closest('.node'))&&!busy)startEdit(selected);return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&!e.target.closest('input,textarea,select')){
      e.preventDefault();if(busy||pointer||drag)return;
      if(editing||$('modal').open){const range=document.createRange();range.selectNodeContents(editing?editing.el:$('modal-content'));getSelection().removeAllRanges();getSelection().addRange(range);}else if(status==='normal')selectViewport();return;
    }
    if($('modal').open||busy)return;
    if(pointer||drag){e.preventDefault();if(e.key==='Escape')clearDrag();return;}
    if(experience?.keydown(e))return;
    const openMenu=Array.from(document.querySelectorAll('.popover')).find(el=>!el.hidden);
    if(openMenu&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
      e.preventDefault();const buttons=Array.from(openMenu.querySelectorAll('button:not(:disabled)'));let index=buttons.indexOf(document.activeElement);index=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;buttons[index]?.focus();return;
    }
    const inControl=e.target.closest('input,select,textarea,button')&&!editing;
    const ctrl=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
    if(ctrl&&!e.altKey){
      const names={s:e.shiftKey?'save-as':'save',o:'open',n:'new',z:e.shiftKey?'redo':'undo',y:'redo',b:'bold',i:'italic',u:'underline'};
      if(names[k]&&!e.target.closest('input,select,textarea')){e.preventDefault();action(names[k]);return;}
      if(['+','=','-','0'].includes(k)){e.preventDefault();if(k==='0')setZoom(1);else setZoom(zoom*(k==='-'?1/1.15:1.15));return;}
    }
    if(e.key==='Escape'){if(drag||pointer){clearDrag();return;}if(editing){e.preventDefault();finishEdit();canvas.focus();}else if(selectedIds.size>1)select(selected);hideMenus();return;}
    if(inControl||ctrl||e.altKey||status!=='normal')return;
    if(e.key==='Tab'&&selected){e.preventDefault();addNode();return;}
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(e.repeat)return;if(editing){finishEdit();canvas.focus();}else if(selected)addNode(true);return;}
    if(editing)return;
    if(e.code==='Space'&&selected){e.preventDefault();if(!e.repeat)action('fold');return;}
    if(e.code==='Space'&&!selected){e.preventDefault();spacePan=true;document.body.classList.add('space-pan');return;}
    if(e.key==='Home'){e.preventDefault();select(store.doc.root.id);center(true);return;}
    if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();remove();return;}
    if(e.key==='F2'&&selected){e.preventDefault();startEdit(selected);return;}
    if(e.key.startsWith('Arrow')&&selected){
      e.preventDefault();if(e.shiftKey&&(e.key==='ArrowUp'||e.key==='ArrowDown'))moveSibling(e.key==='ArrowUp'?-1:1);else navigateNode(e.key);return;
    }
    if(e.key.length===1&&selected){e.preventDefault();startEdit(selected,e.key);}
  });
  document.addEventListener('keyup',e=>{if(e.code==='Space'){spacePan=false;document.body.classList.remove('space-pan');}});
  function stopAnimation(){clearInterval(animationTimer);animationRunning=false;document.querySelectorAll('.animation-ring').forEach(el=>el.remove());}
  function startAnimation(){
    stopAnimation();finishEdit();animationTick=0;animationRunning=true;
    const child=store.doc.root.children[0];if(!child){toast('请切换到正常导图场景观察折叠演示。');return;}
    const p=positions.get(child.id);if(p){const ring=document.createElement('div');ring.className='animation-ring';ring.dataset.node=child.id;ring.style.cssText=`left:${p.x-p.width/2-5}px;top:${p.y-p.height/2-5}px;width:${p.width+10}px;height:${p.height+10}px`;world.append(ring);}
    const targetId=child.id,originalFold=!!child.collapsed;animationTimer=setInterval(()=>{if(paused||editing||drag||!animationRunning)return;const current=M.find(store.doc.root,targetId);if(!current){stopAnimation();return;}animationTick++;store.apply(()=>current.collapsed=animationTick>=6?originalFold:animationTick%2===1);render();if(animationTick>=6)stopAnimation();},1300);
  }
  function setScene(name){
    clearDrag();stopAnimation();currentScene=name;const scene=MindLiteScenes.createScene(name);finishEdit();store.load(scene);selected=store.doc.root.id;selectedIds=new Set([selected]);status=scene.status;path=null;experience?.reset();zoom=1;render();center();
    const msg=$('scene-message');msg.hidden=status==='normal';msg.replaceChildren();
    if(status==='loading'){const spinner=document.createElement('div');spinner.className='spinner';msg.append(spinner);const text=document.createElement('strong');text.textContent='正在整理你的想法…';msg.append(text);}
    if(status==='error'){const title=document.createElement('strong');title.textContent='暂时无法打开这份导图';msg.append(title,document.createTextNode('模拟文件格式错误，你的当前内容不会丢失。'));}
    if(status!=='normal'){const button=document.createElement('button');button.textContent='返回正常预览';button.onclick=()=>{$('scenario').value='normal';setScene('normal');};msg.append(button);}
  }
  $('scenario').addEventListener('change',e=>setScene(e.target.value));
  window.MindLiteApp={requestClose:async()=>{if(busy||$('modal').open)return;busy=true;try{if(await canDiscard()){clearTimeout(recoveryTimer);await B.call('checkpoint',{content:null});await B.call('close');}}catch(e){toast(e.message);}finally{busy=false;}}};
  configureMenus();experience=MindLiteExperience.connect({store,canvas,toast,selected:()=>selected,selection:()=>Array.from(selectedIds),selectionRoots,busy:()=>busy||!!pointer||!!drag,select,finishEdit,changed,reveal,hideMenus,remove});$('preview-controls').hidden=!B.preview;document.body.classList.toggle('preview-mode',B.preview);center();render();canvas.focus();
  let previousSize={width:canvas.clientWidth,height:canvas.clientHeight};new ResizeObserver(()=>{const next={width:canvas.clientWidth,height:canvas.clientHeight};pan.x+=(next.width-previousSize.width)/2;pan.y+=(next.height-previousSize.height)/2;previousSize=next;hideMenus();transform();}).observe(canvas);
  window.addEventListener('beforeunload',e=>{if(!B.native&&store.dirty&&!B.preview){e.preventDefault();e.returnValue='';}});
  if(B.native){busy=true;document.body.classList.add('busy');B.call('startup').then(async result=>{
    if(result?.content){const doc=F.parse(result.content,result.path?.split('.').pop()||'mm');if(doc.requiresCopy&&!await confirmCopy())return;await loadDoc(doc,doc.requiresCopy?null:result.path||null,!!doc.requiresCopy);}
    else if(result?.recovery){const recoveredPath=result.recoveryPath||null;const yes=await modal('恢复上次的编辑？',recoveredPath?'发现上次未保存的修改，恢复后保存将直接覆盖原文件。':'发现上次未保存的导图，可以恢复后保存。',[['忽略',false],['恢复',true,'primary']]);if(yes)await loadDoc(F.parse(result.recovery,'mindlite'),recoveredPath,true);}
  }).catch(e=>modal('打开失败',e.message)).finally(()=>{busy=false;document.body.classList.remove('busy');});}
})();
