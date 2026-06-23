/* =========================================================
 * api-client.js —【第 1 層】API Client
 *
 * 職責（像一個「專門跟後端講話的客服」）：
 *   - 把每次請求自動帶上 idToken
 *   - 用 text/plain 送出，避開瀏覽器 CORS 預檢（GAS 的老問題）
 *   - 只看 success / code / data 判斷結果（完全忽略 legacy 欄位）
 *   - BUSY（系統忙碌）自動重試一次
 *   - UNAUTHENTICATED / FORBIDDEN / 其他錯誤，分別交給上層處理
 * =======================================================*/

// 自訂錯誤：帶一個 code，方便上層判斷
class ApiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code;
  }
}

const InventoryApiClient = {

  _idToken: null,

  // 這些「回呼」由 app.js 注入，決定遇到各種錯誤時要做什麼
  onAuthExpired: function () {},     // 登入失效 → 跳登入
  onForbidden:   function (msg) {},  // 沒權限 → 顯示提示
  onError:       function (msg) {},  // 其他錯誤 → toast

  setIdToken(token) { this._idToken = token; },
  clearIdToken()    { this._idToken = null; },
  hasToken()        { return !!this._idToken; },

  // ── 三個對外方法（對應後端三個 action）──
  list() {
    return this._request({ action: 'list' });
  },

  save(item) {
    return this._request({
      action: 'save',
      data: {
        name:     item.name,
        qty:      item.qty,
        category: item.category,
        expiry:   item.expiry,
      },
    });
  },

  commit(changes) {
    return this._request({
      action:  'commit',
      updates: (changes && changes.updates) || [],
      deletes: (changes && changes.deletes) || [],
    });
  },

  // ── 核心：送出請求 + 處理回應（_isRetry 用來限制只重試一次）──
  async _request(payload, _isRetry) {
    if (!this._idToken) {
      this.onAuthExpired();
      throw new ApiError('UNAUTHENTICATED', '尚未登入');
    }

    const body = Object.assign({ idToken: this._idToken }, payload);
    let json;
    try {
      const resp = await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        // 重點：用 text/plain 當作「簡單請求」，瀏覽器才不會先打一個 OPTIONS 預檢
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow',
      });
      json = await resp.json();
    } catch (networkErr) {
      this.onError('連線失敗，請檢查網路後再試一次');
      throw new ApiError('NETWORK', String(networkErr));
    }

    // 只信任乾淨契約：success / code / data
    if (json && json.success === true) {
      return this._extractData(payload.action, json);
    }

    const code    = (json && json.code)    || 'SERVER_ERROR';
    const message = (json && json.message) || '發生未知錯誤';

    // BUSY → 等一下，自動重試一次
    if (code === 'BUSY' && !_isRetry) {
      await this._sleep(800);
      return this._request(payload, true);
    }

    // 登入問題 → 清掉 token，請上層跳登入
    if (code === 'UNAUTHENTICATED') {
      this.clearIdToken();
      this.onAuthExpired();
      throw new ApiError(code, message);
    }

    // 沒有權限
    if (code === 'FORBIDDEN') {
      this.onForbidden(message);
      throw new ApiError(code, message);
    }

    // 其他錯誤（含重試後仍 BUSY、VALIDATION_ERROR、DUPLICATE…）
    this.onError(message);
    throw new ApiError(code, message);
  },

  // 依 action 取出資料；list 這裡加了「保險」讓 legacy 開或關都讀得到
  _extractData(action, json) {
    const data = json.data;

    if (action === 'list') {
      let items, categories;
      if (Array.isArray(data)) {
        // 後端 legacy 開著時：data 會變成陣列、categories 在最外層
        items = data;
        categories = json.categories || [];
      } else {
        // 乾淨契約：data = { items, categories }
        items = (data && data.items) || [];
        categories = (data && data.categories) || [];
      }
      return {
        items: items.map(normalizeItem),
        categories: categories,
      };
    }

    // save  → { id, name }
    // commit→ { updated, deleted, failed, failedItems }
    return data || {};
  },

  _sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  },
};

/* 把後端的「中文鍵項目」轉成前端好用的「英文鍵項目」。
 * 這樣 UI 與 Store 全程只用同一種乾淨形狀，不依賴 API 的欄位寫法。*/
function normalizeItem(wire) {
  wire = wire || {};
  return {
    id:       wire[FIELDS.ID],
    name:     wire[FIELDS.NAME],
    qty:      wire[FIELDS.QTY],
    category: wire[FIELDS.CATEGORY],
    expiry:   wire[FIELDS.EXPIRY] || '',
    mustBuy:  wire[FIELDS.MUST_BUY] === true,
  };
}
