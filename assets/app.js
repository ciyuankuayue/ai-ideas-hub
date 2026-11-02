/* AI 想法图谱 —— 零依赖交互视图
 * 数据来自 data/ideas.json；图谱为自写的力导向布局（canvas）。
 * 本地预览需用静态服务器（见 README），GitHub Pages 直接可用。
 */
(function () {
  "use strict";

  var state = {
    meta: { title: "AI 想法图谱", repo: "你的用户名/ai-ideas-hub" },
    ideas: [],
    nodes: [],
    edges: [],
    byId: {},
    search: "",
    activeStatus: new Set(),
    activeTags: new Set(),
    view: "graph",
    selected: null,
    hover: null,
    cam: { x: 0, y: 0, scale: 1 },
    drag: null,
    panning: false,
    down: null,
    moved: false,
    alpha: 1
  };

  var STATUS_LABEL = {
    raw: "原始想法", exploring: "探索中", hasResearch: "已有研究",
    wip: "进行中", dormant: "搁置"
  };
  var STATUS_CLASS = {
    raw: "raw", exploring: "exploring", hasResearch: "has-research",
    wip: "wip", dormant: "dormant"
  };

  /* ---------- 加载数据 ---------- */
  function load() {
    fetch("data/ideas.json")
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        state.meta = data.meta || state.meta;
        state.ideas = data.ideas || [];
        document.getElementById("siteTitle").textContent = state.meta.title || "AI 想法图谱";
        document.getElementById("siteDesc").textContent = state.meta.description || "";
        buildGraph();
        buildFilterBar();
        renderCards();
        fitCamera();
        loop();
      })
      .catch(function (e) {
        document.getElementById("graphView").innerHTML =
          '<div style="padding:40px;color:#9da5b4;line-height:1.8">' +
          '无法加载 data/ideas.json（' + e.message + '）。<br>' +
          '本地预览请用静态服务器，例如在仓库根目录运行：<br>' +
          '<code style="color:#e2c08d">python -m http.server 8000</code><br>' +
          '然后访问 http://localhost:8000 。GitHub Pages 直接可访问。</div>';
      });
  }

  /* ---------- 构建图模型 ---------- */
  function buildGraph() {
    state.nodes = [];
    state.edges = [];
    state.byId = {};
    var n = state.ideas.length;
    var R = 220;
    state.ideas.forEach(function (idea, i) {
      var ang = (i / n) * Math.PI * 2;
      var node = {
        id: idea.id, type: "idea", data: idea,
        x: Math.cos(ang) * R, y: Math.sin(ang) * R,
        vx: 0, vy: 0, fixed: false, visible: true
      };
      state.nodes.push(node);
      state.byId[idea.id] = node;
    });
    // research 节点 + 边
    state.ideas.forEach(function (idea) {
      var parent = state.byId[idea.id];
      (idea.research || []).forEach(function (r, k) {
        var rid = idea.id + "-r" + k;
        var rn = {
          id: rid, type: "research", data: r, parent: idea.id,
          x: parent.x + (Math.random() - 0.5) * 60,
          y: parent.y + (Math.random() - 0.5) * 60,
          vx: 0, vy: 0, fixed: false, visible: true
        };
        state.nodes.push(rn);
        state.byId[rid] = rn;
        state.edges.push({ source: idea.id, target: rid, kind: "research" });
      });
      // inspiredBy / leadsTo
      (idea.chain && idea.chain.inspiredBy || []).forEach(function (src) {
        if (state.byId[src]) state.edges.push({ source: src, target: idea.id, kind: "inspiredBy" });
      });
      (idea.chain && idea.chain.leadsTo || []).forEach(function (dst) {
        if (state.byId[dst]) state.edges.push({ source: idea.id, target: dst, kind: "leadsTo" });
      });
    });
  }

  /* ---------- 力导向模拟 ---------- */
  function tick() {
    var nodes = state.nodes, edges = state.edges;
    var krep = 5200, ks = 0.025, kg = 0.0012, damp = 0.86;
    var i, j, a, b, dx, dy, d2, d, f;
    for (i = 0; i < nodes.length; i++) {
      a = nodes[i];
      for (j = i + 1; j < nodes.length; j++) {
        b = nodes[j];
        dx = a.x - b.x; dy = a.y - b.y;
        d2 = dx * dx + dy * dy + 0.01; d = Math.sqrt(d2);
        f = krep / d2;
        var fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
    }
    edges.forEach(function (e) {
      a = state.byId[e.source]; b = state.byId[e.target];
      if (!a || !b) return;
      dx = b.x - a.x; dy = b.y - a.y;
      d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      var rest = e.kind === "research" ? 70 : 120;
      f = ks * (d - rest);
      var sx = (dx / d) * f, sy = (dy / d) * f;
      a.vx += sx; a.vy += sy; b.vx -= sx; b.vy -= sy;
    });
    nodes.forEach(function (nd) {
      nd.vx += (0 - nd.x) * kg;
      nd.vy += (0 - nd.y) * kg;
    });
    nodes.forEach(function (nd) {
      if (nd.fixed) { nd.vx = 0; nd.vy = 0; return; }
      nd.vx *= damp; nd.vy *= damp;
      nd.x += nd.vx * state.alpha;
      nd.y += nd.vy * state.alpha;
    });
    state.alpha = Math.max(0.02, state.alpha * 0.985);
  }

  /* ---------- 画布渲染 ---------- */
  var canvas, ctx, dpr = 1, W = 0, H = 0;
  function resize() {
    canvas = document.getElementById("graph");
    ctx = canvas.getContext("2d");
    dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
  }
  function toScreen(x, y) { return { x: x * state.cam.scale + state.cam.x, y: y * state.cam.scale + state.cam.y }; }
  function toWorld(sx, sy) { return { x: (sx - state.cam.x) / state.cam.scale, y: (sy - state.cam.y) / state.cam.scale }; }

  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // edges
    state.edges.forEach(function (e) {
      var a = state.byId[e.source], b = state.byId[e.target];
      if (!a || !b || !a.visible || !b.visible) return;
      var pa = toScreen(a.x, a.y), pb = toScreen(b.x, b.y);
      var col = e.kind === "inspiredBy" ? "#4daafc" : e.kind === "leadsTo" ? "#89d185" : "#c586c0";
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      // 箭头（inspiredBy / leadsTo 有方向）
      if (e.kind !== "research") {
        var ux = pb.x - pa.x, uy = pb.y - pa.y, len = Math.sqrt(ux * ux + uy * uy) || 1;
        ux /= len; uy /= len;
        var r = (b.type === "idea" ? 16 : 9) * state.cam.scale + 3;
        var ax = pb.x - ux * r, ay = pb.y - uy * r;
        var px = -uy, py = ux;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - ux * 8 + px * 4, ay - uy * 8 + py * 4);
        ctx.lineTo(ax - ux * 8 - px * 4, ay - uy * 8 - py * 4);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
      }
      ctx.globalAlpha = 1;
    });

    // nodes
    state.nodes.forEach(function (nd) {
      var p = toScreen(nd.x, nd.y);
      var baseR = nd.type === "idea" ? 16 : 9;
      var r = baseR * state.cam.scale;
      var dim = !nd.visible;
      ctx.globalAlpha = dim ? 0.12 : 1;
      var fill = nd.type === "idea"
        ? (nd.id === (state.selected && state.selected.id) ? "#fff" : "#e2c08d")
        : "#c586c0";
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = nd.id === (state.hover && state.hover.id) ? "#fff" : "#1e1e1e";
      ctx.stroke();

      if (nd.type === "idea" && !dim) {
        var label = nd.data.title || nd.id;
        if (label.length > 14) label = label.slice(0, 13) + "…";
        ctx.font = "12px 'Segoe UI', sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillStyle = nd.id === (state.selected && state.selected.id) ? "#fff" : "#d4d4d4";
        ctx.fillText(label, p.x, p.y + r + 4);
      }
    });
    ctx.globalAlpha = 1;
  }

  function loop() { tick(); draw(); requestAnimationFrame(loop); }

  function fitCamera() {
    if (!W) resize();
    state.cam.scale = 1;
    state.cam.x = W / 2; state.cam.y = H / 2;
  }

  /* ---------- 交互 ---------- */
  function nodeAt(sx, sy) {
    for (var i = state.nodes.length - 1; i >= 0; i--) {
      var nd = state.nodes[i];
      if (!nd.visible) continue;
      var p = toScreen(nd.x, nd.y);
      var r = (nd.type === "idea" ? 16 : 9) * state.cam.scale + 4;
      if ((sx - p.x) * (sx - p.x) + (sy - p.y) * (sy - p.y) <= r * r) return nd;
    }
    return null;
  }

  function bindCanvas() {
    canvas = document.getElementById("graph");
    canvas.addEventListener("mousedown", function (e) {
      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      state.down = { sx: sx, sy: sy }; state.moved = false;
      var nd = nodeAt(sx, sy);
      if (nd) { state.drag = nd; nd.fixed = true; }
      else { state.panning = true; state.lastMouse = { sx: sx, sy: sy }; }
    });
    window.addEventListener("mousemove", function (e) {
      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (state.down) {
        if (Math.abs(sx - state.down.sx) + Math.abs(sy - state.down.sy) > 4) state.moved = true;
      }
      if (state.drag) {
        var w = toWorld(sx, sy);
        state.drag.x = w.x; state.drag.y = w.y;
        state.drag.vx = 0; state.drag.vy = 0;
        state.alpha = Math.max(state.alpha, 0.4);
      } else if (state.panning) {
        state.cam.x += sx - state.lastMouse.sx;
        state.cam.y += sy - state.lastMouse.sy;
        state.lastMouse = { sx: sx, sy: sy };
      } else {
        state.hover = nodeAt(sx, sy);
        canvas.style.cursor = state.hover ? "pointer" : "grab";
      }
    });
    window.addEventListener("mouseup", function (e) {
      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (state.drag) {
        state.drag.fixed = false;
        if (!state.moved) selectNode(state.drag);
        state.drag = null;
      } else if (state.panning && !state.moved) {
        var nd = nodeAt(sx, sy);
        if (nd) selectNode(nd);
      }
      state.panning = false; state.down = null;
    });
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      var w = toWorld(sx, sy);
      var factor = e.deltaY < 0 ? 1.1 : 0.9;
      var ns = Math.min(3, Math.max(0.3, state.cam.scale * factor));
      state.cam.scale = ns;
      state.cam.x = sx - w.x * ns; state.cam.y = sy - w.y * ns;
    }, { passive: false });
  }

  /* ---------- 详情面板 ---------- */
  function selectNode(nd) {
    state.selected = nd;
    var panel = document.getElementById("detail");
    panel.classList.remove("hidden");
    if (nd.type === "research") { renderResearchDetail(nd); }
    else { renderIdeaDetail(nd.data); }
  }

  function issueUrl(title, body) {
    var repo = state.meta.repo || "你的用户名/ai-ideas-hub";
    return "https://github.com/" + repo + "/issues/new?title=" +
      encodeURIComponent(title) + "&body=" + encodeURIComponent(body);
  }

  function renderIdeaDetail(idea) {
    var sc = STATUS_CLASS[idea.status] || "raw";
    var sl = STATUS_LABEL[idea.status] || idea.status;
    var tags = (idea.tags || []).map(function (t) {
      return '<span class="tag">' + esc(t) + "</span>";
    }).join("");
    var research = (idea.research || []).map(function (r) {
      return '<a class="research-item" href="' + esc(r.url) + '" target="_blank" rel="noopener">' +
        '<div class="rn">' + esc(r.title) + "</div>" +
        (r.note ? '<div class="rnote">' + esc(r.note) + "</div>" : "") + "</a>";
    }).join("");
    var ib = (idea.chain && idea.chain.inspiredBy || []).map(function (id) {
      return chainChip(id);
    }).join("");
    var lt = (idea.chain && idea.chain.leadsTo || []).map(function (id) {
      return chainChip(id);
    }).join("");
    var oq = (idea.chain && idea.chain.openQuestions || []).map(function (q) {
      return "<div class='open-q'>· " + esc(q) + "</div>";
    }).join("");

    document.getElementById("detailBody").innerHTML =
      '<span class="status ' + sc + '">' + sl + "</span>" +
      "<h2>" + esc(idea.title) + "</h2>" +
      '<div class="tags" style="margin-bottom:12px">' + tags + "</div>" +
      '<div class="section"><div class="section-title">我的想法</div><p>' + esc(idea.thought || idea.summary || "") + "</p></div>" +
      (research ? '<div class="section"><div class="section-title">已查到的相关研究</div>' + research + "</div>" : "") +
      (ib ? '<div class="section"><div class="section-title">受这些启发（inspiredBy）</div><div>' + ib + "</div></div>" : "") +
      (lt ? '<div class="section"><div class="section-title">衍生出（leadsTo）</div><div>' + lt + "</div></div>" : "") +
      (oq ? '<div class="section"><div class="section-title">开放问题 / 邀请参与</div>' + oq + "</div>" : "") +
      '<a class="btn-participate" href="' + issueUrl("参与研究：" + idea.id + " " + idea.title,
        "我想参与这个想法：" + idea.id + "\n\n（在这里写下你的思路 / 想做的实验 / 疑问）") +
      '" target="_blank" rel="noopener">参与研究</a>';
  }

  function chainChip(id) {
    var nd = state.byId[id];
    var label = nd ? (nd.type === "research" ? nd.data.title : nd.data.title) : id;
    return '<span class="chain-chip" data-id="' + esc(id) + '">' + esc(label) + "</span>";
  }

  function renderResearchDetail(nd) {
    var parent = state.byId[nd.parent];
    document.getElementById("detailBody").innerHTML =
      '<span class="status exploring">现有研究</span>' +
      "<h2>" + esc(nd.data.title) + "</h2>" +
      (nd.data.note ? '<div class="section"><div class="section-title">与想法的关联</div><p>' + esc(nd.data.note) + "</p></div>" : "") +
      '<a class="btn-participate" href="' + esc(nd.data.url) + '" target="_blank" rel="noopener">打开原文</a>' +
      (parent ? '<div class="section"><div class="section-title">关联的想法</div>' +
        '<span class="chain-chip" data-id="' + esc(parent.id) + '">' + esc(parent.data.title) + "</span></div>" : "");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  document.addEventListener("click", function (e) {
    var chip = e.target.closest && e.target.closest(".chain-chip");
    if (chip) {
      var id = chip.getAttribute("data-id");
      var nd = state.byId[id];
      if (nd) {
        if (state.view !== "graph") switchView("graph");
        selectNode(nd);
        var w = nd;
        state.cam.x = W / 2 - w.x * state.cam.scale;
        state.cam.y = H / 2 - w.y * state.cam.scale;
      }
    }
  });

  document.getElementById("detailClose").addEventListener("click", function () {
    document.getElementById("detail").classList.add("hidden");
    state.selected = null;
  });

  /* ---------- 卡片视图 ---------- */
  function renderCards() {
    var box = document.getElementById("cardsView");
    box.innerHTML = state.ideas.filter(function (i) { return isVisible(i); }).map(function (idea) {
      var sc = STATUS_CLASS[idea.status] || "raw";
      var sl = STATUS_LABEL[idea.status] || idea.status;
      var tags = (idea.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("");
      return '<div class="card" data-id="' + esc(idea.id) + '">' +
        '<span class="status ' + sc + '">' + sl + "</span>" +
        "<h3>" + esc(idea.title) + "</h3>" +
        '<div class="summary">' + esc(idea.summary || "") + "</div>" +
        '<div class="tags">' + tags + "</div></div>";
    }).join("");
    Array.prototype.forEach.call(box.querySelectorAll(".card"), function (c) {
      c.addEventListener("click", function () {
        var nd = state.byId[c.getAttribute("data-id")];
        if (nd) { switchView("graph"); selectNode(nd); }
      });
    });
  }

  /* ---------- 过滤 / 搜索 ---------- */
  function isVisible(idea) {
    if (state.activeStatus.size && !state.activeStatus.has(idea.status)) return false;
    if (state.activeTags.size) {
      var has = (idea.tags || []).some(function (t) { return state.activeTags.has(t); });
      if (!has) return false;
    }
    if (state.search) {
      var hay = (idea.title + " " + (idea.summary || "") + " " + (idea.thought || "") + " " +
        (idea.tags || []).join(" ") + " " +
        (idea.research || []).map(function (r) { return r.title + " " + (r.note || ""); }).join(" ")).toLowerCase();
      if (hay.indexOf(state.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function applyFilter() {
    state.nodes.forEach(function (nd) {
      if (nd.type === "idea") nd.visible = isVisible(nd.data);
      else nd.visible = nd.parent && state.byId[nd.parent] && state.byId[nd.parent].visible;
    });
    renderCards();
  }

  function buildFilterBar() {
    var bar = document.getElementById("filterBar");
    var statuses = ["raw", "exploring", "hasResearch", "wip", "dormant"];
    var tags = {};
    state.ideas.forEach(function (i) { (i.tags || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; }); });
    var html = statuses.map(function (s) {
      return '<span class="chip" data-type="status" data-val="' + s + '">' +
        (STATUS_LABEL[s] || s) + "</span>";
    }).join("");
    html += Object.keys(tags).map(function (t) {
      return '<span class="chip" data-type="tag" data-val="' + esc(t) + '">' + esc(t) + "</span>";
    }).join("");
    bar.innerHTML = html;
    Array.prototype.forEach.call(bar.querySelectorAll(".chip"), function (chip) {
      chip.addEventListener("click", function () {
        var type = chip.getAttribute("data-type");
        var val = chip.getAttribute("data-val");
        var set = type === "status" ? state.activeStatus : state.activeTags;
        if (set.has(val)) { set.delete(val); chip.classList.remove("active"); }
        else { set.add(val); chip.classList.add("active"); }
        applyFilter();
      });
    });
  }

  /* ---------- 视图切换 ---------- */
  function switchView(v) {
    state.view = v;
    document.getElementById("graphView").classList.toggle("hidden", v !== "graph");
    document.getElementById("cardsView").classList.toggle("hidden", v !== "cards");
    document.getElementById("btnGraph").classList.toggle("active", v === "graph");
    document.getElementById("btnCards").classList.toggle("active", v === "cards");
    if (v === "graph") { resize(); fitCamera(); }
  }

  /* ---------- 初始化 ---------- */
  function init() {
    resize();
    bindCanvas();
    window.addEventListener("resize", function () {
      resize();
      if (state.view === "graph") fitCamera();
      else renderCards();
    });
    document.getElementById("search").addEventListener("input", function (e) {
      state.search = e.target.value.trim(); applyFilter();
    });
    document.getElementById("btnGraph").addEventListener("click", function () { switchView("graph"); });
    document.getElementById("btnCards").addEventListener("click", function () { switchView("cards"); });
    var repo = state.meta.repo || "你的用户名/ai-ideas-hub";
    document.getElementById("btnNewIdea").href = issueUrl("提议新想法",
      "## 想法标题\n\n## 我的想法\n\n## 标签（逗号分隔）\n\n## 状态\nraw / exploring / hasResearch / wip / dormant");
    load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
