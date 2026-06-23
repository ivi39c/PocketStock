/* =========================================================
 * store.js —【第 2 層】State Layer（資料狀態中心）
 *
 * 職責（像一塊「白板」）：所有人都看同一塊白板上的資料。
 *   - items / categories：庫存清單與分類
 *   - loading：是否正在跟後端要資料
 *   - selected：目前勾選了哪些項目（用 id 記）
 * 白板一有變動，就通知所有「訂閱者」(UI) 重畫。
 * =======================================================*/

const InventoryStore = {

  state: {
    items: [],
    categories: [],
    loading: false,
    selected: new Set(), // 存被勾選項目的 id
  },

  _subscribers: [],

  // UI 用這個「訂閱」白板變化
  subscribe(fn) {
    this._subscribers.push(fn);
  },

  _emit() {
    const self = this;
    this._subscribers.forEach(function (fn) { fn(self.state); });
  },

  // ── 改狀態的方法 ──
  setLoading(isLoading) {
    this.state.loading = isLoading;
    this._emit();
  },

  setData(items, categories) {
    this.state.items = items || [];
    this.state.categories = categories || [];
    // 清掉「已經不存在」的勾選（例如剛被刪除的項目）
    const liveIds = new Set(this.state.items.map(function (i) { return i.id; }));
    const kept = [];
    this.state.selected.forEach(function (id) { if (liveIds.has(id)) kept.push(id); });
    this.state.selected = new Set(kept);
    this._emit();
  },

  toggleSelect(id) {
    if (this.state.selected.has(id)) this.state.selected.delete(id);
    else this.state.selected.add(id);
    this._emit();
  },

  selectAll(on) {
    if (on) this.state.selected = new Set(this.state.items.map(function (i) { return i.id; }));
    else this.state.selected = new Set();
    this._emit();
  },

  clearSelection() {
    this.state.selected = new Set();
    this._emit();
  },

  getSelectedIds() {
    return Array.from(this.state.selected);
  },

  isSelected(id) {
    return this.state.selected.has(id);
  },

  getItem(id) {
    return this.state.items.filter(function (i) { return i.id === id; })[0] || null;
  },
};
