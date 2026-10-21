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
