/* =========================================================
 * recipe.js — 食譜模組前端（Sprint 2）
 *
 * 內容：底部導覽切換、食譜清單、詳情頁、選取模式、採購單頁。
 * 共用 app.js 的 InventoryApiClient（自動帶 token、錯誤處理、BUSY 重試）
 * 與 toast / esc / escAttr。
 * =======================================================*/

/* ====== 狀態 ====== */
const RecipeState = {
  recipes: [],
  loaded: false,
  filterText: '',           // 搜尋關鍵字
  aiDraft: null,            // AI 生成、待確認的食譜
  aiQuery: '',              // 上次輸入的菜名
  selectionMode: false,
  selectedIds: new Set(),   // 選取模式中被勾選的食譜
  cart: new Set(),          // 採購單裡的食譜
  details: {},              // recipe_id -> { recipe, ingredients } 快取
  currentDetailId: null,
  people: 2,                // 用餐人數
};

/* ====== 檢視切換（底部導覽 + 子頁）====== */
const VIEW_IDS = {
  inventory: 'view-inventory',
  recipe:    'view-recipe',
  detail:    'view-recipe-detail',
  purchase:  'view-purchase',
};
const View = {
  current: 'inventory',
  show(name) {
    Object.keys(VIEW_IDS).forEach(function (k) {
      document.getElementById(VIEW_IDS[k]).style.display = (k === name) ? 'block' : 'none';
    });
    View.current = name;
    const isSub = (name === 'detail' || name === 'purchase');
    document.body.classList.toggle('subview', isSub);
    document.getElementById('nav-inventory').classList.toggle('active', name === 'inventory');
    document.getElementById('nav-recipe').classList.toggle('active', name === 'recipe' || isSub);
    window.scrollTo(0, 0);
  },
};

function setRecipeLoading(on) {
  document.getElementById('loading').style.display = on ? 'flex' : 'none';
}

/* ====== 進入食譜分頁 ====== */
function openRecipeTab() {
  View.show('recipe');
  if (!RecipeState.loaded) loadRecipes();
}

function recipeSkeleton(n) {
  let h = '';
  for (let i = 0; i < n; i++) {
    h += '<div class="recipe-row sk-row">' +
           '<div class="rr-main"><span class="sk sk-name"></span><span class="sk sk-meta"></span></div>' +
         '</div>';
  }
  return h;
}

async function loadRecipes() {
  document.getElementById('recipe-empty').style.display = 'none';
  document.getElementById('recipe-list').innerHTML = recipeSkeleton(6);   // 骨架屏
  try {
    const recipes = await InventoryApiClient.recipeList();
    RecipeState.recipes = recipes;
    RecipeState.loaded = true;
    renderRecipeList();
  } catch (err) {
    document.getElementById('recipe-list').innerHTML = '';
    const empty = document.getElementById('recipe-empty');
    empty.textContent = '讀取食譜失敗：' + (err.message || '未知錯誤');
    empty.style.display = 'block';
  }
}

