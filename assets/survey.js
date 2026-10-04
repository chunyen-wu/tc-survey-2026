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
    { suf:"Q1", title:"依上開證據，本技術之「全球」Hype Cycle 階段應判定為", optset:"stage", type:"single", required:true },
    { suf:"Q2", title:"依上開證據，本技術之「我國在地」Hype Cycle 階段應判定為", optset:"stage", type:"single", required:true, teamHelp:true },
    { suf:"Q3", title:"技術潛力四構面評分", type:"matrix4",
      help:"本研究將依既定權重加總後換算為技術潛力級別，故請就各構面分別評分，毋須直接評定級別。各構面之級距定義列於選項內。" },
    { suf:"Q4", title:"本技術自現階段發展至我國商業化規模應用之預估時程", optset:"time", type:"single", required:true },
    { suf:"Q5", title:"本技術之碳費補助優先順序", optset:"prio5", type:"single", required:true,
      help:"請綜合考量減碳潛力、在地產業關聯性，以及<b>附加性</b>——即若無公共資金介入，該技術之發展是否難以達成預期進度。" },
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
    ih.appendChild(el("p","eyebrow", esc(it.id) + "　項目 " + idx + " ／ " + total));
    ih.appendChild(el("h3","iname", esc(it.name)));
    ih.appendChild(el("p","ename", esc(it.en || "")));
    sec.appendChild(ih);
    sec.appendChild(trlBox(it));

    var b1 = el("div","block prose");
    b1.innerHTML = "<h4>技術說明</h4><p>" + esc(it.desc) + "</p>";
    sec.appendChild(b1);

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

    var b4 = el("div","block");
    var rows = (it.ev || []).map(function (e) {
      return "<tr><th>" + esc(e[0]) + "</th><td>" + esc(e[1]) + "</td></tr>";
    }).join("");
    b4.innerHTML = "<h4>五維證據摘要</h4><div class='tablewrap'><table class='ev'>"
      + "<thead><tr><th>證據維度</th><th>摘要</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
    sec.appendChild(b4);

    sec.appendChild(qlead(KEY_Q.length));
    KEY_Q.forEach(function (t) {
      var q = { id: it.id + "-" + t.suf, title:t.title, type:t.type, optset:t.optset,
                required:t.required, help:t.help };
      if (t.teamHelp && it.team) {
        q.help = "研究團隊之判定為　<b>" + esc(it.team) + "</b>。此一資訊僅供參考，請依您的專業判斷作答，毋須與之一致。";
      }
      sec.appendChild(question(q, sec.id));
    });
    return sec;
  }

  function genItem(it, idx, total) {
    var sec = el("section","item");
    sec.id = "item_" + it.id;
    var ih = el("div","ihead");
    ih.appendChild(el("p","eyebrow", esc(it.id) + "　項目 " + idx + " ／ " + total));
    ih.appendChild(el("h3","iname", esc(it.name)));
    ih.appendChild(el("p","ename", esc(it.en || "")));
    sec.appendChild(ih);
    sec.appendChild(trlBox(it));

    var b1 = el("div","block prose");
    b1.innerHTML = "<h4>在地發展事證</h4><p>" + esc(it.lr || "查無在地公開資訊") + "</p>";
    sec.appendChild(b1);

    var b2 = el("div","block");
    var rows = (it.ev || []).map(function (e) {
      return "<tr><th>" + esc(e[0]) + "</th><td>" + esc(e[1]) + "</td></tr>";
    }).join("");
    b2.innerHTML = "<h4>五維證據摘要</h4><div class='tablewrap'><table class='ev'>"
      + "<thead><tr><th>證據維度</th><th>摘要</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
    sec.appendChild(b2);

    sec.appendChild(qlead(GEN_Q.length));
    GEN_Q.forEach(function (t) {
      sec.appendChild(question({ id: it.id + "-" + t.suf, title:t.title, type:t.type,
                                 optset:t.optset, required:t.required }, sec.id));
    });
    return sec;
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

  if (S.reflist && S.reflist.length) {
    var rd = el("details","ref reflist");
    var body = (S.refsrc ? '<p class="refnote">' + esc(S.refsrc) + '</p>' : "")
      + '<ol class="refs">' + S.reflist.map(function (r) {
          return '<li><span class="rid">' + esc(r[0]) + '</span>' + esc(r[1])
            + (r[2] ? "（" + esc(r[2]) + "）" : "") + "，" + esc(r[3])
            + (r[5] ? '　<span class="rsrc">' + esc(r[5]) + "</span>" : "") + "</li>";
        }).join("") + "</ol>";
    rd.innerHTML = '<summary>本卷事證之引用文獻（' + S.reflist.length + ' 筆）</summary>'
      + '<div class="ref-body">' + body + "</div>";
    root.appendChild(rd);
  }

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
    + '<p class="contact">填答期限　' + esc(CFG.deadline || "") + '　｜　如有任何疑問，請聯繫　'
    + esc(CFG.contactName || "") + '　電話 ' + esc(CFG.contactPhone || "")
    + '　電子郵件 ' + esc(CFG.contactEmail || "") + '</p>';
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
  try {
    var p = new URLSearchParams(location.search).get("id");
    if (p && idInput) { idInput.value = p.trim().toUpperCase(); }
  } catch (e) {}
  function syncChip() {
    var v = currentId();
    ridChip.textContent = v || "—";
    var re = new RegExp(CFG.idPattern || "^[A-Za-z][0-9]{2}$");
    ridChip.parentNode.classList.toggle("miss", !!v && !re.test(v));
  }

  /* ---------- 儲存與進度 ---------- */
  var KEY = "cier_hype_" + S.id;
  var st = document.getElementById("st");
  var fill = document.getElementById("fill");
  var doneEl = document.getElementById("done");
  document.getElementById("total").textContent = REQUIRED.length + 1; /* +1 為代碼 */

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
    if (currentId()) n++;
    return n;
  }
  function progress() {
    var n = answeredCount(), t = REQUIRED.length + 1;
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
    if (!currentId()) missing.push({ label:"受訪者代碼", anchor:"q_RID" });
    else if (!re.test(currentId())) missing.push({ label:"受訪者代碼格式不正確（" + (CFG.idHint||"") + "）", anchor:"q_RID" });
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
