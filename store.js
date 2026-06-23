/* =========================================================
 * store.js —【第 2 層】State Layer（資料狀態中心）
 *
 * 像一塊「白板」：放庫存清單、分類、是否載入中。
 * 另外幫忙記住「哪些分類被收合」（存在瀏覽器裡，重開也記得）。
 * =======================================================*/

const InventoryStore = {

  state: {
    items: [],
    categories: [],
    loading: false,
  },

  _subscribers: [],
  _collapsed: null, // Set：被收合的分類名稱

  subscribe(fn) { this._subscribers.push(fn); },

  _emit() {
    const s = this.state;
    this._subscribers.forEach(function (fn) { fn(s); });
  },

  setLoading(isLoading) { this.state.loading = isLoading; this._emit(); },

  setData(items, categories) {
    this.state.items = items || [];
    this.state.categories = categories || [];
    this._emit();
  },

  getItem(id) {
    return this.state.items.filter(function (i) { return i.id === id; })[0] || null;
  },

  // ── 分類收合狀態（存 localStorage）──
  _loadCollapsed() {
    if (this._collapsed) return this._collapsed;
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem('ps_collapsed') || '[]'); } catch (e) {}
    this._collapsed = new Set(arr);
    return this._collapsed;
  },
  isCollapsed(cat) { return this._loadCollapsed().has(cat); },
  toggleCollapsed(cat) {
    const s = this._loadCollapsed();
    if (s.has(cat)) s.delete(cat); else s.add(cat);
    try { localStorage.setItem('ps_collapsed', JSON.stringify(Array.from(s))); } catch (e) {}
  },
};