/* ====== 食譜清單（List UI）====== */
function renderRecipeList() {
  const listEl = document.getElementById('recipe-list');
  const emptyEl = document.getElementById('recipe-empty');
  const all = RecipeState.recipes;

  // 搜尋過濾（依食譜名稱）
  const kw = RecipeState.filterText.trim().toLowerCase();
  const recipes = kw
    ? all.filter(function (r) { return (r.recipe_name || '').toLowerCase().indexOf(kw) >= 0; })
    : all;

  const hint = document.getElementById('recipe-count-hint');
  if (hint) hint.textContent = !all.length ? '' : (kw ? recipes.length + ' / ' + all.length + ' 道' : all.length + ' 道');

  if (!recipes.length) {
    listEl.innerHTML = '';
    emptyEl.textContent = all.length
      ? '找不到符合的食譜。'
      : '目前沒有食譜。可在 Google 試算表的「食譜總覽表」新增。';
    emptyEl.style.display = 'block';
    updateSelBar();
    return;
  }
  emptyEl.style.display = 'none';

  const sel = RecipeState.selectionMode;
  const sorted = recipes.slice().sort(function (a, b) {
    return String(a.recipe_name || '').localeCompare(String(b.recipe_name || ''), 'zh-Hant-u-co-zhuyin');
  });
  listEl.innerHTML = sorted.map(function (r) {
    const on = RecipeState.selectedIds.has(r.recipe_id);
    const meta =
      (r.cook_time ? '⏱ ' + esc(r.cook_time) + ' 分' : '') +
      (r.base_servings ? '　' + esc(r.base_servings) + ' 人份' : '');
    return (
      '<div class="recipe-row ' + (sel && on ? 'is-selected' : '') + '" data-id="' + escAttr(r.recipe_id) + '">' +
        (sel ? '<span class="rr-check"><input type="checkbox" class="rr-cb" ' + (on ? 'checked' : '') + '></span>' : '') +
        '<div class="rr-main">' +
          '<span class="rr-name">' + esc(r.recipe_name) + '</span>' +
          (meta ? '<span class="rr-meta">' + meta + '</span>' : '') +
        '</div>' +
        (sel ? '' : '<span class="rr-arrow">›</span>') +
      '</div>'
    );
  }).join('');

  bindRecipeRows();
  updateSelBar();
}

function bindRecipeRows() {
  const listEl = document.getElementById('recipe-list');
  Array.prototype.forEach.call(listEl.querySelectorAll('.recipe-row'), function (row) {
    const id = row.getAttribute('data-id');
    row.addEventListener('click', function () {
      if (RecipeState.selectionMode) {
        if (RecipeState.selectedIds.has(id)) RecipeState.selectedIds.delete(id);
        else RecipeState.selectedIds.add(id);
        const on = RecipeState.selectedIds.has(id);
        row.classList.toggle('is-selected', on);
        const cb = row.querySelector('.rr-cb'); if (cb) cb.checked = on;
        updateSelBar();
      } else {
        openDetail(id);
      }
    });
  });
}

/* ====== 選取模式 ====== */
function toggleSelectionMode() {
  if (RecipeState.selectionMode) exitSelectionMode();
  else enterSelectionMode();
}
function enterSelectionMode() {
  if (!RecipeState.recipes.length) { toast('目前沒有食譜', 'info'); return; }
  RecipeState.selectionMode = true;
  RecipeState.selectedIds.clear();
  document.body.classList.add('selection-mode');
  document.getElementById('btn-build-purchase').textContent = '完成';
  renderRecipeList();
}
function exitSelectionMode() {
  RecipeState.selectionMode = false;
  RecipeState.selectedIds.clear();
  document.body.classList.remove('selection-mode');
  document.getElementById('btn-build-purchase').textContent = '建立採購單';
  renderRecipeList();
}
function updateSelBar() {
  document.getElementById('recipe-sel-bar').style.display = RecipeState.selectionMode ? 'flex' : 'none';
  document.getElementById('sel-count').textContent = RecipeState.selectedIds.size;
}
function buildFromSelection() {
  if (!RecipeState.selectedIds.size) { toast('請先選擇食譜', 'info'); return; }
  RecipeState.cart = new Set(RecipeState.selectedIds);
  exitSelectionMode();
  openPurchase();
}

/* ====== 詳情頁 ====== */
async function openDetail(id) {
  setRecipeLoading(true);
  try {
    let detail = RecipeState.details[id];
    if (!detail) {
      detail = await InventoryApiClient.recipeDetail(id);
      RecipeState.details[id] = detail;
    }
    RecipeState.currentDetailId = id;
    renderDetail(detail);
    View.show('detail');
  } catch (err) {
    // 已由 client 處理（toast）
  } finally {
    setRecipeLoading(false);
  }
}

