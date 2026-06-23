/* =========================================================
 * config.js — 設定檔（部署前請填好這兩個值）
 * =======================================================*/

// ① 你的 GAS 網頁應用程式網址（部署 → 管理部署 → 複製網址）
const GAS_WEB_APP_URL = '請填入你的_GAS_WEB_APP_URL';

// ② 你的 Google OAuth Client ID（要和後端 Config.gs 的 CLIENT_ID 一模一樣）
const GOOGLE_CLIENT_ID = '請填入你的_GOOGLE_OAUTH_CLIENT_ID';

/* API 契約裡「庫存項目」的欄位名稱（後端回傳用這些中文鍵）
 * 前端只透過這些常數取值，不假設欄位順序，也不碰試算表結構。*/
const FIELDS = {
  ID:       'ID',
  NAME:     '名稱',
  QTY:      '庫存量',
  CATEGORY: '分類',
  EXPIRY:   '有效日期',
  MUST_BUY: '必買',
};

// 效期「即將到期」的天數門檻（含當天）：30 天內顯示紅字
const EXPIRY_SOON_DAYS = 30;
