/**
 * 減碳技術成熟度曲線專家問卷　收件端（Google Apps Script 網頁應用程式）
 * 財團法人中華經濟研究院
 *
 * ── 部署步驟 ────────────────────────────────────────────
 * 1. 建立一個新的 Google 試算表，命名如「專家問卷回覆資料」。
 * 2. 於該試算表點「擴充功能」→「Apps Script」，將本檔案全部內容貼入 Code.gs，存檔。
 * 3. 點右上「部署」→「新增部署作業」→ 類型選「網頁應用程式」。
 *      執行身分：我
 *      具有存取權的使用者：「所有人」          ← 務必選此項，否則受訪者無法送出
 *    按「部署」，複製產生的網址（格式為 https://script.google.com/macros/s/AKfycb.../exec）。
 * 4. 將該網址填入網站的 assets/config.js 之 endpoint 欄位。
 * 5. 先執行一次 testWrite（上方函式選單），確認試算表出現一列測試資料，再刪除該列。
 *
 * ── 注意事項 ────────────────────────────────────────────
 * ‧ 每次修改本程式後，須重新「部署」→「管理部署作業」→ 編輯 → 版本選「新版本」，
 *   否則線上仍為舊版。網址不會改變。
 * ‧ 同一受訪者重複送出會新增一列；分析時以同一代碼之最後一列為準。
 * ‧ 每份問卷各自寫入一個工作表（core / ext-h2 / ext-ccus），欄位會隨題目自動增加。
 * ────────────────────────────────────────────────────
 */

var FIXED = ['收件時間', '問卷', '受訪者代碼', '送出時間(ISO)', '瀏覽器'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    var raw = '';
    if (e && e.postData && e.postData.contents) raw = e.postData.contents;
    else if (e && e.parameter && e.parameter.payload) raw = e.parameter.payload;
    if (!raw) return out({ ok: false, error: 'no payload' });

    var p = JSON.parse(raw);
    var surveyId = String(p.survey || 'unknown').replace(/[^A-Za-z0-9_\-]/g, '');
    var answers = p.answers || {};

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(surveyId);
    if (!sh) {
      sh = ss.insertSheet(surveyId);
      sh.appendRow(FIXED);
      sh.setFrozenRows(1);
      sh.setFrozenColumns(3);
    }

    /* 讀取現有標題列，必要時新增欄位 */
    var lastCol = Math.max(sh.getLastColumn(), FIXED.length);
    var header = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    while (header.length && header[header.length - 1] === '') header.pop();
    if (!header.length) { header = FIXED.slice(); sh.getRange(1, 1, 1, header.length).setValues([header]); }

    var keys = Object.keys(answers).sort(naturalCompare);
    var added = [];
    keys.forEach(function (k) { if (header.indexOf(k) === -1) { header.push(k); added.push(k); } });
    if (added.length) sh.getRange(1, 1, 1, header.length).setValues([header]);

    /* 組列 */
    var row = new Array(header.length).fill('');
    row[0] = new Date();
    row[1] = p.surveyTitle || surveyId;
    row[2] = p.respondent || '';
    row[3] = p.submittedAt || '';
    row[4] = p.userAgent || '';
    keys.forEach(function (k) { row[header.indexOf(k)] = answers[k]; });
    sh.appendRow(row);

    return out({ ok: true, survey: surveyId, respondent: p.respondent || '', fields: keys.length });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function doGet() {
  return HtmlService.createHtmlOutput(
    '<p style="font-family:system-ui;padding:24px">收件端運作正常。本網址僅供問卷程式以 POST 方式送出資料使用。</p>'
  );
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* 讓 K2-Q3_1 之類的欄名依自然順序排列 */
function naturalCompare(a, b) {
  var ax = [], bx = [];
  String(a).replace(/(\d+)|(\D+)/g, function (_, d, s) { ax.push([d ? Number(d) : Infinity, s || '']); });
  String(b).replace(/(\d+)|(\D+)/g, function (_, d, s) { bx.push([d ? Number(d) : Infinity, s || '']); });
  while (ax.length && bx.length) {
    var an = ax.shift(), bn = bx.shift();
    var nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
    if (nn) return nn;
  }
  return ax.length - bx.length;
}

/* ── 測試用：執行一次確認可寫入試算表 ── */
function testWrite() {
  var fake = {
    postData: {
      contents: JSON.stringify({
        survey: 'core', surveyTitle: '核心卷（測試）', respondent: 'T99',
        submittedAt: new Date().toISOString(), userAgent: 'testWrite',
        answers: { B1: '1', B2: '2', 'K1-Q1': '5', 'K1-Q3_1': '3' }
      })
    }
  };
  var r = doPost(fake);
  Logger.log(r.getContent());
  Logger.log('若上方顯示 ok:true，請至試算表確認 core 工作表已新增一列，確認後刪除該列。');
}

/* ── 選用：產生個人化連結 ──
 * 將 BASE 改為 GitHub Pages 網址，CODES 改為實際代碼清單後執行。
 */
function makeLinks() {
  var BASE = 'https://YOUR-ACCOUNT.github.io/YOUR-REPO';
  var CODES = ['E01', 'E02', 'E03'];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('個人化連結') || ss.insertSheet('個人化連結');
  sh.clear();
  sh.appendRow(['受訪者代碼', '入口頁', '核心卷', '擴充卷（氫能）', '擴充卷（CCUS）']);
  CODES.forEach(function (c) {
    var q = '?id=' + encodeURIComponent(c);
    sh.appendRow([c, BASE + '/index.html' + q, BASE + '/core.html' + q,
                  BASE + '/ext-h2.html' + q, BASE + '/ext-ccus.html' + q]);
  });
  sh.autoResizeColumns(1, 5);
  Logger.log('已寫入「個人化連結」工作表。');
}
