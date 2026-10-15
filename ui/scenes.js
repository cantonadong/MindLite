'use strict';
window.MindLiteScenes = (()=>{
  const colors=['#E45B4A','#F58B36','#F6C65B','#9BCF9B','#398963','#5DBCB2','#67B9D7','#6F90CF','#A99AD8','#D992B3','#FFF2D4','#30333B','#C94F64','#E9A38B','#D7A744','#B7C77A','#77A88D','#368C8D','#4A97B8','#536CA8','#8A79B5','#B884A5','#D8C5A7','#81909D'];
  const names=['珊瑚红','活力橙','暖黄色','浅绿色','森林绿','青绿色','湖蓝色','柔和蓝','薰衣草紫','玫瑰粉','奶油白','深炭灰','蔷薇红','蜜桃粉','琥珀金','橄榄绿','鼠尾草','孔雀青','海湾蓝','靛青蓝','鸢尾紫','烟玫紫','燕麦棕','雾石灰'];
  let seq=0;
  const node=(text,children=[])=>({id:'demo-'+(++seq),text,children});
  function createScene(name){
    seq=0; let root;
    if(name==='empty')root=node('');
    else if(name==='edge')root=node('让复杂的想法，变得清晰',Array.from({length:10},(_,i)=>node('方向 '+(i+1),i===0?[node('这是一段很长的中文内容，用来观察自动换行、节点尺寸、连接线和深层结构在画布中的呈现效果。',[node('深入一层',[node('再进一步',[node('最后一个想法')])])])]:[node('灵感与记录'),node('执行与回顾')])));
    else root=node('我的灵感地图',[
      node('发现灵感',[node('捕捉一闪而过的想法'),node('连接不同的视角'),node('留一点想象的空间')]),
      node('梳理思路',[node('先有一个好问题'),node('把复杂拆成简单',[node('找到关键线索'),node('整理优先顺序')])]),
      node('开始行动',[node('从一个小目标开始'),node('专注当下的每一步')]),
      node('记录成长',[node('回顾今天的收获'),node('为下一次出发积蓄灵感')])
    ]);
    return {root,status:name==='loading'?'loading':name==='error'?'error':'normal',layout:'auto',line:'rounded',colorMode:'branch',color:'#6F90CF',version:1};
  }
  return {colors,names,createScene};
})();
