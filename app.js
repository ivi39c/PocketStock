/* =========================================================
 * app.js —【第 3 層】UI Layer（畫面 + 事件）
 *
 * 主畫面就是庫存清單。頂欄 5 顆按鈕：說明 / 搜尋 / 複製 / 編輯 / 新增。
 * 點「編輯」→ 全部品項一起進入編輯狀態（名稱不可改）。
 * =======================================================*/

/* ====== 模組狀態 ====== */
let mode = 'view';                 // 'view'（瀏覽）/ 'edit'（編輯全部）
let filterText = '';               // 搜尋關鍵字
let searchVisible = false;
const deleteMarks = new Set();     // 編輯時被標記要刪除的 id

/* ====== 小工具 ====== */
let _toastTimer = null;
function toast(message, type) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast show ' + (type || 'info');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () { el.className = 'toast'; }, 3000);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
function setBusy(on) {
  Array.prototype.forEach.call(document.querySelectorAll('[data-lock]'), function (b) { b.disabled = on; });
}

/* ====== 畫面切換 ====== */
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
}
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
}

/* ====== 登入：Google Identity Services ====== */
function handleCredential(response) {
  InventoryApiClient.setIdToken(response.credential);
  showApp();
  loadList();
}
function initLogin() {
  if (!window.google || !google.accounts || !google.accounts.id) {
    setTimeout(initLogin, 300);
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredential,
    auto_select: true,
  });
  google.accounts.id.renderButton(
    document.getElementById('google-btn'),
    { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with' }
  );
}

/* ====== 錯誤處理行為 ====== */
InventoryApiClient.onAuthExpired = function () { toast('登入已過期，請重新登入', 'error'); showLogin(); };
InventoryApiClient.onForbidden   = function (msg) { toast(msg || '您的帳號沒有使用權限', 'error'); };
InventoryApiClient.onError       = function (msg) { toast(msg || '發生錯誤，請稍後再試', 'error'); };

/* ====== 錯誤橫幅 ====== */
function showBanner(msg) {
  document.getElementById('banner-msg').textContent = msg;
  document.getElementById('banner').style.display = 'flex';
}
function hideBanner() { document.getElementById('banner').style.display = 'none'; }

/* ====== 讀取清單 ====== */
async function loadList() {
  InventoryStore.setLoading(true);
  hideBanner();
  try {
    const data = await InventoryApiClient.list();
    InventoryStore.setData(data.items, data.categories);
    render();
  } catch (err) {
    showBanner('讀取失敗：' + (err.message || '未知錯誤') + (err.code ? '（' + err.code + '）' : ''));
  } finally {
    InventoryStore.setLoading(false);
  }
}

/* ====== 效期：顏色判斷 ====== */
function expiryInfo(expiry) {
  if (!expiry) return { cls: '', label: '' };
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(expiry);
  if (isNaN(d.getTime())) return { cls: '', label: String(expiry) };
  d.setHours(0, 0, 0, 0);
  const days = Math.round((d - t) / 86400000);
  if (days < 0) return { cls: 'exp-over', label: expiry };               // 已過期 → 紫
  if (days <= EXPIRY_SOON_DAYS) return { cls: 'exp-soon', label: expiry }; // 30 天內 → 紅
  return { cls: '', label: expiry };
}

/* ====== 庫存是否為 0（給「下次要買」判斷）====== */
function isZeroQty(q) {
  const s = String(q == null ? '' : q).trim();
  return s === '' || s === '0';
}

/* ====== 分組：下次要買 + 依分類（照選單列表的順序）====== */
function buildGroups(items) {
  const buy = items.filter(function (it) { return it.mustBuy && isZeroQty(it.qty); });
  const rest = items.filter(function (it) { return !(it.mustBuy && isZeroQty(it.qty)); });

  const map = {};
  rest.forEach(function (it) {
    const c = it.category || '未分類';
    (map[c] = map[c] || []).push(it);
  });

  const groups = [];
  const seen = {};
  InventoryStore.state.categories.forEach(function (c) {
    if (map[c]) { groups.push({ cat: c, items: map[c] }); seen[c] = true; }
  });
  Object.keys(map).forEach(function (c) {
    if (!seen[c]) groups.push({ cat: c, items: map[c] });
  });

  return { buy: buy, groups: groups };
}

