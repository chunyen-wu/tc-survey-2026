/* ============================================================
 * 全站設定檔　──　只需修改這一個檔案
 * ============================================================ */
window.CIER_CONFIG = {

  /* 【必填】Apps Script 網頁應用程式的網址。
   * 部署 backend/Code.gs 後取得，格式為
   * https://script.google.com/macros/s/AKfycb...../exec          */
  endpoint: "",

  /* 承辦人聯絡資訊，顯示於問卷說明與送出失敗時的指引 */
  contactName:  "許瓊文",
  contactPhone: "02-2735-6006 分機 6361",
  contactEmail: "hsucw0724@cier.edu.tw",

  /* 填答期限，顯示於問卷說明 */
  deadline: "民國115年11月22日",

  /* 受訪者代碼之格式檢查（預設：一個英文字母＋兩位數字，如 E01） */
  idPattern: "^[A-Za-z][0-9]{2}$",
  idHint: "代碼格式為一個英文字母加兩位數字，例如 E01。"
};
