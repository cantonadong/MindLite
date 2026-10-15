'use strict';

window.MindLiteExperience = (() => {
  const M = MindLiteModel;
  const MIME = 'application/x-mindlite-subtree';

  function connect(api) {
    const {store, canvas, toast} = api;
    const searchBar = document.getElementById('search-bar');
    const searchInput = document.getElementById('search-input');
    const counter = document.getElementById('search-count');
    let matches = [], current = -1, query = '', searchTimer;
    let copied = null;

    const externalInput = target => !!target?.closest?.('input,textarea,select,[contenteditable="plaintext-only"],[contenteditable="true"]');
    const clipboardAvailable = e => !api.busy() && !externalInput(e.target) && !!api.selected() && !document.getElementById('modal').open;

    function refresh() {
      query = searchInput.value.trim().toLocaleLowerCase();
      const currentId = matches[current];
      matches = [];
      if (query) M.walk(store.doc.root, node => {
        if (node.text.toLocaleLowerCase().includes(query)) matches.push(node.id);
      });
      current = currentId ? matches.indexOf(currentId) : -1;
      if (current < 0 && matches.length) current = 0;
      const ids = new Set(matches);
      document.querySelectorAll('#nodes .node').forEach(el => {
        el.classList.toggle('search-match', !searchBar.hidden && ids.has(el.dataset.id));
        el.classList.toggle('search-current', !searchBar.hidden && el.dataset.id === matches[current]);
      });
      counter.textContent = `${current + 1} / ${matches.length}`;
      searchBar.classList.toggle('no-results', !!query && !matches.length);
      searchBar.querySelectorAll('[data-action^="search-"]').forEach(button => {
        if (button.dataset.action !== 'search-close') button.disabled = !matches.length;
      });
    }

    function go(step = 0) {
      if(api.busy())return;
      api.finishEdit();
      if (!matches.length) return;
      current = (current + step + matches.length) % matches.length;
      const id = matches[current], index = M.index(store.doc.root);
      // Search includes folded descendants. Opening their ancestors is undoable.
      store.apply(() => {
        let parent = index.parents.get(id);
        while (parent) { parent.collapsed = false; parent = index.parents.get(parent.id); }
      });
      api.select(id);
      api.changed();
      api.reveal(id, true);
      refresh();
    }

    function openSearch() {
      api.finishEdit(); api.hideMenus(); searchBar.hidden = false;
      searchInput.focus(); searchInput.select(); refresh();
    }

    function closeSearch() {
      clearTimeout(searchTimer); searchBar.hidden = true; searchInput.value = '';
      matches = []; current = -1; query = ''; refresh(); canvas.focus();
    }

    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { current = -1; matches = []; refresh(); go(); }, 180);
    });

    function outline(node, depth = 0) {
      return '\t'.repeat(depth) + node.text.replace(/\r?\n/g, ' ') + '\n' + node.children.map(n => outline(n, depth + 1)).join('');
    }

    function capture(skipRoot=false) {
      api.finishEdit();
      const ids=api.selection();let roots;
      if(skipRoot)roots=api.selectionRoots(true).map(node=>M.clone(node));
      else if(ids.length===1){const node=M.find(store.doc.root,ids[0]);roots=node?[M.clone(node)]:[];}
      else{
        const wanted=new Set(ids.filter(id=>!skipRoot||id!==store.doc.root.id));
        const collect=node=>{const children=node.children.flatMap(collect);return wanted.has(node.id)?[{...node,children}]:children;};
        roots=M.clone(collect(store.doc.root));
      }
      if(!roots.length)return null;
      const result = {roots,root:roots[0],onlySelected:ids.length>1&&!skipRoot,text: roots.map(node=>outline(node)).join('').trimEnd()};
      copied = result;
      return result;
    }

    function forestFromText(text) {
      if (!text.trim()) return [];
      if (text.length > 2 * 1024 * 1024) throw Error('粘贴内容过大，请拆分后操作。');
      const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(line => line.trim());
      if (lines.length > 10000) throw Error('粘贴内容超过节点数量限制。');
      const forest = [], stack = [];
      for (const line of lines) {
        const indent = (line.match(/^[\t ]*/)[0].replace(/\t/g, '    ')).length;
        const node = M.node(line.trim());
        if (node.text.length > 20000) throw Error('单行文字超过 20,000 字符，请拆分后粘贴。');
        while (stack.length && stack.at(-1).indent >= indent) stack.pop();
        if (stack.length) stack.at(-1).node.children.push(node); else forest.push(node);
        stack.push({indent, node});
        if (stack.length > 100) throw Error('粘贴内容层级过深。');
      }
      return forest;
    }

    function paste(text, structured = null, destination = null) {
      api.finishEdit();
      const targetId = destination || api.selected() || store.doc.root.id;
      let forest;
      if (structured) {
        const roots=Array.isArray(structured.roots)?structured.roots:[structured];if(roots.length>10000)throw Error('粘贴内容超过节点数量限制。');forest=roots.map(root=>M.normalize({version:1,root}).root);
      } else if (copied && copied.text === text.trimEnd()) {
        forest = M.clone(copied.roots||[copied.root]);
      } else forest = forestFromText(text);
      if (!forest.length) { toast('剪贴板中没有可粘贴的文字。'); return; }
      const index = M.index(store.doc.root), target = index.byId.get(targetId);
      if(!target)throw Error('粘贴目标已变化，请重新选择节点。');
      let added = 0, height = 0;
      forest.forEach(root => M.walk(root, (node, _, depth) => {
        added++; height = Math.max(height, depth);
        node.id = M.id(); delete node.offset; delete node.side;
      }));
      if (index.byId.size + added > 10000 || index.depths.get(targetId) + 1 + height > 100) {
        throw Error('粘贴后将超出 10,000 个节点或 100 层限制。');
      }
      store.apply(() => { target.collapsed = false;if(target.done)forest.forEach(root=>M.walk(root,n=>n.done=true));target.children.push(...forest); });
      api.select(forest[0].id); api.changed(); api.reveal(forest[0].id);
      canvas.focus(); toast(`已粘贴 ${added} 个节点`);
    }

    document.addEventListener('copy', e => {
      if (!clipboardAvailable(e) || !e.clipboardData) return;
      const result = capture(); if (!result) return;
      e.preventDefault(); e.clipboardData.setData('text/plain', result.text);
      try { e.clipboardData.setData(MIME, JSON.stringify({roots:result.roots})); } catch { /* Plain outline remains portable. */ }
      toast(result.onlySelected?'已复制选中的可见节点':'已复制节点及全部子节点');
    });
    document.addEventListener('cut', e => {
      if (!clipboardAvailable(e) || !e.clipboardData) return;
      if (!api.selectionRoots(true).length) { e.preventDefault(); toast('中心节点可以复制，不能剪切。'); return; }
      const result = capture(true); if (!result) return;
      e.preventDefault(); e.clipboardData.setData('text/plain', result.text);
      try { e.clipboardData.setData(MIME, JSON.stringify({roots:result.roots})); } catch { /* Plain outline remains portable. */ }
      api.remove(); toast('已剪切子树，可按 Ctrl+V 粘贴');
    });
    document.addEventListener('paste', e => {
      if (!clipboardAvailable(e) || !e.clipboardData) return;
      e.preventDefault();
      try {
        const raw = e.clipboardData.getData(MIME);
        paste(e.clipboardData.getData('text/plain'), raw ? JSON.parse(raw) : null);
      } catch (error) { toast(error.message); }
    });

    async function clipboardAction(name) {
      api.finishEdit();
      const sourceDoc=store.doc,sourceId=api.selected()||store.doc.root.id,sourceIds=api.selection();
      if (name === 'paste') {
        const text = MindLiteBridge.native
          ? await MindLiteBridge.call('clipboard_read')
          : await navigator.clipboard.readText();
        if(store.doc!==sourceDoc)throw Error('当前文档已变化，请重新粘贴。');
        paste(text || '',null,sourceId); return;
      }
      if(name==='cut'&&!api.selectionRoots(true).length){toast('中心节点可以复制，不能剪切。');return;}
      const result = capture(name==='cut'); if (!result) return;
      if (MindLiteBridge.native) await MindLiteBridge.call('clipboard_write', {text: result.text});
      else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(result.text);
      else {
        const field=document.createElement('textarea');field.value=result.text;field.style.cssText='position:fixed;opacity:0;left:-10000px';document.body.append(field);field.focus();field.select();
        let success=false;try{success=document.execCommand('copy');}finally{field.remove();canvas.focus();}
        if (!success) throw Error('请按 Ctrl+C 复制选中的子树。');
      }
      if (name === 'cut') {if(store.doc!==sourceDoc)throw Error('内容已复制，当前文档已变化，未执行删除。');api.remove(sourceIds);}
      canvas.focus(); toast(name === 'cut' ? '已剪切子树' : result.onlySelected?'已复制选中的可见节点':'已复制节点及全部子节点');
    }

    return {
      refresh,
      reset() { closeSearch(); },
      async action(name) {
        if (name === 'search') openSearch();
        else if (name === 'search-close') closeSearch();
        else if (name === 'search-prev') go(-1);
        else if (name === 'search-next') go(1);
        else if (['copy', 'cut', 'paste'].includes(name)) await clipboardAction(name);
      },
      keydown(e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); openSearch(); return true; }
        if (e.target === searchInput) {
          if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
          if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchTimer);const fresh=query!==searchInput.value.trim().toLocaleLowerCase();refresh();go(fresh?0:e.shiftKey?-1:1); }
          return true;
        }
        if (e.key === 'Escape' && !searchBar.hidden) { e.preventDefault(); closeSearch(); return true; }
        return false;
      }
    };
  }
  return {connect};
})();