function renderDetail(d) {
  const r = d.recipe || {};
  const ings = d.ingredients || [];
  document.getElementById('detail-title').textContent = r.recipe_name || '食譜';

  let html = '<div class="rd-meta">';
  if (r.cook_time)     html += '<span class="rd-chip">⏱ ' + esc(r.cook_time) + ' 分鐘</span>';
  if (r.base_servings) html += '<span class="rd-chip">👥 ' + esc(r.base_servings) + ' 人份</span>';
  html += '</div>';
  if (r.description) html += '<p class="rd-desc">' + esc(r.description) + '</p>';

  html += '<h4 class="rd-h">食材</h4><div class="rd-ings">';
  if (ings.length) {
    ings.forEach(function (i) {
      html += '<div class="rd-ing"><span class="rd-ing-name">' + esc(i.ingredient_name) + '</span>' +
        '<span class="rd-ing-qty num">' + esc(i.qty) + (i.unit ? ' ' + esc(i.unit) : '') + '</span></div>';
    });
  } else {
    html += '<div class="rd-empty">尚未設定食材</div>';
  }
  html += '</div>';

  // 做法（用換行拆成一步一步）
  const steps = String(r.steps || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  if (steps.length) {
    html += '<h4 class="rd-h">做法</h4><div class="rd-steps">';
    steps.forEach(function (s, idx) {
      html += '<div class="rd-step"><span class="rd-step-no">' + (idx + 1) + '</span><span class="rd-step-tx">' + esc(s) + '</span></div>';
    });
    html += '</div>';
  }

  document.getElementById('recipe-detail-body').innerHTML = html;
}

function addCurrentDetailToCart() {
  const id = RecipeState.currentDetailId;
  if (!id) return;
  RecipeState.cart.add(id);
  toast('已加入採購單', 'success');
  openPurchase();
}

/* ====== 採購單頁 ====== */
async function openPurchase() {
  if (!RecipeState.cart.size) { toast('採購單是空的', 'info'); View.show('recipe'); return; }
  setRecipeLoading(true);
  try {
    const ids = Array.from(RecipeState.cart);
    for (var i = 0; i < ids.length; i++) {
      if (!RecipeState.details[ids[i]]) {
        RecipeState.details[ids[i]] = await InventoryApiClient.recipeDetail(ids[i]);
      }
    }
    renderPurchase();
    document.getElementById('people-input').value = RecipeState.people;
    View.show('purchase');
  } catch (err) {
    // 已由 client 處理
  } finally {
    setRecipeLoading(false);
  }
}

// 依比例換算食材數量：數字才換算，「適量」之類原樣保留
function scaleQty(qtyStr, factor) {
  const n = parseFloat(qtyStr);
  if (isNaN(n)) return qtyStr;
  let v = Math.round(n * factor * 100) / 100; // 取到小數兩位
  return String(v);
}

/* 把庫存做成「ID → 品項」對照表，方便比對 */
function inventoryById() {
  const map = {};
  const items = (typeof InventoryStore !== 'undefined' && InventoryStore.state.items) ? InventoryStore.state.items : [];
  items.forEach(function (it) { map[it.id] = it; });
  return map;
}

/* 常備調味料：庫存有記錄就當「家裡有」，不列入要買 */
const STAPLE_SEASONINGS = [
  '鹽', '糖', '醬油', '蠔油', '沙拉油', '橄欖油', '香油', '油',
  '胡椒', '米酒', '料理酒', '醋', '烏醋', '白醋', '太白粉',
  '番茄醬', '辣椒醬', '味醂', '雞粉', '味精', '胡椒鹽',
];
function isStaple(name) {
  const n = String(name || '');
  return STAPLE_SEASONINGS.some(function (k) { return n.indexOf(k) >= 0; });
}

/* 單位正規化：把常見同義單位統一，提高「同單位」判斷成功率 */
function normUnit(u) {
  u = String(u || '').trim().toLowerCase();
  const map = { '公克': 'g', '克': 'g', '毫升': 'ml', 'cc': 'ml', '公升': 'l', '個': '顆' };
  return map[u] || u;
}
/* 庫存沒寫單位（純數字）時，視為與食譜同單位 */
function unitsComparable(invUnit, needUnit) {
  const a = normUnit(invUnit), b = normUnit(needUnit);
  return a === b || a === '';
}

/* 從自由文字拆出「數字 + 單位」：例如 "3顆"→{num:3,unit:"顆"}、"1, 1/6"→{num:1,unit:", 1/6"} */
function parseQtyUnit(s) {
  s = String(s == null ? '' : s).trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return { num: NaN, unit: '', raw: s };
  return { num: parseFloat(m[1]), unit: (m[2] || '').trim(), raw: s };
}

/* 合併所有食材（換算 + 加總）並比對庫存，回傳採購建議清單 */
function buildPurchaseItems() {
  const people = RecipeState.people;
  const invMap = inventoryById();
  const map = {};   // key -> { name, unit, itemId, needSum, needHasNum, texts[] }
  const order = [];

  Array.from(RecipeState.cart).forEach(function (id) {
    const d = RecipeState.details[id];
    if (!d) return;
    const baseNum = parseFloat(d.recipe.base_servings);
    const base = (baseNum && baseNum > 0) ? baseNum : 1;
    const factor = people / base;

    d.ingredients.forEach(function (ing) {
      const unit = ing.unit || '';
      const key = ing.ingredient_name + '\u0001' + unit;
      if (!map[key]) { map[key] = { name: ing.ingredient_name, unit: unit, itemId: '', needSum: 0, needHasNum: false, texts: [] }; order.push(key); }
      if (ing.item_id && !map[key].itemId) map[key].itemId = ing.item_id;
      const n = parseFloat(ing.qty);
      if (isNaN(n)) {
        const t = String(ing.qty || '').trim();
        if (t && map[key].texts.indexOf(t) < 0) map[key].texts.push(t);
      } else {
        map[key].needSum += n * factor;
        map[key].needHasNum = true;
      }
    });
  });

  return order.map(function (key) {
    const it = map[key];
    const inv = it.itemId ? invMap[it.itemId] : null;
    let status = 'no-data', haveRaw = '', buyNum = null;

    if (inv) {
      haveRaw = String(inv.qty == null ? '' : inv.qty).trim();
      const parsed = parseQtyUnit(haveRaw);
      const hasStock = haveRaw !== '' && haveRaw !== '0';

      if (isStaple(it.name) && hasStock) {
        status = 'staple';                          // 調味料且有庫存 → 家裡應該有
      } else if (it.needHasNum && !isNaN(parsed.num) && unitsComparable(parsed.unit, it.unit)) {
        buyNum = Math.round((it.needSum - parsed.num) * 100) / 100;   // 同單位才相減
        status = (buyNum > 0) ? 'buy' : 'enough';
      } else if (!hasStock) {
        status = 'buy';                             // 庫存 0/空 → 要買全部
        buyNum = it.needHasNum ? it.needSum : null;
      } else {
        status = 'check';                           // 有庫存但單位對不上/算不出 → 自行確認
      }
    }
    return {
      name: it.name, unit: it.unit, itemId: it.itemId,
      needSum: it.needSum, needHasNum: it.needHasNum, texts: it.texts,
      haveRaw: haveRaw, buyNum: buyNum, status: status,
    };
  });
}

/* 單列採購建議 HTML */
function purchaseRowHtml(it) {
  const u = it.unit ? ' ' + esc(it.unit) : '';
  let amount = '', note = '';

  if (it.status === 'buy') {
    if (it.buyNum != null) {
      amount = '買 ' + fmtNum(it.buyNum) + u;
      note = '需要 ' + fmtNum(it.needSum) + esc(it.unit) + '・庫存 ' + esc(it.haveRaw || '0');
    } else if (it.needHasNum) {
      amount = '買 ' + fmtNum(it.needSum) + u;
      note = '庫存 ' + esc(it.haveRaw || '0');
    }
    if (it.texts.length) amount += (amount ? '＋' : '') + esc(it.texts.join('、'));
    if (!amount) amount = esc(it.texts.join('、') || '適量');
  } else if (it.status === 'no-data') {
    if (it.needHasNum) amount = fmtNum(it.needSum) + u;
    if (it.texts.length) amount += (amount ? '＋' : '') + esc(it.texts.join('、'));
    if (!amount) amount = esc(it.texts.join('、') || '適量');
    note = '無庫存資料';
  } else if (it.status === 'enough') {
    amount = '庫存足夠';
    note = '需要 ' + fmtNum(it.needSum) + esc(it.unit) + '・庫存 ' + esc(it.haveRaw);
  } else if (it.status === 'check' || it.status === 'staple') {
    amount = it.needHasNum ? ('需要 ' + fmtNum(it.needSum) + u) : esc(it.texts.join('、') || '適量');
    note = '庫存 ' + esc(it.haveRaw) + (it.status === 'check' ? '，請自行確認' : '');
  }

  return '<div class="pc-row"><div class="pc-row-main"><span class="pc-row-name">' + esc(it.name) + '</span>' +
         '<span class="pc-row-amt num">' + amount + '</span></div>' +
         (note ? '<div class="pc-row-note">' + note + '</div>' : '') + '</div>';
}

function renderPurchase() {
  const people = RecipeState.people;

  const body = document.getElementById('purchase-body');
  const ids = Array.from(RecipeState.cart);
  if (!ids.length) { body.innerHTML = '<div class="rd-empty">採購單是空的</div>'; return; }

  // 包含的食譜（可移除）
  let html = '<div class="pc-recipes">';
  ids.forEach(function (id) {
    const d = RecipeState.details[id];
    if (!d) return;
    html += '<span class="pc-chip">' + esc(d.recipe.recipe_name) +
            '<button class="pc-chip-x" data-remove="' + escAttr(id) + '" aria-label="移除">✕</button></span>';
  });
  html += '</div>';

  const items = buildPurchaseItems();
  const buyItems  = items.filter(function (it) { return it.status === 'buy' || it.status === 'no-data'; });
  const haveItems = items.filter(function (it) { return it.status === 'enough' || it.status === 'check' || it.status === 'staple'; });

  html += '<h4 class="rd-h">🛒 建議採買</h4><div class="rd-ings">';
  if (buyItems.length) {
    buyItems.forEach(function (it) { html += purchaseRowHtml(it); });
  } else {
    html += '<div class="rd-empty">庫存都夠，不用買 🎉</div>';
  }
  html += '</div>';

  if (haveItems.length) {
    html += '<h4 class="rd-h rd-h-muted">✓ 家裡應該有（自行確認是否足夠）</h4><div class="rd-ings rd-ings-muted">';
    haveItems.forEach(function (it) { html += purchaseRowHtml(it); });
    html += '</div>';
  }

  body.innerHTML = html;

  Array.prototype.forEach.call(body.querySelectorAll('[data-remove]'), function (b) {
    b.addEventListener('click', function () {
      RecipeState.cart.delete(b.getAttribute('data-remove'));
      if (!RecipeState.cart.size) { toast('採購單已清空', 'info'); View.show('recipe'); return; }
      renderPurchase();
    });
  });
}

/* ====== 複製採購清單（合併加總成純文字）====== */
function fmtNum(n) {
  return String(Math.round(n * 100) / 100);
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(function () { toast('已複製採購清單', 'success'); })
      .catch(function () { fallbackCopy(text); });   // fallbackCopy 來自 app.js
  } else {
    fallbackCopy(text);
  }
}
function copyPurchaseList() {
  const ids = Array.from(RecipeState.cart);
  if (!ids.length) { toast('採購單是空的', 'info'); return; }

  const items = buildPurchaseItems().filter(function (it) { return it.status === 'buy' || it.status === 'no-data'; });
  const recipeNames = ids.map(function (id) { const d = RecipeState.details[id]; return d ? d.recipe.recipe_name : ''; }).filter(Boolean);

  const now = new Date();
  const lines = [(now.getMonth() + 1) + '/' + now.getDate() + ' 採購清單（' + RecipeState.people + ' 人份）', ''];

  if (!items.length) {
    lines.push('（庫存都夠，不用買）');
  } else {
    items.forEach(function (it) {
      let amt = '';
      if (it.status === 'buy' && it.buyNum != null) amt = fmtNum(it.buyNum) + (it.unit ? ' ' + it.unit : '');
      else if (it.needHasNum) amt = fmtNum(it.needSum) + (it.unit ? ' ' + it.unit : '');
      if (it.texts.length) amt += (amt ? '＋' : '') + it.texts.join('、');
      if (!amt) amt = it.texts.join('、') || '適量';
      lines.push('・' + it.name + ' ' + amt);
    });
  }

  lines.push('');
  lines.push('———');
  lines.push(recipeNames.join('、'));

  copyText(lines.join('\n').trim());
}

