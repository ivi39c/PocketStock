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

async function loadRecipes() {
  setRecipeLoading(true);
  try {
    const recipes = await InventoryApiClient.recipeList();
    RecipeState.recipes = recipes;
    RecipeState.loaded = true;
    renderRecipeList();
  } catch (err) {
    const empty = document.getElementById('recipe-empty');
    empty.textContent = '讀取食譜失敗：' + (err.message || '未知錯誤');
    empty.style.display = 'block';
    document.getElementById('recipe-list').innerHTML = '';
  } finally {
    setRecipeLoading(false);
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
  listEl.innerHTML = recipes.map(function (r) {
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

function renderPurchase() {
  const people = RecipeState.people;
  document.getElementById('people-input').value = people;

  const body = document.getElementById('purchase-body');
  const ids = Array.from(RecipeState.cart);
  if (!ids.length) { body.innerHTML = '<div class="rd-empty">採購單是空的</div>'; return; }

  let html = '';
  ids.forEach(function (id) {
    const d = RecipeState.details[id];
    if (!d) return;
    const r = d.recipe;
    const baseNum = parseFloat(r.base_servings);
    const base = (baseNum && baseNum > 0) ? baseNum : 1;   // 確實轉成數字，避免被當成 1
    const factor = people / base;
    const factorTxt = Math.round(factor * 100) / 100;

    html += '<div class="pc-card">';
    html += '<div class="pc-head"><span class="pc-name">' + esc(r.recipe_name) + '</span>' +
            '<button class="pc-remove" data-remove="' + escAttr(id) + '">移除</button></div>';
    html += '<div class="pc-note">原 ' + esc(base) + ' 人份 → ' + people + ' 人份（×' + factorTxt + '）</div>';
    html += '<div class="rd-ings">';
    if (d.ingredients.length) {
      d.ingredients.forEach(function (ing) {
        const q = scaleQty(ing.qty, factor);
        html += '<div class="rd-ing"><span class="rd-ing-name">' + esc(ing.ingredient_name) + '</span>' +
          '<span class="rd-ing-qty num">' + esc(q) + (ing.unit ? ' ' + esc(ing.unit) : '') + '</span></div>';
      });
    } else {
      html += '<div class="rd-empty">無食材</div>';
    }
    html += '</div></div>';
  });
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
  const people = RecipeState.people;

  const map = {};        // key -> { name, unit, sum, hasNum, texts[] }
  const order = [];      // 保留第一次出現的順序
  const recipeNames = [];

  ids.forEach(function (id) {
    const d = RecipeState.details[id];
    if (!d) return;
    recipeNames.push(d.recipe.recipe_name);
    const baseNum = parseFloat(d.recipe.base_servings);
    const base = (baseNum && baseNum > 0) ? baseNum : 1;
    const factor = people / base;

    d.ingredients.forEach(function (ing) {
      const unit = ing.unit || '';
      const key = ing.ingredient_name + '\u0001' + unit;
      if (!map[key]) { map[key] = { name: ing.ingredient_name, unit: unit, sum: 0, hasNum: false, texts: [] }; order.push(key); }
      const n = parseFloat(ing.qty);
      if (isNaN(n)) {
        const t = String(ing.qty || '').trim();   // 例如「適量」
        if (t && map[key].texts.indexOf(t) < 0) map[key].texts.push(t);
      } else {
        map[key].sum += n * factor;
        map[key].hasNum = true;
      }
    });
  });

  const now = new Date();
  const lines = [(now.getMonth() + 1) + '/' + now.getDate() + ' 採購清單（' + people + ' 人份）', ''];
  order.forEach(function (key) {
    const it = map[key];
    let qty = '';
    if (it.hasNum) qty = ' ' + fmtNum(it.sum) + (it.unit ? ' ' + it.unit : '');
    if (it.texts.length) qty += (it.hasNum ? '＋' : ' ') + it.texts.join('、');
    lines.push('・' + it.name + qty);
  });
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

/* ====== 啟動：綁定導覽與按鈕 ====== */
window.addEventListener('load', function () {
  document.getElementById('nav-inventory').addEventListener('click', function () { View.show('inventory'); });
  document.getElementById('nav-recipe').addEventListener('click', openRecipeTab);

  document.getElementById('btn-recipe-search').addEventListener('click', toggleRecipeSearch);
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
  document.getElementById('people-input').addEventListener('input', function (e) {
    const n = parseInt(e.target.value, 10);
    RecipeState.people = (isNaN(n) || n < 1) ? 1 : n;
    renderPurchase();
  });
});
