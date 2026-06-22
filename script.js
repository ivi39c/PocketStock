/* ============================================================
   KOTO Studio — script.js
   頁面切換、Header 捲動狀態、手機漢堡選單、表單驗證示意。
   ============================================================ */

(function () {
  'use strict';

  var pages   = document.querySelectorAll('.page');
  var navBtns = document.querySelectorAll('nav.main button');
  var hdr     = document.getElementById('hdr');
  var menu    = document.getElementById('menu');
  var burger  = document.getElementById('burger');

  /* ---- 頁面切換（單頁多視圖；正式上線可改為實體路由） ---- */
  function go(id) {
    pages.forEach(function (p) { p.classList.toggle('active', p.id === id); });
    navBtns.forEach(function (b) { b.classList.toggle('active', b.dataset.go === id); });
    if (menu) menu.classList.remove('open');
    if (burger) burger.setAttribute('aria-expanded', 'false');
    window.scrollTo({ top: 0, behavior: 'auto' });
    onScroll();
  }

  document.querySelectorAll('[data-go]').forEach(function (el) {
    el.addEventListener('click', function () { go(el.dataset.go); });
  });

  /* ---- Header 捲動狀態：> 24px 顯示底色與底線 ---- */
  function onScroll() {
    hdr.classList.toggle('scrolled', window.scrollY > 24);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- 手機漢堡選單 ---- */
  if (burger && menu) {
    burger.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---- 表單驗證示意（僅前端視覺；尚未串接送出） ---- */
  var form = document.getElementById('ksForm');
  var btn  = document.getElementById('submitBtn');
  if (form && btn) {
    btn.addEventListener('click', function () {
      var emailField = form.querySelectorAll('.field')[1];
      var email = emailField.querySelector('input').value.trim();
      var ok = /.+@.+\..+/.test(email);
      emailField.classList.toggle('error', !ok);
      if (ok) {
        form.style.display = 'none';
        document.getElementById('postSubmit').classList.add('show');
      } else {
        emailField.querySelector('input').focus();
      }
    });
  }
})();
