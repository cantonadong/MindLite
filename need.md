# 功能

1. 打开、保存、另存、导入（支持freemind）、导出（freemind格式、图片）

<p data-mdnote-empty="true"></p>

<p data-mdnote-empty="true"></p>

<p data-mdnote-empty="true"></p>

# 设计

## 按钮

左下角，切换：

- 自动（默认）、右、左、下、左右

<figure data-src="D:/Dev/MindLite/need.assets/d019eb5f0da16e850378c5c928d809a3.png" data-type="mdnote-image" class="mdnote-image">
<span class="mdnote-image-frame"><img src="file:///D:/Dev/MindLite/need.assets/d019eb5f0da16e850378c5c928d809a3.png" alt=""><figcaption data-role="missing">图片已失效</figcaption></span>
</figure>

缩放，默认100，可按ctrl+/-切换，或 ctrl + 滚轮切换，ctrl + 0 重置

# mind

默认居中显示空白中心点，可编辑

tab在当前选中节点新建节点，并获取焦点，可直接输入文字

enter在当前焦点节点创建同级节点

可拖转当前节点移动到任意位置

有hover效果

<figure data-src="D:/Dev/MindLite/need.assets/6625a728b06694bf02d9d2f28cc11e64.png" data-type="mdnote-image" class="mdnote-image">
<span class="mdnote-image-frame"><img src="file:///D:/Dev/MindLite/need.assets/6625a728b06694bf02d9d2f28cc11e64.png" alt=""><figcaption data-role="missing">图片已失效</figcaption></span>
</figure>

<figure data-src="D:/Dev/MindLite/need.assets/a9b91c51675fae845971fd9f2763517d.png" data-type="mdnote-image" class="mdnote-image">
<span class="mdnote-image-frame"><img src="file:///D:/Dev/MindLite/need.assets/a9b91c51675fae845971fd9f2763517d.png" alt=""><figcaption data-role="missing">图片已失效</figcaption></span>
</figure>

如节点有下级，在与下级的线之间显示收起，如果已收起，则显示展开按钮

拖拽中时，显示原位置，预期松手时的移动后位置

<figure data-src="D:/Dev/MindLite/need.assets/90448c5013e6bcf3a0748a516cd2d463.png" data-type="mdnote-image" class="mdnote-image">
<span class="mdnote-image-frame"><img src="file:///D:/Dev/MindLite/need.assets/90448c5013e6bcf3a0748a516cd2d463.png" alt=""><figcaption data-role="missing">图片已失效</figcaption></span>
</figure>

支持 ctrl z / ctrl y 的 undo /redo

点击节点，显示底部固底菜单：

- 设置粗体、斜体、下划线
- 完成，完成后，整个节点所有下级也全部完成

<p data-mdnote-empty="true"></p>

支持设置颜色配色：

- 同颜色
- 主节点不同颜色（每个第一层节点即下级单独一个颜色）
- 全随机彩色

<p data-mdnote-empty="true"></p>

## 主题配色预览

以下 HEX 为参考官网主题截图整理的近似配色，不是官方精确色值。点击色号可复制。

珊瑚红

#E45B4A

活力橙

#F58B36

暖黄色

#F6C65B

浅绿色

#9BCF9B

森林绿

#398963

青绿色

#5DBCB2

湖蓝色

#67B9D7

柔和蓝

#6F90CF

薰衣草紫

#A99AD8

玫瑰粉

#D992B3

奶油白

#FFF2D4

深炭灰

#30333B

<p data-mdnote-empty="true"></p>

<p data-mdnote-empty="true"></p>