/* ====== 渲染 ====== */
function renderCategoryOptions() {
  document.getElementById('category-options').innerHTML =
    InventoryStore.state.categories.map(function (c) {
      return '<option value="' + escAttr(c) + '"></option>';
    }).join('');
}

function rowHtml(it) {
  if (mode === 'edit') {
    const marked = deleteMarks.has(it.id);
    return (
      '<div class="item editing ' + (marked ? 'to-delete' : '') + '" data-id="' + escAttr(it.id) + '">' +
        '<div class="ie-top">' +
          '<span class="iname">' + esc(it.name) + '</span>' +
          '<div class="ie-top-right">' + // 新增容器
            '<label class="ie-mb"><input class="ie-mbx" type="checkbox" ' + (it.mustBuy ? 'checked' : '') + '>必買</label>' +
            '<button class="ie-del" data-trash>' + (marked ? '復原' : '刪除') + '</button>' +
          '</div>' + // 關閉容器
        '</div>' +
        '<div class="ie-fields">' +
          '<label class="ie-f ie-f-qty">數量<input class="ie-qty num" type="text" value="' + escAttr(it.qty) + '"></label>' +
          '<label class="ie-f ie-f-expiry">效期<input class="ie-expiry num" type="date" value="' + escAttr(it.expiry) + '"></label>' +
        '</div>' +
      '</div>'
    );
  }
  const e = expiryInfo(it.expiry);
  return (
    '<div class="item" data-id="' + escAttr(it.id) + '">' +
      '<span class="iname ' + e.cls + '">' + esc(it.name) +
        (e.label ? '<span class="idate ' + e.cls + '">' + esc(e.label) + '</span>' : '') +
      '</span>' +
      '<span class="iqty num">' + esc(it.qty) + '</span>' +
    '</div>'
  );
}

function groupHtml(title, items, pinned) {
  const collapsed = !pinned && InventoryStore.isCollapsed(title);
  const rows = items.map(rowHtml).join('');
  return (
    '<section class="group ' + (pinned ? 'group-buy' : '') + ' ' + (collapsed ? 'is-collapsed' : '') + '" data-cat="' + escAttr(title) + '">' +
      '<button class="group-head" ' + (pinned ? '' : 'data-toggle') + '>' +
        '<span class="gh-name">' + esc(title) + '</span>' +
        '<span class="gh-count">(' + items.length + ')</span>' +
        (pinned ? '' : '<span class="gh-chev">⌄</span>') +
      '</button>' +
      '<div class="group-items">' + rows + '</div>' +
    '</section>'
  );
}

function render() {
  renderCategoryOptions();

  const all = InventoryStore.state.items;
  const kw = filterText.trim().toLowerCase();
  const items = kw
    ? all.filter(function (it) {
        return (it.name || '').toLowerCase().indexOf(kw) >= 0 ||
               (it.category || '').toLowerCase().indexOf(kw) >= 0;
      })
    : all;

  document.getElementById('count-hint').textContent =
    !all.length ? '' : (kw ? items.length + ' / ' + all.length + ' 筆' : all.length + ' 筆');

  const listEl = document.getElementById('item-list');
  const emptyEl = document.getElementById('empty-hint');

  if (!items.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    syncEditChrome();
    return;
  }
  emptyEl.style.display = 'none';

  const g = buildGroups(items);
  let html = '';
  if (g.buy.length) html += groupHtml('⚠️ 下次要買', g.buy, true);
  g.groups.forEach(function (grp) { html += groupHtml(grp.cat, grp.items, false); });
  listEl.innerHTML = html;

  bindListEvents();
  syncEditChrome();
}

function bindListEvents() {
  const listEl = document.getElementById('item-list');

  // 分類收合（點標題）
  Array.prototype.forEach.call(listEl.querySelectorAll('.group-head[data-toggle]'), function (h) {
    h.addEventListener('click', function () {
      const sec = h.closest('.group');
      const cat = sec.getAttribute('data-cat');
      sec.classList.toggle('is-collapsed');
      InventoryStore.toggleCollapsed(cat);
    });
  });

  // 編輯模式：刪除／復原標記
  if (mode === 'edit') {
    Array.prototype.forEach.call(listEl.querySelectorAll('.ie-del'), function (b) {
      b.addEventListener('click', function () {
        const item = b.closest('.item');
        const id = item.getAttribute('data-id');
        if (deleteMarks.has(id)) { deleteMarks.delete(id); item.classList.remove('to-delete'); b.textContent = '刪除'; }
        else { deleteMarks.add(id); item.classList.add('to-delete'); b.textContent = '復原'; }
      });
    });
  }
}