/* ====== 食譜搜尋 ====== */
let recipeSearchVisible = false;
function toggleRecipeSearch() {
  recipeSearchVisible = !recipeSearchVisible;
  const wrap = document.getElementById('recipe-search-wrap');
  wrap.style.display = recipeSearchVisible ? 'flex' : 'none';
  if (recipeSearchVisible) {
    document.getElementById('recipe-search').focus();
  } else {
    RecipeState.filterText = '';
    document.getElementById('recipe-search').value = '';
    renderRecipeList();
  }
}

/* ====== AI 找食譜 ====== */
function openAiModal() {
  openModal('✨ AI 找食譜', '');
  renderAiInput('');
}

function renderAiInput(errMsg) {
  document.getElementById('modal-body').innerHTML =
    '<div class="ai-box">' +
      '<label class="field full">想做什麼菜？' +
        '<input id="ai-query" type="text" placeholder="例如：打拋豬、麻婆豆腐" autocomplete="off" value="' + escAttr(RecipeState.aiQuery || '') + '"></label>' +
      (errMsg ? '<div class="ai-err">' + esc(errMsg) + '</div>' : '') +
      '<div class="modal-actions"><button class="btn btn-primary" id="ai-gen">✨ 生成食譜</button></div>' +
      '<p class="ai-tip">AI 會生成參考食譜，你確認後才會存進清單。</p>' +
    '</div>';
  const input = document.getElementById('ai-query');
  document.getElementById('ai-gen').addEventListener('click', aiGenerate);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') aiGenerate(); });
  input.focus();
}

