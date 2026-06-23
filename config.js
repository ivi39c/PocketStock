/* =========================================================
 * config.js — 設定檔（部署前請填好這兩個值）
 * =======================================================*/

// ① 你的 GAS 網頁應用程式網址（部署 → 管理部署 → 複製網址）
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwLBfR1xQmjlapP7wY77KdTaLK4bHcm0G12Bt9N4bsp5Ge0Y7gjtF0HNaL2HVP3a2DY/exec';

// ② 你的 Google OAuth Client ID（要和後端 Config.gs 的 CLIENT_ID 一模一樣）
const GOOGLE_CLIENT_ID = '336652370427-nhis1d8hn5917rae8nv5uqossne05mc3.apps.googleusercontent.com';

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
