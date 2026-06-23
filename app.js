/* =========================================================
 * app.js —【第 3 層】UI Layer（畫面 + 事件）
 *
 * 把前兩層接起來：登入拿 idToken → 給 ApiClient →
 * 呼叫 list/save/commit → 資料進 Store → Store 通知 → 畫面更新。
 * =======================================================*/

/* ---------- 小工具：toast 提示 ---------- */
let _toastTimer = null;
function toast(message, type) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast show ' + (type || 'info');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () { el.className = 'toast'; }, 3200);
}

/* ---------- 畫面切換：登入 / 主程式 ---------- */
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
}
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
}

/* ---------- 登入：Google Identity Services ---------- */
function handleCredential(response) {
  // response.credential 就是 Google 給的 idToken（JWT）
  InventoryApiClient.setIdToken(response.credential);
  showApp();
  loadList();
}

function initLogin() {
  if (!window.google || !google.accounts || !google.accounts.id) {
    // GIS 還沒載入好，稍後再試
    setTimeout(initLogin, 300);
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredential,
    auto_select: true, // 回訪者自動登入，重新整理不用每次點
  });
  google.accounts.id.renderButton(
    document.getElementById('google-btn'),
    { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with' }
  );
}

/* ---------- 注入錯誤處理行為給 ApiClient ---------- */
InventoryApiClient.onAuthExpired = function () {
  toast('登入已過期，請重新登入', 'error');
  showLogin();
};
InventoryApiClient.onForbidden = function (msg) {
  toast(msg || '您的帳號沒有使用權限', 'error');
};
InventoryApiClient.onError = function (msg) {
  toast(msg || '發生錯誤，請稍後再試', 'error');
};

/* ---------- 讀取庫存清單 ---------- */
async function loadList() {
  InventoryStore.setLoading(true);
  try {
    const data = await InventoryApiClient.list();
    InventoryStore.setData(data.items, data.categories);
    renderList();
  } catch (err) {
    // 錯誤已由 ApiClient 的回呼處理（toast / 跳登入），這裡不重複
  } finally {
    InventoryStore.setLoading(false);
  }
}

/* ---------- 效期狀態：normal / soon / expired ---------- */
function expiryStatus(dateStr) {
  if (!dateStr) return { kind: 'none', label: '—' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { kind: 'none', label: dateStr };
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / 86400000);
  if (diffDays < 0)  return { kind: 'expired', label: dateStr + ' 💩' };
  if (diffDays <= EXPIRY_SOON_DAYS) return { kind: 'soon', label: dateStr + ' ❗️' };
  return { kind: 'normal', label: dateStr };
}

/* ---------- 渲染：分類下拉、庫存清單 ---------- */
function renderCategoryOptions() {
  const dl = document.getElementById('category-options');
  dl.innerHTML = InventoryStore.state.categories
    .map(function (c) { return '<option value="' + escapeAttr(c) + '"></option>'; })
    .join('');
}