/* 編輯模式下方工具列 + 頂欄按鈕狀態 */
function syncEditChrome() {
  document.getElementById('loading').style.display = InventoryStore.state.loading ? 'flex' : 'none';
  document.getElementById('edit-bar').style.display = mode === 'edit' ? 'flex' : 'none';
  document.getElementById('btn-edit').classList.toggle('active', mode === 'edit');
  document.body.classList.toggle('editing-mode', mode === 'edit');
}

/* ====== 編輯：進入 / 取消 / 儲存 ====== */
function enterEdit() {
  if (!InventoryStore.state.items.length) { toast('目前沒有可編輯的項目', 'info'); return; }
  mode = 'edit'; deleteMarks.clear(); render();
}
function cancelEdit() { mode = 'view'; deleteMarks.clear(); render(); }

async function saveEdit() {
  const updates = [];
  const deletes = [];
  Array.prototype.forEach.call(document.querySelectorAll('#item-list .item'), function (row) {
    const id = row.getAttribute('data-id');
    if (deleteMarks.has(id)) { deletes.push(id); return; }
    const orig = InventoryStore.getItem(id);
    if (!orig) return;
    const qty = row.querySelector('.ie-qty').value;
    const expiry = row.querySelector('.ie-expiry').value;
    const mustBuy = row.querySelector('.ie-mbx').checked;
    if (qty !== orig.qty || expiry !== (orig.expiry || '') || mustBuy !== orig.mustBuy) {
      updates.push({ id: id, qty: qty, expiry: expiry, mustBuy: mustBuy });
    }
  });

  if (!updates.length && !deletes.length) { mode = 'view'; render(); toast('沒有任何變更', 'info'); return; }

  setBusy(true);
  try {
    const res = await InventoryApiClient.commit({ updates: updates, deletes: deletes });
    let msg = '已更新 ' + (res.updated || 0) + ' 筆';
    if (res.deleted) msg += '、刪除 ' + res.deleted + ' 筆';
    toast(msg, 'success');
    mode = 'view'; deleteMarks.clear();
    await loadList();
  } catch (err) {
    // 已處理
  } finally {
    setBusy(false);
  }
}

/* ====== 複製整份清單（貼 LINE）====== */
function todayStr() {
  const d = new Date();
  const p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function expiryMark(it) {
  const c = expiryInfo(it.expiry).cls;
  if (c === 'exp-soon') return ' ❗';
  if (c === 'exp-over') return ' 💩';
  return '';
}
function copyList() {
  const all = InventoryStore.state.items;
  if (!all.length) { toast('沒有可複製的項目', 'info'); return; }
  const g = buildGroups(all);
  const lines = [todayStr() + ' 盤點表', ''];
  if (g.buy.length) {
    lines.push('【下次要買】');
    g.buy.forEach(function (it) { lines.push('・' + it.name + expiryMark(it)); });
    lines.push('');
  }
  g.groups.forEach(function (grp) {
    lines.push('【' + grp.cat + '】');
    grp.items.forEach(function (it) { lines.push('・' + it.name + (it.qty ? ' ' + it.qty : '') + expiryMark(it)); });
    lines.push('');
  });
  const text = lines.join('\n').trim();

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(function () { toast('已複製，可貼到 LINE', 'success'); })
      .catch(function () { fallbackCopy(text); });
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    toast('已複製，可貼到 LINE', 'success');
  } catch (e) { toast('複製失敗，請手動選取', 'error'); }
}

/* ====== 搜尋切換 ====== */
function toggleSearch() {
  searchVisible = !searchVisible;
  const wrap = document.getElementById('search-wrap');
  wrap.style.display = searchVisible ? 'flex' : 'none';
  if (searchVisible) { document.getElementById('search').focus(); }
  else { filterText = ''; document.getElementById('search').value = ''; render(); }
}