function renderAiLoading(name) {
  document.getElementById('modal-body').innerHTML =
    '<div class="ai-loading"><div class="spinner"></div><p>正在為你想「' + esc(name) + '」的食譜…</p></div>';
}

function renderAiPreview(d) {
  let html = '<div class="ai-preview">';
  html += '<div class="ap-title">' + esc(d.recipe_name) + '</div>';
  html += '<div class="rd-meta">';
  if (d.cook_time)     html += '<span class="rd-chip">⏱ ' + esc(d.cook_time) + ' 分鐘</span>';
  if (d.base_servings) html += '<span class="rd-chip">👥 ' + esc(d.base_servings) + ' 人份</span>';
  html += '</div>';

  html += '<h4 class="rd-h">食材</h4><div class="rd-ings">';
  (d.ingredients || []).forEach(function (i) {
    html += '<div class="rd-ing"><span class="rd-ing-name">' + esc(i.ingredient_name) + '</span>' +
      '<span class="rd-ing-qty num">' + esc(i.qty) + (i.unit ? ' ' + esc(i.unit) : '') + '</span></div>';
  });
  html += '</div>';

  const steps = d.steps || [];
  if (steps.length) {
    html += '<h4 class="rd-h">做法</h4><div class="rd-steps">';
    steps.forEach(function (s, idx) {
      html += '<div class="rd-step"><span class="rd-step-no">' + (idx + 1) + '</span><span class="rd-step-tx">' + esc(s) + '</span></div>';
    });
    html += '</div>';
  }

  html += '<div class="ai-actions">' +
            '<button class="btn btn-ghost" id="ai-again">重新生成</button>' +
            '<button class="btn btn-primary" id="ai-save">存成我的食譜</button>' +
          '</div>';
  html += '</div>';

  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('ai-again').addEventListener('click', function () { renderAiInput(''); });
  document.getElementById('ai-save').addEventListener('click', aiSave);
}

