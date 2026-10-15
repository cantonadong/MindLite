'use strict';
window.MindLiteModel = (()=>{
  const clone=value=>JSON.parse(JSON.stringify(value));
  const id=()=>globalThis.crypto?.randomUUID?.()||'n-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const node=(text='')=>({id:id(),text,children:[]});
  const blank=()=>({version:1,root:node(),layout:'auto',line:'rounded',colorMode:'branch',color:'#6F90CF'});
  function walk(root,fn,parent=null,depth=0){fn(root,parent,depth);root.children.forEach(n=>walk(n,fn,root,depth+1));}
  function find(root,key){if(root.id===key)return root;for(const c of root.children){const n=find(c,key);if(n)return n;}return null;}
  function parent(root,key){let result=null;walk(root,(n,p)=>{if(n.id===key)result=p;});return result;}
  function count(root){let n=0;walk(root,()=>n++);return n;}
  function index(root){const byId=new Map(),parents=new Map(),depths=new Map();walk(root,(n,p,d)=>{byId.set(n.id,n);parents.set(n.id,p);depths.set(n.id,d);});return {byId,parents,depths};}
  function normalize(input){
    if(!input||typeof input!=='object'||!input.root)throw Error('不是有效的 MindLite 文档。');
    if(input.version!=null&&input.version!==1)throw Error('此文档版本暂不受支持。');
    let total=0;const ids=new Set();
    function read(n,depth){
      if(!n||typeof n!=='object'||Array.isArray(n))throw Error('节点数据无效。');
      if(++total>10000||depth>100)throw Error('导图超过限制：最多 10,000 个节点、100 层。');
      if(n.text!=null&&typeof n.text!=='string')throw Error('节点文字必须是字符串。');
      if(n.text?.length>20000)throw Error('单个节点文字超过 20,000 字符，请拆分后导入。');
      let key=typeof n.id==='string'&&n.id.trim()&&n.id.length<150?n.id:id();if(ids.has(key))key=id();ids.add(key);
      const result={id:key,text:n.text||'',children:[]};
      if(n.side==='left'||n.side==='right')result.side=n.side;
      for(const k of ['bold','italic','underline','done','collapsed'])if(n[k]===true)result[k]=true;
      if(n.children!=null&&!Array.isArray(n.children))throw Error('子节点列表无效。');
      result.children=(n.children||[]).map(c=>read(c,depth+1));return result;
    }
    const result={version:1,root:read(input.root,0),layout:['auto','right','left','down','both'].includes(input.layout)?input.layout:'auto',line:input.line==='curve'?'curve':'rounded',colorMode:['single','branch','random'].includes(input.colorMode)?input.colorMode:'branch',color:/^#[0-9a-f]{6}$/i.test(input.color||'')?input.color:'#6F90CF'};if(typeof input.title==='string'&&input.title.trim())result.title=input.title.replace(/[\r\n]/g,' ').trim().slice(0,120);return result;
  }
  class Store{
    constructor(doc=blank()){this.load(doc);}
    load(doc){this.doc=normalize(doc);this.past=[];this.future=[];this._snapshot=JSON.stringify(this.doc);this.saved=this._snapshot;}
    trimHistory(){let size=this.past.reduce((total,s)=>total+s.length,0)+this.future.reduce((total,s)=>total+s.length,0);while(this.past.length>1&&(this.past.length>100||size>16*1024*1024))size-=this.past.shift().length;}
    apply(fn){const before=this._snapshot;try{fn(this.doc);}catch(error){this.doc=JSON.parse(before);throw error;}this._snapshot=JSON.stringify(this.doc);if(before!==this._snapshot){this.past.push(before);this.future=[];this.trimHistory();return true;}return false;}
    undo(){if(!this.past.length)return false;this.future.push(this._snapshot);this._snapshot=this.past.pop();this.doc=JSON.parse(this._snapshot);return true;}
    redo(){if(!this.future.length)return false;this.past.push(this._snapshot);this._snapshot=this.future.pop();this.doc=JSON.parse(this._snapshot);this.trimHistory();return true;}
    markSaved(snapshot=this._snapshot){this.saved=snapshot;}
    get snapshot(){return this._snapshot;}
    get dirty(){return this.saved!==this._snapshot;}
  }
  return {clone,id,node,blank,walk,find,parent,count,index,normalize,Store};
})();