/* ====== 共用視窗（新增）====== */
function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal').style.display = 'block';
}
function closeModal() { document.getElementById('modal').style.display = 'none'; }

function openAddModal() {
  openModal('新增項目',
    '<label class="field full">名稱<input id="m-name" type="text" placeholder="例如：雞蛋" autocomplete="off"></label>' +
    '<div class="grid2">' +
      '<label class="field">數量<input id="m-qty" class="num" type="text" placeholder="例如：2顆 / 0" autocomplete="off"></label>' +
      '<label class="field">分類<input id="m-category" list="category-options" placeholder="選擇或輸入" autocomplete="off"></label>' +
    '</div>' +
    '<label class="field full">有效日期（選填）<input id="m-expiry" class="num" type="date"></label>' +
    '<div class="modal-actions"><button class="btn btn-primary" id="m-add" data-lock>新增</button></div>'
  );
  document.getElementById('m-add').addEventListener('click', submitAdd);
  document.getElementById('m-name').focus();
}

async function submitAdd() {
  const name = document.getElementById('m-name').value.trim();
  if (!name) { toast('請先填名稱', 'error'); return; }
  const qty = document.getElementById('m-qty').value.trim();
  const category = document.getElementById('m-category').value.trim();
  const expiry = document.getElementById('m-expiry').value;

  setBusy(true);
  try {
    const res = await InventoryApiClient.save({ name: name, qty: qty, category: category, expiry: expiry });
    toast('已新增：' + (res.name || name), 'success');
    closeModal();
    await loadList();
  } catch (err) {
    // 已處理（重複名稱會跳 toast）
  } finally {
    setBusy(false);
  }
}

/* ====== 使用說明 ====== */
function hrow(icon, title, desc) {
  return '<div class="help-row"><b><span class="material-symbols-outlined">' + icon + '</span>' + title + '</b><span>' + desc + '</span></div>';
}
function openHelp() {
  openModal('使用說明',
    '<div class="help">' +
      hrow('add', '新增', '新增一筆品項。') +
      hrow('edit', '編輯', '可改庫存、效期、勾「必買」，或刪除品項。改完按「✓ 儲存」、「✕ 取消」。') +
      hrow('content_copy', '複製', '複製整份盤點清單（自動帶當天日期），可貼到 LINE。') +
      hrow('search', '搜尋', '輸入品名快速找到項目。') +
      hrow('warning', '關於「必買」', '勾選後，當庫存變成 0，會自動移到最上方「下次要買」區。') +
      hrow('unfold_less', '分類收合', '點分類標題可收合／展開，狀態會記住。') +
      '<div class="help-row"><b><span class="material-symbols-outlined">palette</span>顏色說明</b>' +
        '<span><span class="exp-soon">● 紅字 / ❗ 30 天內即將到期</span>　<span class="exp-over">● 紫字 / 💩 已經過期</span></span></div>' +
    '</div>'
  );
}

/* ====== 啟動 ====== */
window.addEventListener('load', function () {
  initLogin();

  // 狀態一變就同步畫面（這條線之前漏接了 → 轉圈圈收不掉）
  InventoryStore.subscribe(syncEditChrome);

  document.getElementById('btn-help').addEventListener('click', openHelp);
  document.getElementById('btn-search').addEventListener('click', toggleSearch);
  document.getElementById('btn-copy').addEventListener('click', copyList);
  document.getElementById('btn-edit').addEventListener('click', function () {
    if (mode === 'edit') cancelEdit(); else enterEdit();
  });
  document.getElementById('btn-add').addEventListener('click', openAddModal);

  document.getElementById('edit-cancel').addEventListener('click', cancelEdit);
  document.getElementById('edit-save').addEventListener('click', saveEdit);

  document.getElementById('banner-retry').addEventListener('click', loadList);

  document.getElementById('search').addEventListener('input', function (e) {
    filterText = e.target.value; render();
  });

  // 視窗關閉（點背景或 ✕）
  Array.prototype.forEach.call(document.querySelectorAll('#modal [data-close]'), function (el) {
    el.addEventListener('click', closeModal);
  });

  showLogin();
});
