/* ============================================================
 * 減碳技術成熟度曲線專家問卷　前端引擎
 * 依 window.SURVEY 之資料渲染問卷，並負責自動儲存、驗證與送出。
 * ============================================================ */
(function () {
  "use strict";

  var CFG = window.CIER_CONFIG || {};
  var S = window.SURVEY;
  if (!S) { document.body.innerHTML = "<p style='padding:40px'>問卷資料檔未載入。</p>"; return; }

  /* ---------- 共用選項 ---------- */
  var STAGE = [["1","創新萌芽期"],["2","期望膨脹期"],["3","幻滅低谷期（前段）"],
               ["4","幻滅低谷期（中段）"],["5","迭代爬升期（早段）"],["6","實質生產期"],["99","無法判斷"]];
  var TIME  = [["1","2 年以內"],["2","2 至 5 年"],["3","5 至 10 年"],["4","10 年以上"],["99","無法判斷"]];
  var PRIO5 = [["1","不應補助"],["2","低度優先"],["3","中度優先"],["4","高度優先"],["5","最高優先"],["99","無法判斷"]];
  var PRIO0 = [["0","不適合以碳費補助"],["1","不應補助"],["2","低度優先"],["3","中度優先"],
               ["4","高度優先"],["5","最高優先"],["99","無法判斷"]];
  var LIK5  = [["1","完全不合理"],["2","不太合理"],["3","尚可"],["4","合理"],["5","非常合理"],["99","無法判斷"]];
  var NEED5 = [["1","完全不必要"],["2","不太必要"],["3","尚可"],["4","必要"],["5","非常必要"],["99","無法判斷"]];
  var OPTSETS = { stage:STAGE, time:TIME, prio5:PRIO5, prio0:PRIO0, lik5:LIK5, need5:NEED5 };

  var CONS = [
    ["減碳潛力","權重 40%",["規模有限或屬輔助技術","數萬至十餘萬公噸 CO2e","數十萬公噸 CO2e","逾百萬公噸 CO2e"]],
    ["不可替代性","權重 25%",["有多項成熟替代技術","有替代技術但成本較高","替代技術有限且各有限制","為該減量路徑之必要環節，無替代方案"]],
    ["戰略重要性","權重 20%",["與我國產業或能源結構關聯薄弱","與單一產業有關聯","與二個以上碳費徵收對象產業有關聯","為國家淨零路徑或能源安全之關鍵環節"]],
    ["成本競爭力","權重 15%",["成本高於既有方案三倍以上且無明確下降路徑","成本高於既有方案，下降路徑不明","成本有明確下降路徑，十年內可望具競爭力","已具或接近成本競爭力"]]
  ];

  /* ---------- 小工具 ---------- */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function pad(n){ return String(n).padStart(2,"0"); }

  var REQUIRED = [];   /* {name, label, anchor} */
  var JUMPS = [];      /* {id, label} */

  /* ---------- 渲染：題型 ---------- */
  function radioList(name, opts) {
    var box = el("div","opts");
    opts.forEach(function (o) {
      var id = name + "__" + o[0];
      var lab = el("label","opt");
      lab.setAttribute("for", id);
      lab.innerHTML = '<input type="radio" id="'+id+'" name="'+name+'" value="'+esc(o[0])+'">'
                    + '<span><span class="k">'+esc(o[0])+'</span>'+esc(o[1])+'</span>';
      box.appendChild(lab);
    });
    return box;
  }

  function checkList(name, opts, max) {
    var box = el("div","opts");
    opts.forEach(function (o) {
      var id = name + "__" + o[0];
      var lab = el("label","opt");
      lab.setAttribute("for", id);
      lab.innerHTML = '<input type="checkbox" id="'+id+'" name="'+name+'" value="'+esc(o[0])+'">'
                    + '<span><span class="k">'+esc(o[0])+'</span>'+esc(o[1])+'</span>';
      box.appendChild(lab);
    });
    if (max) {
      box.addEventListener("change", function () {
        var checked = box.querySelectorAll('input:checked');
        if (checked.length > max) {
          event.target.checked = false;
          toast("本題最多勾選 " + max + " 項。");
        }
      });
    }
    return box;
  }

  function matrix4(base) {
    var wrap = el("div","matrix");
    CONS.forEach(function (c, ci) {
      var name = base + "_" + (ci + 1);
      var cells = "";
      c[2].forEach(function (def, si) {
        var id = name + "__" + (si + 1);
        cells += '<div class="cell"><label for="'+id+'">'
               + '<span class="score"><input type="radio" id="'+id+'" name="'+name+'" value="'+(si+1)+'">'
               + '<b>'+(si+1)+' 分</b></span>'
               + '<span class="def">'+esc(def)+'</span></label></div>';
      });
      var box = el("div","construct");
      box.innerHTML = '<div class="chead"><span class="cname">'+esc(c[0])+'</span>'
        + '<span class="cw">'+esc(c[1])+'</span></div>'
        + '<div class="scale">'+cells+'</div>'
        + '<div class="na"><label for="'+name+'__99">'
        + '<input type="radio" id="'+name+'__99" name="'+name+'" value="99"><span>99　無法判斷</span></label></div>';
      wrap.appendChild(box);
      REQUIRED.push({ name:name, label:base.replace(/_/g,"-") + "　" + c[0], anchor:base });
    });
    return wrap;
  }

  function scaleGrid(base, rows, colDesc) {
    var head = '<thead><tr><th></th>';
    ["1","2","3","4","5","99"].forEach(function (v) { head += '<th>'+v+'</th>'; });
    head += '</tr></thead>';
    var body = "<tbody>";
    rows.forEach(function (r, ri) {
      var name = base + "_" + (ri + 1);
      body += '<tr data-name="'+name+'"><th>'+esc(r)+'</th>';
      ["1","2","3","4","5","99"].forEach(function (v) {
        var id = name + "__" + v;
        body += '<td><label for="'+id+'"><input type="radio" id="'+id+'" name="'+name+'" value="'+v+'"></label></td>';
      });
      body += '</tr>';
      REQUIRED.push({ name:name, label:base.replace(/_/g,"-") + "　" + r, anchor:base });
    });
    body += "</tbody>";
    var w = el("div","sgrid");
    w.innerHTML = '<table class="sg">' + head + body + '</table>'
      + (colDesc ? '<p class="qhelp" style="margin-top:10px">'+colDesc+'</p>' : '');
    return w;
  }

  function question(q, anchorId) {
    var wrap = el("div","q");
    wrap.id = "q_" + q.id;
    wrap.appendChild(el("span","qnum", esc(q.id)));
    wrap.appendChild(el("p","qtitle", esc(q.title) + (q.required ? ' <span class="req">＊</span>' : "")));
    if (q.help) wrap.appendChild(el("p","qhelp", q.help));

    var name = q.id;
    if (q.type === "single") {
      var opts = q.optset ? OPTSETS[q.optset] : q.options;
      wrap.appendChild(radioList(name, opts));
      if (q.required) REQUIRED.push({ name:name, label:q.id, anchor:wrap.id });
    } else if (q.type === "multi") {
      wrap.appendChild(checkList(name, q.options, q.max));
      if (q.required) REQUIRED.push({ name:name, label:q.id, anchor:wrap.id, multi:true });
    } else if (q.type === "matrix4") {
      wrap.appendChild(matrix4(name));
    } else if (q.type === "scalegrid") {
      wrap.appendChild(scaleGrid(name, q.rows, q.colDesc));
    } else if (q.type === "textarea") {
      var ta = el("textarea");
      ta.id = name; ta.name = name;
      ta.placeholder = q.placeholder || "請於此處填寫……";
      wrap.appendChild(ta);
    } else if (q.type === "short") {
      var inp = el("input"); inp.type = "text"; inp.className = "short";
      inp.id = name; inp.name = name;
      inp.placeholder = q.placeholder || "";
      wrap.appendChild(inp);
      if (q.required) REQUIRED.push({ name:name, label:q.id, anchor:wrap.id, text:true });
    }
    return wrap;
  }

  /* ---------- 渲染：技術項目 ---------- */
  var KEY_Q = [
    { suf:"Q1", title:"本技術之「全球」Hype Cycle 階段", optset:"stage", type:"single", required:true },
    { suf:"Q2", title:"本技術之「我國在地」Hype Cycle 階段", optset:"stage", type:"single", required:true },
    { suf:"Q3", title:"技術潛力四構面評分", type:"matrix4",
      help:"本研究將依既定權重加總後換算為技術潛力級別，故請就各構面分別評分，毋須直接評定級別。各構面之級距定義列於選項內。" },
    { suf:"Q4", title:"本技術自現階段發展至我國商業化規模應用之預估時程", optset:"time", type:"single", required:true },
    { suf:"Q5", title:"本技術之碳費補助優先順序", optset:"prio0", type:"single", required:true,
      help:"請綜合考量減碳潛力、在地產業關聯性，以及<b>附加性</b>——即若無公共資金介入，該技術之發展是否難以達成預期進度。若您認為本技術不宜以碳費補助（例如宜由碳權市場、產業政策或其他工具處理），請選 <b>0</b>。" },
    { suf:"Q6", title:"開放性意見（非必填）", type:"textarea",
      help:"若您認為上開證據摘要有所遺漏或錯誤、或就本技術之介入策略有其他建議，敬請補充。" }
  ];
  var GEN_Q = [
    { suf:"Q1", title:"本技術之「全球」Hype Cycle 階段", optset:"stage", type:"single", required:true },
    { suf:"Q2", title:"本技術之「我國在地」Hype Cycle 階段", optset:"stage", type:"single", required:true },
    { suf:"Q3", title:"本技術之碳費補助優先順序", optset:"prio0", type:"single", required:true }
  ];

  var GTRL = { "3-4":["第 3 至 4 級","小型原型階段"], "5-6":["第 5 至 6 級","大型原型階段"],
    "7-8":["第 7 至 8 級","示範階段"], "8-9":["第 8 至 9 級","示範至早期採用階段"],
    "9-10":["第 9 至 10 級","早期採用階段"], "11":["第 11 級","成熟階段"] };
  var LTRL = { 1:"無在地產業背景", 2:"政策列入但無研究啟動", 3:"有研究啟動，屬產學合作層級",
    4:"試驗設施規劃中或實驗室規模", 5:"試驗設施運轉，小規模驗證", 6:"商業前示範，中規模驗證",
    7:"商業前示範，大規模驗證", 8:"首套商業規模運轉（FOAK）", 9:"商業規模成熟" };
  function trlBox(it) {
    var g = GTRL[String(it.gtrl).trim()] || [String(it.gtrl), ""];
    var l = parseInt(it.ltrl, 10);
    var d = el("div","trlbox");
    d.innerHTML =
      '<div class="trlcell"><span class="tlab">全球技術成熟度</span>'
      + '<b class="tval">' + esc(g[0]) + '</b><span class="tdef">' + esc(g[1]) + '</span>'
      + '<span class="tsrc">引用 IEA 評估結果，量表為 1 至 11 級</span></div>'
      + '<div class="trlcell local"><span class="tlab">我國在地技術成熟度</span>'
      + '<b class="tval">第 ' + l + ' 級</b><span class="tdef">' + esc(LTRL[l] || "") + '</span>'
      + '<span class="tsrc">本研究 1 至 9 級操作定義，請參見頁首對照表</span></div>';
    return d;
  }

  function qlead(n) {
    return el("div","qlead", "<span>以下 " + n + " 題請依您的專業判斷作答</span>");
  }

  function keyItem(it, idx, total) {
    var sec = el("section","item");
    sec.id = "item_" + it.id;
    JUMPS.push({ id:sec.id, label:it.id + "　" + it.name });
    var ih = el("div","ihead");
    ih.appendChild(el("p","eyebrow", esc(it.code || it.id) + "　項目 " + idx + " ／ " + total));
    ih.appendChild(el("h3","iname", esc(it.name)));
    ih.appendChild(el("p","ename", esc(it.en || "")));
    sec.appendChild(ih);
    sec.appendChild(trlBox(it));

    var d1 = el("details","fold");
    d1.innerHTML = '<summary>技術說明</summary><div class="fold-body prose"><p>'
      + esc(it.desc) + "</p></div>";
    sec.appendChild(d1);

    var b2 = el("div","block prose");
    b2.innerHTML = '<h4>國際發展現況</h4><p>'
      + esc(it.intl) + "</p>";
    sec.appendChild(b2);

    var b3 = el("div","block prose");
    var locHtml = (it.local || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
    b3.innerHTML = '<h4>我國在地發展事實</h4>'
      + locHtml
      + (it.note ? '<p class="judgenote"><b>評定說明　</b>' + esc(it.note) + "</p>" : "");
    sec.appendChild(b3);

    var d2 = el("details","fold");
    var rows = (it.ev || []).map(function (e) {
      return "<tr><th>" + esc(e[0]) + "</th><td>" + esc(e[1]) + "</td></tr>";
    }).join("");
    d2.innerHTML = '<summary>研究團隊所蒐集之五維證據摘要與判定結果</summary><div class="fold-body">'
      + "<div class='tablewrap'><table class='ev'>"
      + "<thead><tr><th>證據維度</th><th>摘要</th></tr></thead><tbody>" + rows + "</tbody></table></div>"
      + ((it.teamG || it.teamL)
          ? '<p class="judgenote"><b>研究團隊之判定　</b>全球階段：' + esc(it.teamG || "—")
            + "；我國在地階段：" + esc(it.teamL || "—")
            + "。此一資訊僅供參考，請依您的專業判斷作答，毋須與之一致。</p>"
          : "")
      + "</div>";
    sec.appendChild(d2);

    sec.appendChild(qlead(KEY_Q.length));
    KEY_Q.forEach(function (t) {
      var q = { id: it.id + "-" + t.suf, title:t.title, type:t.type, optset:t.optset,
                required:t.required, help:t.help };
      sec.appendChild(question(q, sec.id));
    });
    return sec;
  }

  function genItem(it, idx, total) {
    var sec = el("section","item");
    sec.id = "item_" + it.id;
    var ih = el("div","ihead");
    ih.appendChild(el("p","eyebrow", esc(it.code || it.id) + "　項目 " + idx + " ／ " + total));
    ih.appendChild(el("h3","iname", esc(it.name)));
    ih.appendChild(el("p","ename", esc(it.en || "")));
    sec.appendChild(ih);
    sec.appendChild(trlBox(it));

    var b1 = el("div","block prose");
    b1.innerHTML = "<h4>在地發展事證</h4><p>" + esc(it.lr || "查無在地公開資訊") + "</p>";
    sec.appendChild(b1);

    var dg = el("details","fold");
    var rows = (it.ev || []).map(function (e) {
      return "<tr><th>" + esc(e[0]) + "</th><td>" + esc(e[1]) + "</td></tr>";
    }).join("");
    dg.innerHTML = '<summary>研究團隊所蒐集之五維證據摘要</summary><div class="fold-body">'
      + "<div class='tablewrap'><table class='ev'>"
      + "<thead><tr><th>證據維度</th><th>摘要</th></tr></thead><tbody>" + rows + "</tbody></table></div></div>";
    sec.appendChild(dg);

    sec.appendChild(qlead(GEN_Q.length));
    GEN_Q.forEach(function (t) {
      sec.appendChild(question({ id: it.id + "-" + t.suf, title:t.title, type:t.type,
                                 optset:t.optset, required:t.required }, sec.id));
    });
    return sec;
  }

  /* ---------- Hype Cycle 六階段空白示意圖（不標示任何技術項目） ---------- */
  var HCFIG = "<figure class='hcfig'><svg viewBox='0 0 720 232' role='img' aria-labelledby='hcT' xmlns='http://www.w3.org/2000/svg'><title id='hcT'>技術成熟度曲線六階段示意圖</title><line x1='52' y1='180' x2='700' y2='180' stroke='var(--rule)' stroke-width='1'/><path d='M 52.0 137.9 L 57.4 137.5 L 62.8 137.0 L 68.2 136.4 L 73.6 135.5 L 79.0 134.5 L 84.4 133.3 L 89.8 131.8 L 95.2 129.9 L 100.6 127.8 L 106.0 125.2 L 111.4 122.2 L 116.8 118.7 L 122.2 114.8 L 127.6 110.4 L 133.0 105.4 L 138.4 100.0 L 143.8 94.2 L 149.2 87.9 L 154.6 81.3 L 160.0 74.5 L 165.4 67.6 L 170.8 60.6 L 176.2 53.9 L 181.6 47.4 L 187.0 41.3 L 192.4 35.9 L 197.8 31.1 L 203.2 27.3 L 208.6 24.4 L 214.0 22.7 L 219.4 22.0 L 224.8 22.5 L 230.2 24.2 L 235.6 27.0 L 241.0 30.8 L 246.4 35.7 L 251.8 41.5 L 257.2 48.0 L 262.6 55.1 L 268.0 62.8 L 273.4 70.7 L 278.8 79.0 L 284.2 87.3 L 289.6 95.5 L 295.0 103.7 L 300.4 111.6 L 305.8 119.2 L 311.2 126.4 L 316.6 133.2 L 322.0 139.5 L 327.4 145.4 L 332.8 150.6 L 338.2 155.4 L 343.6 159.5 L 349.0 163.1 L 354.4 166.0 L 359.8 168.4 L 365.2 170.2 L 370.6 171.3 L 376.0 171.9 L 381.4 172.0 L 386.8 171.5 L 392.2 170.6 L 397.6 169.2 L 403.0 167.4 L 408.4 165.3 L 413.8 162.9 L 419.2 160.2 L 424.6 157.4 L 430.0 154.5 L 435.4 151.4 L 440.8 148.4 L 446.2 145.3 L 451.6 142.3 L 457.0 139.3 L 462.4 136.4 L 467.8 133.6 L 473.2 130.8 L 478.6 128.1 L 484.0 125.6 L 489.4 123.1 L 494.8 120.6 L 500.2 118.2 L 505.6 115.9 L 511.0 113.6 L 516.4 111.3 L 521.8 109.0 L 527.2 106.8 L 532.6 104.6 L 538.0 102.4 L 543.4 100.2 L 548.8 98.0 L 554.2 95.9 L 559.6 93.9 L 565.0 91.8 L 570.4 89.9 L 575.8 88.0 L 581.2 86.1 L 586.6 84.4 L 592.0 82.7 L 597.4 81.1 L 602.8 79.6 L 608.2 78.2 L 613.6 76.8 L 619.0 75.6 L 624.4 74.4 L 629.8 73.3 L 635.2 72.3 L 640.6 71.4 L 646.0 70.5 L 651.4 69.7 L 656.8 69.0 L 662.2 68.3 L 667.6 67.7 L 673.0 67.2 L 678.4 66.6 L 683.8 66.2 L 689.2 65.7 L 694.6 65.4 L 700.0 65.0' fill='none' stroke='var(--accent)' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/><line x1='90.9' y1='136.4' x2='90.9' y2='180' stroke='var(--rule)' stroke-width='1' stroke-dasharray='2 3'/><circle cx='90.9' cy='131.4' r='3.2' fill='var(--paper)' stroke='var(--accent)' stroke-width='1.6'/><text x='90.9' y='197' text-anchor='middle' font-size='13.5' fill='var(--ink-soft)'>創新萌芽期</text><line x1='207.5' y1='29.9' x2='207.5' y2='180' stroke='var(--rule)' stroke-width='1' stroke-dasharray='2 3'/><circle cx='207.5' cy='24.9' r='3.2' fill='var(--paper)' stroke='var(--accent)' stroke-width='1.6'/><text x='207.5' y='197' text-anchor='middle' font-size='13.5' fill='var(--ink-soft)'>期望膨脹期</text><line x1='311.2' y1='131.4' x2='311.2' y2='180' stroke='var(--rule)' stroke-width='1' stroke-dasharray='2 3'/><circle cx='311.2' cy='126.4' r='3.2' fill='var(--paper)' stroke='var(--accent)' stroke-width='1.6'/><text x='311.2' y='197' text-anchor='middle' font-size='13.5' fill='var(--ink-soft)'>幻滅低谷期</text><text x='311.2' y='215' text-anchor='middle' font-size='13.5' fill='var(--ink-soft)'>（前段）</text><line x1='424.6' y1='162.4' x2='424.6' y2='180' stroke='var(--rule)' stroke-width='1' stroke-dasharray='2 3'/><circle cx='424.6' cy='157.4' r='3.2' fill='var(--paper)' stroke='var(--accent)' stroke-width='1.6'/><text x='424.6' y='197' text-anchor='middle' font-size='13.5' fill='var(--ink-soft)'>幻滅低谷期</text><text x='424.6' y='215' text-anchor='middle' font-size='13.5' fill='var(--ink-soft)'>（中段）</text><line x1='551.0' y1='102.2' x2='551.0' y2='180' stroke='var(--rule)' stroke-width='1' stroke-dasharray='2 3'/><circle cx='551.0' cy='97.2' r='3.2' fill='var(--paper)' stroke='var(--accent)' stroke-width='1.6'/><text x='551.0' y='197' text-anchor='middle' font-size='13.5' fill='var(--ink-soft)'>迭代爬升期</text><text x='551.0' y='215' text-anchor='middle' font-size='13.5' fill='var(--ink-soft)'>（早段）</text><line x1='664.4' y1='73.1' x2='664.4' y2='180' stroke='var(--rule)' stroke-width='1' stroke-dasharray='2 3'/><circle cx='664.4' cy='68.1' r='3.2' fill='var(--paper)' stroke='var(--accent)' stroke-width='1.6'/><text x='664.4' y='197' text-anchor='middle' font-size='13.5' fill='var(--ink-soft)'>實質生產期</text><text x='18' y='101' text-anchor='middle' font-size='13' fill='var(--ink-faint)' transform='rotate(-90 18 101)'>市場期望</text></svg><figcaption>技術成熟度曲線之六個階段。本圖僅說明階段順序與曲線形狀，未標示任何技術項目之位置。</figcaption></figure>";
  function insertHypeFig(root) {
    var hs = root.getElementsByTagName("h3");
    for (var i = 0; i < hs.length; i++) {
      if (hs[i].textContent.indexOf("Hype Cycle") >= 0) {
        var w = document.createElement("div");
        w.innerHTML = HCFIG;
        var fig = w.firstChild;
        if (hs[i].nextSibling) { hs[i].parentNode.insertBefore(fig, hs[i].nextSibling); }
        else { hs[i].parentNode.appendChild(fig); }
        return;
      }
    }
  }

  /* ---------- 建構頁面 ---------- */
  var root = document.getElementById("app");

  var mast = el("header","mast");
  mast.innerHTML =
    '<p class="org">環境部氣候變遷署　114年度補助溫室氣體減量管理及氣候變遷調適研究發展計畫</p>'
    + '<h1>減碳技術成熟度曲線構建與碳費投資成效分析</h1>'
    + '<p class="sub">專家問卷　' + esc(S.title) + (S.subtitle ? "　" + esc(S.subtitle) : "") + '</p>'
    + '<div class="who"><span class="chip">受訪者代碼　<b id="ridChip">—</b></span>'
    + '<span class="chip">執行單位　財團法人中華經濟研究院</span>'
    + '<span class="chip">填答期限　' + esc(CFG.deadline || "") + '</span></div>';
  root.appendChild(mast);

  if (S.intro) {
    var intro = el("div","intro prose");
    intro.innerHTML = S.intro;
    root.appendChild(intro);
  }

  /* 空白版技術成熟度曲線：固定顯示，不收於摺疊區 */
  var hcw = el("div", "hcwrap");
  hcw.innerHTML = HCFIG;
  root.appendChild(hcw);

  if (S.reference) {
    var d = el("details","ref");
    d.innerHTML = '<summary>' + esc(S.reference.title) + '</summary><div class="ref-body">'
      + S.reference.html + '</div>';
    root.appendChild(d);
  }

  (S.sections || []).forEach(function (sc) {
    if (sc.type === "section") {
      var sec = el("section","sect");
      sec.id = "sec_" + sc.id;
      JUMPS.push({ id:sec.id, label:sc.title });
      var h = el("div","sect-head");
      h.innerHTML = "<h2>" + esc(sc.title) + "</h2>" + (sc.note ? "<p>" + sc.note + "</p>" : "");
      sec.appendChild(h);
      if (sc.html) { var ex = el("div","secextra"); ex.innerHTML = sc.html; insertHypeFig(ex); sec.appendChild(ex); }
      (sc.questions || []).forEach(function (q) { sec.appendChild(question(q, sec.id)); });
      root.appendChild(sec);
    } else if (sc.type === "items") {
      var head = el("div","sect-head");
      head.id = "sec_" + sc.id;
      head.innerHTML = "<h2>" + esc(sc.title) + "</h2>" + (sc.note ? "<p>" + sc.note + "</p>" : "");
      var holder = el("section","sect");
      holder.appendChild(head);
      root.appendChild(holder);
      JUMPS.push({ id:head.id, label:sc.title });
      var n = sc.items.length;
      sc.items.forEach(function (it, i) {
        root.appendChild(sc.kind === "gen" ? genItem(it, i+1, n) : keyItem(it, i+1, n));
      });
    }
  });

  /* 送出區 */
  var sub = el("div","submit");
  sub.innerHTML =
    "<h2>送出問卷</h2>"
    + "<p>您的作答已隨時自動儲存於本機瀏覽器，可安心關閉頁面後再回來續填。確認填答完成後，請按下方按鈕送出。"
    + "送出後若需修正，可重新開啟同一連結修改並再次送出，本研究以最後一次送出之內容為準。</p>"
    + '<div class="btnrow">'
    + '<button type="button" class="primary" id="btnSubmit">送出問卷</button>'
    + '<button type="button" class="ghost" id="btnBackup">下載作答備份</button>'
    + "</div>"
    + '<div class="result" id="res"></div>'
    + '<div class="contact"><p>填答期限　' + esc(CFG.deadline || "") + '</p>'
    + '<p>如有任何疑問，請聯繫　' + esc(CFG.contactName || "") + '</p>'
    + '<p>電話 ' + esc(CFG.contactPhone || "") + '　電子郵件 ' + esc(CFG.contactEmail || "") + '</p></div>';
  root.appendChild(sub);

  /* 底部固定列 */
  var bar = el("div","bar");
  var jumpOpts = JUMPS.map(function (j) {
    return '<option value="' + j.id + '">' + esc(j.label) + "</option>";
  }).join("");
  bar.innerHTML = '<div class="barin">'
    + '<span class="count"><span id="done">0</span> / <span id="total">0</span> 必答題已完成</span>'
    + '<div class="track"><div class="fill" id="fill"></div></div>'
    + '<select class="jump" id="jump" aria-label="跳至段落"><option value="">跳至段落…</option>' + jumpOpts + "</select>"
    + '<span class="status" id="st">尚未儲存</span>'
    + "</div>";
  document.body.appendChild(bar);

  /* ---------- 受訪者代碼 ---------- */
  var ridChip = document.getElementById("ridChip");
  var idInput = document.getElementById("RID");
  function currentId() {
    var v = idInput ? idInput.value.trim().toUpperCase() : "";
    return v;
  }
  var urlId = "";
  try {
    urlId = (new URLSearchParams(location.search).get("id") || "").trim().toUpperCase();
    if (urlId && idInput) { idInput.value = urlId; }
  } catch (e) {}
  function syncChip() {
    var v = currentId();
    ridChip.textContent = v || "—";
    var re = new RegExp(CFG.idPattern || "^[A-Za-z][0-9]{2}$");
    ridChip.parentNode.classList.toggle("miss", !!v && !re.test(v));
  }

  /* ---------- 儲存與進度 ---------- */
  var BASEKEY = "cier_hype_" + S.id;
  var KEY = BASEKEY + (urlId ? "_" + urlId : "");
  var st = document.getElementById("st");
  var fill = document.getElementById("fill");
  var doneEl = document.getElementById("done");
  document.getElementById("total").textContent = REQUIRED.length;

  function collect() {
    var d = {};
    document.querySelectorAll('input[type=radio]:checked').forEach(function (r) { d[r.name] = r.value; });
    var multi = {};
    document.querySelectorAll('input[type=checkbox]:checked').forEach(function (c) {
      (multi[c.name] = multi[c.name] || []).push(c.value);
    });
    Object.keys(multi).forEach(function (k) { d[k] = multi[k].join("|"); });
    document.querySelectorAll("textarea, input.short").forEach(function (t) {
      if (t.value.trim()) d[t.name || t.id] = t.value.trim();
    });
    return d;
  }
  function answeredCount() {
    var d = collect(), n = 0;
    REQUIRED.forEach(function (r) {
      if (r.multi) { if (d[r.name]) n++; }
      else if (r.text) { if (d[r.name]) n++; }
      else if (d[r.name]) n++;
    });
    return n;
  }
  function progress() {
    var n = answeredCount(), t = REQUIRED.length;
    doneEl.textContent = n;
    fill.style.width = (t ? (n / t * 100) : 0) + "%";
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d: collect() }));
      var now = new Date();
      st.textContent = "已自動儲存 " + pad(now.getHours()) + ":" + pad(now.getMinutes());
      st.className = "status on";
    } catch (e) {
      st.textContent = "無法儲存（瀏覽器限制）"; st.className = "status";
    }
  }
  function restore() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw && urlId) raw = localStorage.getItem(BASEKEY);  /* 相容：先前未帶代碼所存之草稿 */
      if (!raw) return;
      var obj = JSON.parse(raw), d = obj.d || {};
      Object.keys(d).forEach(function (k) {
        var vals = String(d[k]).split("|");
        vals.forEach(function (v) {
          var n = document.getElementById(k + "__" + v);
          if (n) { n.checked = true; return; }
        });
        var t = document.getElementById(k);
        if (t && (t.tagName === "TEXTAREA" || t.classList.contains("short"))) t.value = d[k];
      });
      if (urlId && idInput) idInput.value = urlId;   /* 連結所帶之受訪者代碼優先於草稿 */
      var when = new Date(obj.t || Date.now());
      st.textContent = "已回復 " + pad(when.getMonth()+1) + "/" + pad(when.getDate())
                     + " " + pad(when.getHours()) + ":" + pad(when.getMinutes()) + " 之作答";
      st.className = "status on";
    } catch (e) {}
  }

  function markRows() {
    document.querySelectorAll("table.sg tbody tr").forEach(function (tr) {
      tr.classList.toggle("ans", !!tr.querySelector("input:checked"));
    });
  }

  restore(); syncChip(); progress(); markRows();

  var tmr;
  document.addEventListener("change", function (e) {
    if (e.target.matches("input, textarea, select.jump")) {
      if (e.target.id === "jump") {
        var v = e.target.value;
        if (v) { document.getElementById(v).scrollIntoView(); e.target.value = ""; }
        return;
      }
      if (e.target === idInput) syncChip();
      save(); progress(); markRows();
    }
  });
  document.addEventListener("input", function (e) {
    if (e.target.matches("textarea, input.short")) {
      if (e.target === idInput) syncChip();
      clearTimeout(tmr);
      tmr = setTimeout(function () { save(); progress(); }, 600);
    }
  });

  /* ---------- 驗證與送出 ---------- */
  var res = document.getElementById("res");
  function validate() {
    var d = collect(), missing = [];
    document.querySelectorAll(".q").forEach(function (q) { q.classList.remove("flag"); });
    var re = new RegExp(CFG.idPattern || "^[A-Za-z][0-9]{2}$");
    if (currentId() && !re.test(currentId())) missing.push({ label:"受訪者代碼格式不正確（" + (CFG.idHint||"") + "）", anchor:"q_RID" });
    REQUIRED.forEach(function (r) {
      if (!d[r.name]) missing.push({ label:r.label, anchor:r.anchor });
    });
    missing.forEach(function (m) {
      var n = document.getElementById(m.anchor);
      if (n && n.classList.contains("q")) n.classList.add("flag");
    });
    return missing;
  }

  function payload() {
    return {
      survey: S.id,
      surveyTitle: S.title,
      respondent: currentId(),
      submittedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      answers: collect()
    };
  }

  document.getElementById("btnBackup").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(payload(), null, 2)], { type:"application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "作答備份_" + S.id + "_" + (currentId() || "無代碼") + ".json";
    document.body.appendChild(a); a.click(); a.remove();
  });

  var btn = document.getElementById("btnSubmit");
  btn.addEventListener("click", function () {
    var miss = validate();
    if (miss.length) {
      res.className = "result bad";
      res.innerHTML = "<b>尚有 " + miss.length + " 題未完成，請補填後再送出。</b>"
        + '<ol class="miss-list">'
        + miss.slice(0, 12).map(function (m) {
            return '<li><a href="#' + m.anchor + '">' + esc(m.label) + "</a></li>";
          }).join("")
        + (miss.length > 12 ? "<li>……另有 " + (miss.length - 12) + " 題</li>" : "")
        + "</ol>";
      res.scrollIntoView({ block:"center" });
      return;
    }
    if (!CFG.endpoint) {
      res.className = "result bad";
      res.innerHTML = "<b>尚未設定收件端網址。</b>請開啟 assets/config.js，將 endpoint 填入 Apps Script 網頁應用程式網址後重新整理。";
      return;
    }
    btn.disabled = true;
    btn.textContent = "正在送出……";
    res.className = "result";
    var body = JSON.stringify(payload());

    fetch(CFG.endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body
    }).then(function (r) { return r.text(); })
      .then(function (txt) {
        var ok = false;
        try { ok = JSON.parse(txt).ok === true; } catch (e) { ok = /ok/i.test(txt); }
        if (!ok) throw new Error(txt || "未知回應");
        succeed();
      })
      .catch(function () {
        /* 後援：以隱藏表單送出，不受 CORS 限制 */
        try {
          var ifr = document.getElementById("__sink");
          if (!ifr) {
            ifr = document.createElement("iframe");
            ifr.id = "__sink"; ifr.name = "__sink"; ifr.style.display = "none";
            document.body.appendChild(ifr);
          }
          var f = document.createElement("form");
          f.method = "POST"; f.action = CFG.endpoint; f.target = "__sink";
          var i = document.createElement("input");
          i.type = "hidden"; i.name = "payload"; i.value = body;
          f.appendChild(i); document.body.appendChild(f);
          ifr.addEventListener("load", function () { succeed(true); }, { once:true });
          f.submit();
          setTimeout(function () { if (!btn.dataset.done) succeed(true); }, 4000);
        } catch (e) { failed(); }
      });
  });

  function succeed(viaFallback) {
    btn.dataset.done = "1";
    btn.textContent = "已送出";
    res.className = "result ok";
    res.innerHTML = "<b>問卷已送出，感謝您的協助。</b><br>"
      + "受訪者代碼 " + esc(currentId()) + "　送出時間 " + new Date().toLocaleString("zh-TW")
      + (viaFallback ? "<br>（以備用方式送出，若未收到確認通知請與承辦人聯繫。）" : "")
      + "<br>若需修正，可重新開啟本連結修改並再次送出。";
    res.scrollIntoView({ block:"center" });
  }
  function failed() {
    btn.disabled = false;
    btn.textContent = "重新送出";
    res.className = "result bad";
    res.innerHTML = "<b>送出失敗。</b>您的作答仍完整保留於本機，請稍後再按一次送出；"
      + "若仍失敗，請按「下載作答備份」並將檔案寄至 " + esc(CFG.contactEmail || "") + "，或電洽 "
      + esc(CFG.contactPhone || "") + "（" + esc(CFG.contactName || "") + "）。";
  }

  function toast(msg) {
    res.className = "result bad";
    res.innerHTML = esc(msg);
    setTimeout(function () { if (res.textContent === msg) res.className = "result"; }, 2600);
  }

  window.addEventListener("beforeunload", function (e) {
    if (!btn.dataset.done && answeredCount() > 1) { e.preventDefault(); e.returnValue = ""; }
  });
})();
