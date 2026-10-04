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

/* =====================================================================
 * 專家名冊與個人化連結（取代原本的 makeLinks）
 * 用法：
 *   1. 先執行 setupRoster()  → 產生「專家名冊」工作表（含範例三列）
 *   2. 在名冊填入所有受訪專家，刪除範例列
 *   3. 把下方 BASE 改成你的 GitHub Pages 網址（結尾不要加斜線）
 *   4. 執行 makeLinks()      → 產生「個人化連結」工作表，可直接郵件合併
 * 本段只在編輯器中手動執行，不影響已部署的收件端，毋須重新部署。
 * ===================================================================== */

var BASE = 'https://YOUR-ACCOUNT.github.io/YOUR-REPO';
var ID_PATTERN = /^[A-Za-z][0-9]{2}$/;
var ROSTER = '專家名冊';
var LINKS = '個人化連結';
var EXT_OPTIONS = ['無', '氫能', 'CCUS'];

function setupRoster() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ROSTER);
  if (sh && sh.getLastRow() > 1) {
    throw new Error('「' + ROSTER + '」已有資料，為避免覆蓋，本函式不執行。');
  }
  sh = sh || ss.insertSheet(ROSTER);
  sh.clear();
  sh.appendRow(['受訪者代碼', '姓名', '服務單位', '職稱', 'Email', '擴充卷', '備註']);
  sh.appendRow(['H01', '（範例）王小明', '○○大學化工系', '教授', 'example1@example.com', '氫能', '']);
  sh.appendRow(['C01', '（範例）陳大華', '○○研究院', '研究員', 'example2@example.com', 'CCUS', '']);
  sh.appendRow(['E01', '（範例）林美玲', '○○顧問公司', '協理', 'example3@example.com', '無', '']);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#e9f1ee');
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(EXT_OPTIONS, true).setAllowInvalid(false).build();
  sh.getRange(2, 6, 200, 1).setDataValidation(rule);
  sh.autoResizeColumns(1, 7);
  SpreadsheetApp.getUi().alert('已建立「' + ROSTER + '」。請填入專家資料並刪除三列範例，再執行 makeLinks。');
}

function makeLinks() {
  if (BASE.indexOf('YOUR-') >= 0) {
    throw new Error('請先把程式最上方的 BASE 改成你的 GitHub Pages 網址。');
  }
  var base = BASE.replace(/\/+$/, '');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(ROSTER);
  if (!src) throw new Error('找不到「' + ROSTER + '」，請先執行 setupRoster。');

  var rows = src.getDataRange().getValues().slice(1)
    .filter(function (r) { return String(r[0]).trim() !== ''; });

  var seen = {}, problems = [];
  rows.forEach(function (r, i) {
    var code = String(r[0]).trim(), line = i + 2;
    if (!ID_PATTERN.test(code)) problems.push('第 ' + line + ' 列代碼「' + code + '」格式不符（應為一個英文字母加兩位數字）');
    if (seen[code.toUpperCase()]) problems.push('第 ' + line + ' 列代碼「' + code + '」與第 ' + seen[code.toUpperCase()] + ' 列重複');
    seen[code.toUpperCase()] = line;
    if (EXT_OPTIONS.indexOf(String(r[5]).trim()) < 0) problems.push('第 ' + line + ' 列「擴充卷」須為：無／氫能／CCUS');
    if (String(r[1]).indexOf('（範例）') === 0) problems.push('第 ' + line + ' 列仍是範例資料');
  });
  if (problems.length) {
    SpreadsheetApp.getUi().alert('名冊有以下問題，請修正後再執行：\n\n' + problems.join('\n'));
    return;
  }

  var out = ss.getSheetByName(LINKS) || ss.insertSheet(LINKS);
  out.clear();
  out.appendRow(['受訪者代碼', '姓名', '服務單位', '職稱', 'Email', '擴充卷',
                 '核心卷連結', '擴充卷連結', '入口頁連結']);
  rows.forEach(function (r) {
    var code = String(r[0]).trim().toUpperCase();
    var ext = String(r[5]).trim();
    var q = '?id=' + encodeURIComponent(code);
    var extLink = ext === '氫能' ? base + '/ext-h2.html' + q
                : ext === 'CCUS' ? base + '/ext-ccus.html' + q : '（不需填答）';
    out.appendRow([code, r[1], r[2], r[3], r[4], ext,
                   base + '/core.html' + q, extLink, base + '/index.html' + q]);
  });
  out.setFrozenRows(1);
  out.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#e9f1ee');
  out.autoResizeColumns(1, 9);
  SpreadsheetApp.getUi().alert('已產生 ' + rows.length + ' 位專家的個人化連結（「' + LINKS + '」工作表）。');
}