function renderList() {
  renderCategoryOptions();

  const items = InventoryStore.state.items;
  const tbody = document.getElementById('item-rows');
  const empty = document.getElementById('empty-hint');

  if (!items.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    updateChrome(InventoryStore.state);
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = items.map(function (it) {
    const checked = InventoryStore.isSelected(it.id) ? 'checked' : '';
    const mb = it.mustBuy ? 'checked' : '';
    return (
      '<div class="row" data-id="' + escapeAttr(it.id) + '">' +
        '<label class="cell cell-check">' +
          '<input type="checkbox" class="row-check" ' + checked + '>' +
        '</label>' +
        '<div class="cell cell-name">' +
          '<span class="name">' + escapeHtml(it.name) + '</span>' +
          (it.mustBuy ? '<span class="badge badge-buy">必買</span>' : '') +
          '<span class="cat">' + escapeHtml(it.category || '') + '</span>' +
        '</div>' +
        '<div class="cell cell-qty">' +
          '<input type="text" class="in-qty num" value="' + escapeAttr(it.qty) + '" inputmode="text">' +
        '</div>' +
        '<div class="cell cell-expiry">' +
          '<input type="date" class="in-expiry num" value="' + escapeAttr(it.expiry) + '">' +
        '</div>' +
        '<label class="cell cell-mustbuy">' +
          '<input type="checkbox" class="in-mustbuy" ' + mb + '><span>必買</span>' +
        '</label>' +
      '</div>'
    );
  }).join('');

  // 綁定每列的勾選事件
  Array.prototype.forEach.call(tbody.querySelectorAll('.row-check'), function (cb) {
    cb.addEventListener('change', function () {
      const id = cb.closest('.row').getAttribute('data-id');
      InventoryStore.toggleSelect(id);
    });
  });

  updateChrome(InventoryStore.state);
}

/* ---------- 隨狀態變動而更新的零件（不重畫輸入框，避免清掉你打到一半的字）---------- */
function updateChrome(state) {
  // 載入遮罩
  document.getElementById('loading').style.display = state.loading ? 'flex' : 'none';

  // 列的勾選高亮 + checkbox 同步
  Array.prototype.forEach.call(document.querySelectorAll('.row'), function (row) {
    const id = row.getAttribute('data-id');
    const on = state.selected.has(id);
    row.classList.toggle('is-selected', on);
    const cb = row.querySelector('.row-check');
    if (cb) cb.checked = on;
  });

  // 批量操作列
  const count = state.selected.size;
  const bar = document.getElementById('batch-bar');
  bar.style.display = count > 0 ? 'flex' : 'none';
  document.getElementById('batch-count').textContent = count;

  // 全選 checkbox 狀態
  const selectAll = document.getElementById('select-all');
  if (selectAll) {
    const total = state.items.length;
    selectAll.checked = total > 0 && count === total;
    selectAll.indeterminate = count > 0 && count < total;
  }
}

/* ---------- 新增一筆 ---------- */
async function onCreate() {
  const name = document.getElementById('f-name').value.trim();
  const qty = document.getElementById('f-qty').value.trim();
  const category = document.getElementById('f-category').value.trim();
  const expiry = document.getElementById('f-expiry').value; // yyyy-mm-dd 或 ''

  if (!name) { toast('請先填名稱', 'error'); return; }

  setBusy(true);
  try {
    const res = await InventoryApiClient.save({ name: name, qty: qty, category: category, expiry: expiry });
    toast('已新增：' + (res.name || name), 'success');
    // 清空表單
    document.getElementById('f-name').value = '';
    document.getElementById('f-qty').value = '';
    document.getElementById('f-category').value = '';
    document.getElementById('f-expiry').value = '';
    await loadList();
  } catch (err) {
    // 已處理
  } finally {
    setBusy(false);
  }
}

/* ---------- 批量更新（把勾選列的目前數值送出）---------- */
async function onUpdateSelected() {
  const ids = InventoryStore.getSelectedIds();
  if (!ids.length) { toast('請先勾選要更新的項目', 'info'); return; }

  const updates = ids.map(function (id) {
    const row = document.querySelector('.row[data-id="' + cssEscape(id) + '"]');
    return {
      id: id,
      qty: row.querySelector('.in-qty').value,
      expiry: row.querySelector('.in-expiry').value,
      mustBuy: row.querySelector('.in-mustbuy').checked,
    };
  });

  setBusy(true);
  try {
    const res = await InventoryApiClient.commit({ updates: updates, deletes: [] });
    let msg = '已更新 ' + (res.updated || 0) + ' 筆';
    if (res.failed) msg += '（' + res.failed + ' 筆失敗）';
    toast(msg, 'success');
    InventoryStore.clearSelection();
    await loadList();
  } catch (err) {
    // 已處理
  } finally {
    setBusy(false);
  }
}

/* ---------- 批量刪除 ---------- */
async function onDeleteSelected() {
  const ids = InventoryStore.getSelectedIds();
  if (!ids.length) { toast('請先勾選要刪除的項目', 'info'); return; }
  if (!confirm('確定要刪除選取的 ' + ids.length + ' 筆嗎？此動作無法復原。')) return;

  setBusy(true);
  try {
    const res = await InventoryApiClient.commit({ updates: [], deletes: ids });
    toast('已刪除 ' + (res.deleted || 0) + ' 筆', 'success');
    InventoryStore.clearSelection();
    await loadList();
  } catch (err) {
    // 已處理
  } finally {
    setBusy(false);
  }
}

/* ---------- 讓主要按鈕在送出時暫時鎖住，避免重複點 ---------- */
function setBusy(on) {
  Array.prototype.forEach.call(document.querySelectorAll('[data-lock]'), function (b) {
    b.disabled = on;
  });
}

/* ---------- 跳脫字元，避免壞掉或 XSS ---------- */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
function cssEscape(s) {
  // 給 querySelector 用；id 形如 ID_00001，簡單轉義雙引號即可
  return String(s).replace(/"/g, '\\"');
}

/* ---------- 啟動 ---------- */
window.addEventListener('load', function () {
  initLogin();

  // Store 一變就更新畫面零件（不重畫輸入框）
  InventoryStore.subscribe(updateChrome);

  // 綁定按鈕
  document.getElementById('btn-create').addEventListener('click', onCreate);
  document.getElementById('btn-refresh').addEventListener('click', loadList);
  document.getElementById('btn-update').addEventListener('click', onUpdateSelected);
  document.getElementById('btn-delete').addEventListener('click', onDeleteSelected);
  document.getElementById('btn-clear-sel').addEventListener('click', function () {
    InventoryStore.clearSelection();
  });
  document.getElementById('select-all').addEventListener('change', function (e) {
    InventoryStore.selectAll(e.target.checked);
  });

  showLogin();
});
