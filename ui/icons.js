'use strict';
window.MindLiteIcons = {
  search:'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',home:'m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7',up:'m8 14 4-4 4 4',close:'m6 6 12 12M6 18 18 6',edit:'m4 15 11-11 5 5L9 20l-6 1zM13 6l5 5',fold:'M4 7h16M4 17h16m-8-8v6m-3-3h6',copy:'M8 8h13v13H8zM16 8V3H3v13h5',cut:'M9 8l11 12M9 16 20 4M10 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0M10 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0',paste:'M8 5H4v16h16V5h-4M8 3h8v5H8zM8 12h8m-8 4h6',
  mind:'M4 12h6m4 0h6M10 12V5h7m-7 7v7h7M3 9v6h3V9zM17 3v4h4V3zM17 17v4h4v-4z',
  folder:'M3 7V5h6l2 2h10v13H3z', chevron:'m8 10 4 4 4-4', palette:'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4c-1-1 0-3 2-3h2c5 0 4-11-6-11zM7 9h.01M11 6h.01M16 7h.01M6 14h.01',
  help:'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  undo:'M9 5 4 10l5 5M4 10h10a5 5 0 0 1 0 10h-3', redo:'m15 5 5 5-5 5m5-5H10a5 5 0 0 0 0 10h3',
  layout:'M4 12h6m0 0V5h9m-9 7v7h9m-9-7h9M17 3v4m0 3v4m0 3v4', plus:'M12 5v14M5 12h14',minus:'M5 12h14',
  fit:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8z',
  'check-circle':'m8 12 3 3 5-6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',branch:'M5 4v12a4 4 0 0 0 4 4h10M5 8h14m-3-3 3 3-3 3m0 6 3 3-3 3',
  trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',save:'M4 3h13l4 4v14H3V3zM7 3v7h10V3M7 21v-7h10v7',
  import:'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',export:'M12 16V3m-4 4 4-4 4 4M4 16v5h16v-5',image:'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M15 7h.01'
};
window.icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${MindLiteIcons[name] || MindLiteIcons.mind}"/></svg>`;
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
