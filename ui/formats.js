'use strict';
window.MindLiteFormats = (()=>{
  const M=MindLiteModel,L=MindLiteLayout;
  function esc(value){const text=String(value);for(const char of text){const cp=char.codePointAt(0);if(!(cp===9||cp===10||cp===13||cp>=32&&cp<=0xd7ff||cp>=0xe000&&cp<=0xfffd||cp>=0x10000&&cp<=0x10ffff))throw Error('文字包含 FreeMind/XML 不支持的字符 U+'+cp.toString(16).toUpperCase().padStart(4,'0')+'，请删除后再保存。');}return text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
  const attr=value=>esc(value).replace(/\t/g,'&#9;').replace(/\n/g,'&#10;').replace(/\r/g,'&#13;');
  function parse(content,extension){
    if(content.length>20*1024*1024)throw Error('文件过大，最大支持 20 MB。');
    content=content.replace(/^\uFEFF/,'');
    if(extension==='mm'||content.trimStart().startsWith('<'))return fromMM(content);
    try{return M.normalize(JSON.parse(content));}catch(e){throw Error('打开失败：'+e.message);}
  }
  function fromMM(xml){
    if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('为保护本地文件，暂不接受包含 DTD 或实体声明的 XML。');
    const dom=new DOMParser().parseFromString(xml,'application/xml');
    if(dom.querySelector('parsererror'))throw Error('FreeMind XML 格式不正确。');
    const map=dom.documentElement;if(map.tagName!=='map')throw Error('不是有效的 FreeMind 文件。');
    const root=Array.from(map.children).find(x=>x.tagName==='node');if(!root)throw Error('文件没有中心节点。');
    let total=0;const positions=[];
    function read(el,depth){
      if(++total>10000||depth>100)throw Error('导图超过限制：最多 10,000 个节点、100 层。');
      const kids=Array.from(el.children),font=kids.find(x=>x.tagName==='font'),rich=kids.find(x=>x.tagName==='richcontent'&&x.getAttribute('TYPE')==='NODE');
      let text=el.getAttribute('TEXT');
      if(text===null&&rich){const body=rich.querySelector('body');text=body?Array.from(body.querySelectorAll('p')).map(p=>p.textContent).join('\n')||body.textContent:rich.textContent;}
      const n=M.node(text||'');if(el.getAttribute('ID'))n.id=el.getAttribute('ID');const side=el.getAttribute('ML_SIDE')||(!map.hasAttribute('ML_LAYOUT')?el.getAttribute('POSITION'):null);if(depth===1&&['left','right'].includes(side))n.side=side;n.bold=font?.getAttribute('BOLD')==='true';n.italic=font?.getAttribute('ITALIC')==='true';n.underline=el.getAttribute('ML_UNDERLINE')==='true';n.done=el.getAttribute('ML_DONE')==='true'||kids.some(x=>x.tagName==='icon'&&x.getAttribute('BUILTIN')==='button_ok');n.collapsed=el.getAttribute('FOLDED')==='true';
      n.children=kids.filter(x=>x.tagName==='node').map(c=>{if(depth===0)positions.push(c.getAttribute('POSITION'));return read(c,depth+1);});return n;
    }
    const doc=M.blank();doc.root=read(root,0);
    const layout=map.getAttribute('ML_LAYOUT');if(layout)doc.layout=layout;else if(positions.length&&positions.every(x=>x==='left'))doc.layout='left';else if(positions.some(x=>x==='left'))doc.layout='both';else doc.layout='right';
    doc.line=map.getAttribute('ML_LINE')||'rounded';doc.colorMode=map.getAttribute('ML_COLOR_MODE')||'branch';doc.color=map.getAttribute('ML_COLOR')||'#6F90CF';doc.title=map.getAttribute('ML_TITLE')||'';
    const allowed={map:['version','ML_TITLE','ML_LAYOUT','ML_LINE','ML_COLOR_MODE','ML_COLOR'],node:['TEXT','ID','POSITION','FOLDED','ML_SIDE','ML_UNDERLINE','ML_DONE','ML_X','ML_Y'],font:['NAME','SIZE','BOLD','ITALIC'],icon:['BUILTIN']};
    const unsupported=[map,...map.querySelectorAll('*')].some(el=>!allowed[el.tagName]||Array.from(el.attributes).some(a=>!allowed[el.tagName].includes(a.name))||el.tagName==='icon'&&el.getAttribute('BUILTIN')!=='button_ok'||el.tagName==='font'&&(el.hasAttribute('SIZE')&&el.getAttribute('SIZE')!=='14'||el.hasAttribute('NAME')&&el.getAttribute('NAME')!=='SansSerif'));
    const result=M.normalize(doc);Object.defineProperty(result,'requiresCopy',{value:unsupported});return result;
  }
  function toMM(doc){
    const positions=new Map(L.layoutTree({...doc.root,collapsed:false},doc.layout).nodes.map(n=>[n.id,n.side===-1?'left':'right']));
    function write(n,depth){
      let attrs=` TEXT="${attr(n.text)}" ID="${attr(n.id)}"`;
      if(depth===1)attrs+=` POSITION="${positions.get(n.id)||'right'}"`;
      if(n.side)attrs+=` ML_SIDE="${n.side}"`;
      if(n.collapsed)attrs+=' FOLDED="true"';if(n.underline)attrs+=' ML_UNDERLINE="true"';if(n.done)attrs+=' ML_DONE="true"';
      return `${'  '.repeat(depth+1)}<node${attrs}>\n${'  '.repeat(depth+2)}<font NAME="SansSerif" SIZE="14" BOLD="${!!n.bold}" ITALIC="${!!n.italic}"/>\n${n.done?'  '.repeat(depth+2)+'<icon BUILTIN="button_ok"/>\n':''}${n.children.map(c=>write(c,depth+1)).join('')}${'  '.repeat(depth+1)}</node>\n`;
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1" ML_TITLE="${attr(doc.title||'')}" ML_LAYOUT="${doc.layout}" ML_LINE="${doc.line}" ML_COLOR_MODE="${doc.colorMode}" ML_COLOR="${doc.color}">\n${write(doc.root,0)}</map>\n`;
  }
  const colorMaps=new WeakMap();
  function prepareColors(doc){
    const assigned=new Map([[doc.root.id,doc.color]]),palette=MindLiteScenes.colors;
    // Deterministic shuffled decks: use every available color once per round,
    // without changing colors on repaint, collapse, export or reopening.
    let seed=2166136261;for(const char of doc.root.id+'|'+doc.colorMode+'|'+doc.color.toUpperCase())seed=Math.imul(seed^char.charCodeAt(0),16777619);
    let state=seed||0x9e3779b9,deck=[],cursor=0,previous=doc.color;
    function random(){state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;}
    function next(){
      if(cursor===deck.length){
        deck=palette.slice();cursor=0;
        for(let i=deck.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
        if(deck.length>1&&deck[0].toUpperCase()===previous.toUpperCase())[deck[0],deck[1]]=[deck[1],deck[0]];
      }
      previous=deck[cursor++];return previous;
    }
    function visit(parent,inherited){parent.children.forEach(child=>{let color=doc.color;if(doc.colorMode==='branch')color=parent===doc.root?next():inherited;else if(doc.colorMode==='random')color=next();assigned.set(child.id,color);visit(child,color);});}
    visit(doc.root,doc.color);colorMaps.set(doc,{mode:doc.colorMode,color:doc.color,assigned});return assigned;
  }
  function color(doc,n){
    if(doc.colorMode==='single'||n.branchIndex<0)return doc.color;
    const cache=colorMaps.get(doc);if(!cache||cache.mode!==doc.colorMode||cache.color!==doc.color)prepareColors(doc);return colorMaps.get(doc).assigned.get(n.id)||doc.color;
  }
  function ink(hex){const rgb=hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.2?'#111827':'#FFFFFF';}
  function svg(doc){
    prepareColors(doc);
    const graph=L.layoutTree(doc.root,doc.layout),b=L.bounds(graph.nodes),index=new Map(graph.nodes.map(n=>[n.id,n])),records=M.index(doc.root).byId;
    const width=Math.ceil(b.right-b.left),height=Math.ceil(b.bottom-b.top);
    let body=`<rect x="${b.left}" y="${b.top}" width="${width}" height="${height}" fill="white"/>`;
    graph.edges.forEach(edge=>{const a=index.get(edge.from),n=index.get(edge.to);body+=`<path d="${L.path(a,n,doc.layout==='down',doc.line==='curve')}" fill="none" stroke="${color(doc,n)}" stroke-width="2.6"/>`;});
    graph.nodes.forEach(p=>{
      const n=records.get(p.id),c=color(doc,p),root=p.parentId===null,font=root?19:14,line=font*1.5;
      body+=`<g opacity="${n.done ? 0.78 : 1}"><rect x="${p.x-p.width/2}" y="${p.y-p.height/2}" width="${p.width}" height="${p.height}" rx="${root?12:9}" fill="${root?c:'#f2f4f7'}" stroke="${c}" stroke-opacity="${root?1:.55}" stroke-width="2"/>`;
      if(n.done){const size=root?22:18,x=p.x-p.width/2+(root?26:18);body+=`<g transform="translate(${x} ${p.y-size/2}) scale(${size/24})" fill="none" stroke="${root?ink(c):'#398963'}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${MindLiteIcons['check-circle']}"/></g>`;}
      const textX=p.x+(n.done?(root?15:13):0);
      body+=`<text x="${textX}" y="${p.y-(p.lines.length-1)*line/2+font*.35}" text-anchor="middle" font-family="Segoe UI,Microsoft YaHei UI,sans-serif" font-size="${font}" font-weight="${n.bold?700:root?550:400}" font-style="${n.italic?'italic':'normal'}" text-decoration="${[n.underline?'underline':'',n.done?'line-through':''].filter(Boolean).join(' ')}" fill="${root?ink(c):'#374151'}">${p.lines.map((s,i)=>`<tspan x="${textX}" dy="${i?line:0}">${esc(n.text?s:root?'中心主题':'输入文字')}</tspan>`).join('')}</text>`;
      if(n.collapsed&&n.children.length){const down=doc.layout==='down',side=root?(doc.layout==='left'?-1:1):p.side,x=down?p.x:p.x+side*(p.width/2+16),y=down?p.y+p.height/2+16:p.y;body+=`<circle cx="${x}" cy="${y}" r="9.5" fill="white" stroke="${c}" stroke-width="2"/><path d="M${x-4} ${y}H${x+4}M${x} ${y-4}V${y+4}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`;}
      body+='</g>';
    });
    return {text:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${b.left} ${b.top} ${width} ${height}">${body}</svg>`,width,height};
  }
  async function png(doc,scale=1){
    const result=svg(doc),width=Math.ceil(result.width*scale),height=Math.ceil(result.height*scale);
    if(width>16384||height>16384||width*height>48000000)throw Error('图片尺寸过大，请选择较低导出比例。');
    const url=URL.createObjectURL(new Blob([result.text],{type:'image/svg+xml;charset=utf-8'}));
    try{
      const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('图片渲染失败，请尝试 SVG 导出。'));image.src=url;});
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG 编码失败。')),'image/png'));
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('PNG 编码失败。'));reader.readAsDataURL(blob);});return data;
    }finally{URL.revokeObjectURL(url);}
  }
  return {parse,fromMM,toMM,prepareColors,color,ink,svg,png,esc};
})();
