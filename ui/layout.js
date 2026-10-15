'use strict';
window.MindLiteLayout = (()=>{
  const measure=document.createElement('canvas').getContext('2d');
  const sizesCache=new Map();
  const SIBLING_GAP=20;
  function size(n,root=false){
    const key=JSON.stringify([n.text,!!n.bold,!!n.italic,!!n.done,root]);if(sizesCache.has(key))return sizesCache.get(key);
    const font=root?19:14;measure.font=`${n.italic?'italic ':''}${n.bold?'700':root?'550':'400'} ${font}px "Segoe UI", "Microsoft YaHei UI", sans-serif`;
    const max=root?260:230,pad=(root?52:36)+(n.done?(root?30:26):0),lines=[];
    for(const line of (n.text||(root?'中心主题':'输入文字')).split('\n')){
      let row='';for(const char of line){if(measure.measureText(row+char).width>max-pad&&row){lines.push(row);row=char;}else row+=char;}lines.push(row);
    }
    const width=Math.ceil(Math.min(max,Math.max(root?132:76,...lines.map(l=>measure.measureText(l).width+pad))));
    const result={width,height:Math.max(root?59:42,Math.ceil(lines.length*font*1.5+(root?34:24))),lines};if(sizesCache.size>1500)sizesCache.clear();sizesCache.set(key,result);return result;
  }
  function layoutTree(root,mode){
    const nodes=[],edges=[],sizes=new Map(),spans=new Map(),gap=mode==='down'?32:SIBLING_GAP;
    function prep(n){const s=size(n,n===root);sizes.set(n.id,s);const cs=n.collapsed?[]:n.children;cs.forEach(prep);const span=mode==='down'?s.width:s.height;const kids=cs.reduce((v,c)=>v+spans.get(c.id),0)+Math.max(0,cs.length-1)*gap;spans.set(n.id,Math.max(span,kids));}
    prep(root);
    function place(n,x,y,parent,branchIndex,side){
      const s=sizes.get(n.id);
      const out={id:n.id,parentId:parent?.id||null,x,y,width:s.width,height:s.height,branchIndex,side,lines:s.lines};nodes.push(out);if(parent)edges.push({from:parent.id,to:n.id});
      const kids=n.collapsed?[]:n.children;if(!kids.length)return;
      let cursor=-(kids.reduce((v,c)=>v+spans.get(c.id),0)+(kids.length-1)*gap)/2;
      kids.forEach(c=>{const cs=sizes.get(c.id),span=spans.get(c.id);const cx=mode==='down'?x+cursor+span/2:x+side*(s.width/2+78+cs.width/2);const cy=mode==='down'?y+s.height/2+74+cs.height/2:y+cursor+span/2;place(c,cx,cy,n,branchIndex,side);cursor+=span+gap;});
    }
    const rs=sizes.get(root.id);nodes.push({id:root.id,parentId:null,x:0,y:0,width:rs.width,height:rs.height,branchIndex:-1,side:1,lines:rs.lines});
    if(!root.collapsed){
      const groups={left:[],right:[]};let leftWeight=0,rightWeight=0;
      root.children.forEach((n,i)=>{let side;if(mode==='left')side=-1;else if(mode==='right'||mode==='down')side=1;else if(n.side)side=n.side==='left'?-1:1;else if(mode==='both')side=i%2===0?1:-1;else side=rightWeight<=leftWeight?1:-1;(side===1?groups.right:groups.left).push({n,i});if(side===1)rightWeight+=spans.get(n.id);else leftWeight+=spans.get(n.id);});
      for(const [key,items]of Object.entries(groups)){
        let cursor=-(items.reduce((v,c)=>v+spans.get(c.n.id),0)+Math.max(0,items.length-1)*gap)/2;const side=key==='right'?1:-1;
        items.forEach(({n,i})=>{const s=sizes.get(n.id),span=spans.get(n.id);place(n,mode==='down'?cursor+span/2:side*(rs.width/2+90+s.width/2),mode==='down'?rs.height/2+78+s.height/2:cursor+span/2,root,i,side);cursor+=span+gap;});
      }
    }
    return {nodes,edges};
  }
  function path(a,b,down=false,curve=false){
    const side=b.x>=a.x?1:-1;const x1=down?a.x:a.x+side*a.width/2,y1=down?a.y+a.height/2:a.y,x2=down?b.x:b.x-side*b.width/2,y2=down?b.y-b.height/2:b.y;
    if(curve)return down?`M${x1} ${y1}C${x1} ${(y1+y2)/2} ${x2} ${(y1+y2)/2} ${x2} ${y2}`:`M${x1} ${y1}C${(x1+x2)/2} ${y1} ${(x1+x2)/2} ${y2} ${x2} ${y2}`;
    if(Math.abs(x2-x1)<1||Math.abs(y2-y1)<1)return `M${x1} ${y1}L${x2} ${y2}`;
    const mid=down?(y1+y2)/2:(x1+x2)/2,r=Math.min(12,Math.abs(y2-y1)/2,Math.abs(x2-x1)/2),sy=Math.sign(y2-y1),sx=Math.sign(x2-x1);
    return down?`M${x1} ${y1}V${mid-r*sy}Q${x1} ${mid} ${x1+r*sx} ${mid}H${x2-r*sx}Q${x2} ${mid} ${x2} ${mid+r*sy}V${y2}`:`M${x1} ${y1}H${mid-r*sx}Q${mid} ${y1} ${mid} ${y1+r*sy}V${y2-r*sy}Q${mid} ${y2} ${mid+r*sx} ${y2}H${x2}`;
  }
  function bounds(nodes){return {left:Math.min(...nodes.map(n=>n.x-n.width/2))-45,top:Math.min(...nodes.map(n=>n.y-n.height/2))-45,right:Math.max(...nodes.map(n=>n.x+n.width/2))+45,bottom:Math.max(...nodes.map(n=>n.y+n.height/2))+45};}
  function reservePreview(nodes,occupied,mode,placement){
    if(!nodes.length)return nodes;
    // Reserve the whole final subtree, including gaps between its descendants.
    // Existing nodes remain in place until release, so final-layout coordinates
    // alone cannot guarantee a clear preview in the current drawing.
    const b=bounds(nodes),box={left:b.left+45,right:b.right-45,top:b.top+45,bottom:b.bottom-45};
    const down=mode==='down',direction=placement==='before'?-1:1,blocked=[];
    for(const n of occupied){
      const left=n.x-n.width/2,right=n.x+n.width/2,top=n.y-n.height/2,bottom=n.y+n.height/2;
      if(down?box.bottom+SIBLING_GAP<=top||box.top-SIBLING_GAP>=bottom:box.right+SIBLING_GAP<=left||box.left-SIBLING_GAP>=right)continue;
      const low=down?left-SIBLING_GAP-box.right:top-SIBLING_GAP-box.bottom;
      const high=down?right+SIBLING_GAP-box.left:bottom+SIBLING_GAP-box.top;
      blocked.push(direction===1?[low,high]:[-high,-low]);
    }
    blocked.sort((a,b)=>a[0]-b[0]);let shift=0;
    for(const [low,high]of blocked){if(low>=shift)break;if(high>shift)shift=high;}
    if(!shift)return nodes;
    return nodes.map(n=>({...n,x:n.x+(down?direction*shift:0),y:n.y+(down?0:direction*shift)}));
  }
  function insertionPreview(nodes,original,dragIds,targetId,mode,placement,anchorDirection=0){
    const byId=new Map(original.map(n=>[n.id,n])),order=new Map(original.map((n,i)=>[n.id,i])),children=new Map(),down=mode==='down',direction=placement==='before'?-1:1;
    for(const n of original){if(!children.has(n.parentId))children.set(n.parentId,[]);children.get(n.parentId).push(n);}
    function collect(id){const result=[];function visit(key){if(dragIds.has(key))return;const n=byId.get(key);if(!n)return;result.push(n);(children.get(key)||[]).forEach(c=>visit(c.id));}visit(id);return result;}
    const rect=items=>{const b=bounds(items);return {x:(b.left+b.right)/2,y:(b.top+b.bottom)/2,width:b.right-b.left-90,height:b.bottom-b.top-90};};
    const start=n=>(down?n.x-n.width/2:n.y-n.height/2),end=n=>(down?n.x+n.width/2:n.y+n.height/2);
    const target=byId.get(targetId),protectedNodes=collect(targetId),incomingBox=rect(nodes);
    const local=placement==='child'?protectedNodes.filter(n=>n.id!==targetId&&n.side===nodes[0].side):protectedNodes;
    let incoming=nodes;
    if(local.length){
      const localBox=rect(local),offset=direction===1?end(localBox)+SIBLING_GAP-start(incomingBox):start(localBox)-SIBLING_GAP-end(incomingBox);
      incoming=nodes.map(n=>({...n,x:n.x+(down?offset:0),y:n.y+(down?0:offset)}));
    }else if(placement==='child'){
      const offset=start(target)-start(incomingBox);
      incoming=nodes.map(n=>({...n,x:n.x+(down?offset:0),y:n.y+(down?0:offset)}));
    }
    // Pack following sibling subtrees away from the local insertion slot,
    // rather than moving the insertion past those siblings.
    const occupied=[rect(incoming),rect(protectedNodes)],displaced=new Map();
    const flows=[direction];if(anchorDirection&&anchorDirection!==direction)flows.push(anchorDirection);
    for(const flow of flows){
      const groups=[];let ancestor=target;
      while(ancestor?.parentId){
        for(const peer of children.get(ancestor.parentId)||[]){
          if(peer.id===ancestor.id||peer.side!==target.side)continue;
          if(flow*(order.get(peer.id)-order.get(ancestor.id))<=0)continue;
          const group=collect(peer.id);if(group.length)groups.push(group);
        }
        ancestor=byId.get(ancestor.parentId);
      }
      groups.sort((a,b)=>flow===1?start(rect(a))-start(rect(b)):end(rect(b))-end(rect(a)));
      for(const group of groups){
        const moved=reservePreview(group,occupied,mode,flow===-1?'before':'after');
        if(moved===group)continue;
        moved.forEach(n=>displaced.set(n.id,n));occupied.push(rect(moved));
      }
    }
    return {incoming,displaced};
  }
  return {size,layoutTree,path,bounds,insertionPreview};
})();