async function aiGenerate() {
  const input = document.getElementById('ai-query');
  const name = (input ? input.value : '').trim();
  if (!name) { toast('請先輸入菜名', 'info'); return; }
  RecipeState.aiQuery = name;
  renderAiLoading(name);
  try {
    const draft = await InventoryApiClient.recipeAI(name);
    RecipeState.aiDraft = draft;
    renderAiPreview(draft);
  } catch (e) {
    renderAiInput(e && e.message ? e.message : 'AI 生成失敗，請再試一次');
  }
}

async function aiSave() {
  const d = RecipeState.aiDraft;
  if (!d) return;
  const btn = document.getElementById('ai-save');
  if (btn) { btn.disabled = true; btn.textContent = '儲存中…'; }
  try {
    await InventoryApiClient.recipeAISave(d, d.ingredients);
    closeModal();
    toast('已存成食譜 🎉', 'success');
    RecipeState.aiDraft = null;
    RecipeState.loaded = false;     // 強制重抓，讓新食譜出現
    await loadRecipes();
    View.show('recipe');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '存成我的食譜'; }
    toast('存檔失敗：' + (e && e.message ? e.message : ''), 'error');
  }
}

/* ====== 啟動：綁定導覽與按鈕 ====== */
window.addEventListener('load', function () {
  document.getElementById('nav-inventory').addEventListener('click', function () { View.show('inventory'); });
  document.getElementById('nav-recipe').addEventListener('click', openRecipeTab);

  document.getElementById('btn-recipe-search').addEventListener('click', toggleRecipeSearch);
  document.getElementById('btn-ai-recipe').addEventListener('click', openAiModal);
  document.getElementById('recipe-search').addEventListener('input', function (e) {
    RecipeState.filterText = e.target.value;
    renderRecipeList();
  });

  document.getElementById('btn-build-purchase').addEventListener('click', toggleSelectionMode);
  document.getElementById('sel-cancel').addEventListener('click', exitSelectionMode);
  document.getElementById('sel-build').addEventListener('click', buildFromSelection);

  document.getElementById('detail-back').addEventListener('click', function () { View.show('recipe'); });
  document.getElementById('detail-add').addEventListener('click', addCurrentDetailToCart);

  document.getElementById('purchase-back').addEventListener('click', function () { View.show('recipe'); });
  document.getElementById('purchase-copy').addEventListener('click', copyPurchaseList);

  const peopleInput = document.getElementById('people-input');
  // 點一下就全選，直接打字覆蓋（不用先刪掉原本的數字）
  peopleInput.addEventListener('focus', function () { this.select(); });
  // 打字當下：有效數字才更新清單；留空不打斷，讓你慢慢打
  peopleInput.addEventListener('input', function (e) {
    const n = parseInt(e.target.value, 10);
    if (!isNaN(n) && n >= 1) {
      RecipeState.people = n;
      renderPurchase();
    }
  });
  // 離開欄位：若留空或無效，還原成上一個有效人數
  peopleInput.addEventListener('blur', function (e) {
    const n = parseInt(e.target.value, 10);
    if (isNaN(n) || n < 1) {
      e.target.value = RecipeState.people;
    } else {
      RecipeState.people = n;
      e.target.value = n;          // 去掉前導 0 之類
      renderPurchase();
    }
  });
});
