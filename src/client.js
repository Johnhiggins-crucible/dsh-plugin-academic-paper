// dsh-plugin-academic-paper — 浏览器半身（侧边文献库面板）
// 契约：经 window.__ModuleLoader__.load({id, factory}) 注册；factory 返回
//       { name, apply(ctx) } —— 与 Cordis 客户端插件的对象形态一致。
// apply(ctx) 不再依赖「apply 返回值即 disposer」（当前 Cordis fiber 执行
//   runtime.callback(ctx, config) 时丢弃返回值），而是把全部挂载副作用放进
//   ctx.effect()，由 fiber 卸载统一清理（DOM / 样式 / 轮询定时器）。
// 视觉：统一字体与字阶、修正对齐与留白、深/浅主题自动适配（CSS 变量令牌化）。
// 用户文本一律 textContent 渲染。

window.__ModuleLoader__.load({
  id: "dsh-plugin-academic-paper",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    var NAME = "dsh-plugin-academic-paper";
    var ATTR = "data-ap";
    var STATE_PATH = "/academic/ui/state";
    var LIBRARY_PATH = "/academic/ui/library";
    var REMOVE_PATH = "/academic/ui/remove";
    var CLEAR_PATH = "/academic/ui/clear";
    var EXPORT_PATH = "/academic/ui/export";
    var HIDE_KEY = "dsh-plugin-academic-paper:hidden";
    var POLL_MS = 20000;
    var EXPORT_LIMIT = 20000;

    // 主题令牌：深色为默认值，浅色在 .ap-light 下覆盖。统一由变量驱动配色，
    // 避免原生控件浅色与硬编码深色“两套系统”打架。
    var CSS = [
      "[" + ATTR + "] { font-family: 'Segoe UI', system-ui, -apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; font-size: 13px; line-height: 1.45; color: var(--ap-text); -webkit-font-smoothing: antialiased; }",
      "[" + ATTR + "=\"root\"] { --ap-surface: rgba(28,31,38,.97); --ap-surface-2: rgba(255,255,255,.06); --ap-surface-3: rgba(255,255,255,.12); --ap-border: rgba(255,255,255,.14); --ap-border-2: rgba(255,255,255,.07); --ap-text: #e9edf4; --ap-text-2: rgba(233,237,244,.72); --ap-text-3: rgba(233,237,244,.5); --ap-accent: #5b8def; --ap-accent-ink: #fff; --ap-danger: #d8574f; --ap-danger-ink: #fff; --ap-input-bg: rgba(0,0,0,.22); --ap-hover: rgba(255,255,255,.12); --ap-shadow: 0 12px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04); }",
      "[" + ATTR + "=\"root\"].ap-light { --ap-surface: rgba(255,255,255,.97); --ap-surface-2: rgba(15,23,42,.045); --ap-surface-3: rgba(15,23,42,.1); --ap-border: rgba(15,23,42,.15); --ap-border-2: rgba(15,23,42,.08); --ap-text: #1f2430; --ap-text-2: rgba(31,36,48,.66); --ap-text-3: rgba(31,36,48,.45); --ap-accent: #2f6fed; --ap-accent-ink: #fff; --ap-danger: #c8443c; --ap-danger-ink: #fff; --ap-input-bg: rgba(15,23,42,.05); --ap-hover: rgba(15,23,42,.08); --ap-shadow: 0 14px 44px rgba(31,41,59,.22), 0 0 0 1px rgba(31,41,59,.05); }",
      "[" + ATTR + "] * { box-sizing: border-box; }",
      "[" + ATTR + "] button { cursor: pointer; border: 1px solid transparent; background: transparent; color: inherit; font: inherit; border-radius: 8px; padding: 6px 12px; transition: background .12s ease, border-color .12s ease; }",
      "[" + ATTR + "] button:hover { background: var(--ap-hover); }",
      "[" + ATTR + "] button:disabled { opacity: .45; cursor: default; }",
      "[" + ATTR + "] button.ap-primary { background: var(--ap-accent); border-color: transparent; color: var(--ap-accent-ink); font-weight: 600; }",
      "[" + ATTR + "] button.ap-primary:hover { filter: brightness(1.08); background: var(--ap-accent); }",
      "[" + ATTR + "] button.ap-danger { background: var(--ap-danger); border-color: transparent; color: var(--ap-danger-ink); font-weight: 600; }",
      "[" + ATTR + "] button.ap-danger:hover { filter: brightness(1.08); background: var(--ap-danger); }",
      "[" + ATTR + "] button.ap-ghost { border: 1px solid var(--ap-border); color: var(--ap-text-2); }",
      "[" + ATTR + "] button.ap-ghost:hover { color: var(--ap-text); border-color: var(--ap-text-3); background: var(--ap-hover); }",
      "[" + ATTR + "] select, [" + ATTR + "] textarea { width: 100%; background: var(--ap-input-bg); border: 1px solid var(--ap-border); color: var(--ap-text); border-radius: 8px; padding: 6px 9px; font: inherit; }",
      "[" + ATTR + "] select:focus, [" + ATTR + "] textarea:focus, [" + ATTR + "] button:focus-visible { outline: 2px solid var(--ap-accent); outline-offset: 1px; }",
      "[" + ATTR + "] .ap-tabs { display: flex; gap: 4px; padding: 8px 14px 0; }",
      "[" + ATTR + "] .ap-tab { padding: 5px 14px; border-radius: 8px; font-size: 13px; color: var(--ap-text-2); line-height: 1.4; }",
      "[" + ATTR + "] .ap-tab:hover { color: var(--ap-text); background: var(--ap-hover); }",
      "[" + ATTR + "] .ap-tab.ap-on { background: var(--ap-surface-3); color: var(--ap-text); font-weight: 600; }",
      "[" + ATTR + "] .ap-item { padding: 9px 2px; border-bottom: 1px dashed var(--ap-border-2); }",
      "[" + ATTR + "] .ap-item:last-child { border-bottom: none; }",
      "[" + ATTR + "] .ap-item-title { font-size: 13px; font-weight: 600; line-height: 1.45; cursor: pointer; word-break: break-all; }",
      "[" + ATTR + "] .ap-item-title:hover { color: var(--ap-accent); }",
      "[" + ATTR + "] .ap-meta { color: var(--ap-text-3); font-size: 12px; line-height: 1.5; margin-top: 3px; word-break: break-all; }",
      "[" + ATTR + "] .ap-actions { display: flex; gap: 6px; margin-top: 6px; }",
      "[" + ATTR + "] .ap-actions button { padding: 3px 10px; font-size: 12px; border-radius: 6px; }",
      "[" + ATTR + "] .ap-detail { margin-top: 8px; padding: 10px 12px; border-radius: 10px; background: var(--ap-surface-2); color: var(--ap-text-2); font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; max-height: 180px; overflow: auto; }",
      "[" + ATTR + "] .ap-note { padding: 10px 12px; border-radius: 10px; background: var(--ap-surface-2); border: 1px dashed var(--ap-border-2); color: var(--ap-text-2); line-height: 1.6; margin: 0; }",
      "[" + ATTR + "] .ap-foot { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--ap-border); flex-wrap: wrap; }",
      "[" + ATTR + "] .ap-foot button { flex: 1; white-space: nowrap; }",
      "[" + ATTR + "] .ap-export { padding: 0 14px 12px; }",
      "[" + ATTR + "] .ap-export textarea { min-height: 96px; resize: vertical; white-space: pre; font-family: ui-monospace, 'Cascadia Code', Consolas, 'Courier New', monospace; font-size: 12px; line-height: 1.5; }",
      "[" + ATTR + "] .ap-history-item { padding: 7px 2px; border-bottom: 1px dashed var(--ap-border-2); color: var(--ap-text-2); font-size: 12.5px; line-height: 1.5; }",
      "[" + ATTR + "] .ap-history-item:last-child { border-bottom: none; }",
    ].join("\n");

    function el(tag, props, children) {
      var node = document.createElement(tag);
      if (props) {
        for (var key in props) {
          if (key === "style") node.style.cssText = props[key];
          else if (key === "class") node.className = props[key];
          else if (key.indexOf("on") === 0 && typeof props[key] === "function") {
            node.addEventListener(key.slice(2).toLowerCase(), props[key]);
          } else node.setAttribute(key, props[key]);
        }
      }
      (children || []).forEach(function (child) {
        if (typeof child === "string") node.appendChild(document.createTextNode(child));
        else if (child) node.appendChild(child);
      });
      return node;
    }

    function fetchJson(path, method, body) {
      var options = { method: method || "GET", cache: "no-store", headers: {} };
      if (body) {
        options.headers["content-type"] = "application/json";
        options.body = JSON.stringify(body);
      }
      return fetch(path, options).then(function (response) {
        return response.json().then(function (json) {
          if (!response.ok) throw new Error((json && json.msg) || "HTTP " + response.status);
          return json;
        });
      });
    }

    function fetchText(path) {
      return fetch(path, { cache: "no-store" }).then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.text();
      });
    }

    // 主题判定：<html> 类名/color-scheme 标记 > 页面背景亮度 > 系统配色偏好。
    function computeScheme() {
      try {
        var rootTheme = (document.documentElement.getAttribute("data-theme") || "").toLowerCase();
        if (/dark/.test(rootTheme)) return "dark";
        if (/light/.test(rootTheme)) return "light";
        var rootClass = document.documentElement.className || "";
        if (/\bdark\b/i.test(rootClass) && !/\blight\b/i.test(rootClass)) return "dark";
      } catch (e) { /* 继续下一信号 */ }
      try {
        var cs = getComputedStyle(document.documentElement).colorScheme;
        if (cs === "dark") return "dark";
        if (cs === "light") return "light";
      } catch (e) { /* 继续下一信号 */ }
      try {
        var bg = getComputedStyle(document.body).backgroundColor;
        var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(bg);
        if (m) {
          var lum = 0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]);
          if (lum > 150) return "light";
          if (lum < 110) return "dark";
        }
      } catch (e) { /* 继续下一信号 */ }
      try {
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
      } catch (e) { /* 继续下一信号 */ }
      return "light";
    }

    function apply(ctx) {
      if (document.querySelector("[" + ATTR + '="root"]')) {
        console.warn("[dsh-plugin-academic-paper] apply 已存在，跳过重复挂载");
        return;
      }

      var style = el("style", null, [CSS]);

      var host = el("div", { "data-ap": "root" });
      host.style.cssText = "position:fixed; right:16px; bottom:16px; z-index:2147482900; user-select:none; display:flex; flex-direction:column; align-items:flex-end;";

      // ---- 胶囊按钮 ----
      var capsule = el(
        "button",
        {
          "data-ap": "capsule",
          title: "学术文献库面板",
          style: "cursor:pointer;border:1px solid var(--ap-border);border-radius:999px;padding:9px 15px;background:var(--ap-surface);box-shadow:var(--ap-shadow);backdrop-filter:blur(12px);color:var(--ap-text);font-size:14px;font-weight:600;display:flex;gap:8px;align-items:center;",
        },
        [el("span", null, ["\uD83D\uDCDA 文献"])]
      );
      var badge = el("span", {
        style: "display:none;background:var(--ap-accent);color:var(--ap-accent-ink);border-radius:999px;padding:0 7px;font-size:11px;font-weight:700;line-height:1.7;min-width:18px;text-align:center;",
      }, [""]);
      capsule.appendChild(badge);
      host.appendChild(capsule);

      // ---- 面板 ----
      var panel = el("div", {
        style:
          "display:none;margin-top:10px;width:430px;max-width:calc(100vw - 32px);max-height:min(72vh,640px);background:var(--ap-surface);backdrop-filter:blur(18px);border:1px solid var(--ap-border);border-radius:16px;box-shadow:var(--ap-shadow);overflow:hidden;display:flex;flex-direction:column;",
      });
      host.appendChild(panel);

      // 头部：标题 + 会话选择 + 状态
      var header = el("div", {
        style: "display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--ap-border-2);",
      });
      header.appendChild(el("span", { style: "font-size:14px;font-weight:700;letter-spacing:.2px;white-space:nowrap;" }, ["文献库"]));
      var sessionSelect = el("select", { "data-ap": "session", style: "flex:1;min-width:0;" });
      header.appendChild(sessionSelect);
      var statusText = el("span", { style: "color:var(--ap-text-3);white-space:nowrap;font-size:12px;min-width:34px;text-align:right;" }, [""]);
      header.appendChild(statusText);
      panel.appendChild(header);

      // 标签页
      var tabs = el("div", { class: "ap-tabs" });
      var tabLibrary = el("div", { "data-ap": "tab", class: "ap-tab ap-on" }, ["文献库"]);
      var tabHistory = el("div", { "data-ap": "tab", class: "ap-tab" }, ["检索历史"]);
      tabs.append(tabLibrary, tabHistory);
      panel.appendChild(tabs);

      var body = el("div", { style: "padding:10px 14px 14px;overflow:auto;" });
      panel.appendChild(body);

      var libraryBox = el("div", null, []);
      var historyBox = el("div", { style: "display:none;" }, []);
      body.append(libraryBox, historyBox);

      var foot = el("div", { class: "ap-foot" });
      var btnClear = el("button", { class: "ap-danger", title: "清空当前会话文献库" }, ["清空"]);
      var btnExportBib = el("button", { class: "ap-ghost", title: "导出 BibTeX（.bib）" }, ["BibTeX"]);
      var btnExportMd = el("button", { class: "ap-ghost", title: "导出 Markdown 参考文献列表" }, ["Markdown"]);
      foot.append(btnClear, btnExportBib, btnExportMd);
      panel.appendChild(foot);

      var exportBox = el("div", { class: "ap-export", style: "display:none;" });
      var exportArea = el("textarea", { readonly: "readonly", placeholder: "导出内容将显示在这里", spellcheck: "false" });
      var exportCopy = el("button", { class: "ap-primary", style: "margin-top:8px;width:100%;" }, ["复制到剪贴板"]);
      exportBox.append(exportArea, exportCopy);
      panel.appendChild(exportBox);

      var sessions = [];
      var currentSession = "default";
      var hidden = false;
      try {
        hidden = localStorage.getItem(HIDE_KEY) === "1";
      } catch (e) {}

      function syncHidden() {
        panel.style.display = hidden ? "none" : "flex";
        if (!hidden) refreshAll();
      }

      capsule.addEventListener("click", function () {
        hidden = !hidden;
        try {
          if (hidden) localStorage.setItem(HIDE_KEY, "1");
          else localStorage.removeItem(HIDE_KEY);
        } catch (e) {}
        syncHidden();
      });

      function showTab(which) {
        var onLibrary = which === "library";
        tabLibrary.className = "ap-tab" + (onLibrary ? " ap-on" : "");
        tabHistory.className = "ap-tab" + (onLibrary ? "" : " ap-on");
        libraryBox.style.display = onLibrary ? "" : "none";
        historyBox.style.display = onLibrary ? "none" : "";
        if (!onLibrary) renderHistory();
      }
      tabLibrary.addEventListener("click", function () { showTab("library"); });
      tabHistory.addEventListener("click", function () { showTab("history"); });

      function setStatus(text) {
        statusText.textContent = text || "";
      }

      function refreshSessions() {
        return fetchJson(STATE_PATH).then(function (data) {
          sessions = (data && data.sessions) || [];
          if (sessions.length === 0) {
            sessionSelect.replaceChildren();
            sessionSelect.appendChild(el("option", { value: "default" }, ["default"]));
            currentSession = "default";
            return;
          }
          var active = currentSession;
          var exists = sessions.some(function (s) { return s.id === active; });
          if (!exists) active = sessions[0].id;
          sessionSelect.replaceChildren();
          sessions.forEach(function (s) {
            var label = s.id === "default" ? "默认会话" : "会话 " + s.id.slice(0, 8);
            var option = el("option", { value: s.id }, [label + "（" + s.paperCount + " 篇）"]);
            option.selected = s.id === active;
            sessionSelect.appendChild(option);
          });
          currentSession = active;
          if (sessions.length > 0) {
            var mostRecent = sessions.reduce(function (a, b) { return (b.updatedAt > a.updatedAt ? b : a); }, sessions[0]);
            badge.style.display = mostRecent.paperCount > 0 ? "" : "none";
            badge.textContent = String(mostRecent.paperCount);
          }
        });
      }

      sessionSelect.addEventListener("change", function () {
        currentSession = sessionSelect.value;
        refreshLibrary();
      });

      function renderPaperList(papers) {
        libraryBox.replaceChildren();
        if (!papers || papers.length === 0) {
          libraryBox.appendChild(el("div", { class: "ap-note" }, ["文献库为空。对模型说「帮我检索关于 XX 的论文」并把结果加入文献库，就会出现在这里。"]));
          return;
        }
        papers.forEach(function (paper) {
          var item = el("div", { class: "ap-item" });
          var title = el("div", { class: "ap-item-title", title: "点击查看详情" }, [paper.title || "(无标题)"]);
          item.appendChild(title);
          var metaParts = [];
          if (paper.authors && paper.authors.length) metaParts.push(paper.authors.slice(0, 3).join(", ") + (paper.authors.length > 3 ? " 等" : ""));
          if (paper.year) metaParts.push(String(paper.year));
          if (paper.journal) metaParts.push(paper.journal);
          metaParts.push(paper.source === "arxiv" ? "arXiv" : "S2");
          item.appendChild(el("div", { class: "ap-meta" }, [metaParts.join(" · ")]));
          var detail = el("div", { class: "ap-detail", style: "display:none;" }, []);
          var detailLines = [];
          detailLines.push("ID: " + paper.id);
          if (paper.doi) detailLines.push("DOI: " + paper.doi);
          if (paper.arxivId) detailLines.push("arXiv: " + paper.arxivId);
          if (paper.citationCount !== undefined && paper.citationCount !== null) detailLines.push("被引: " + paper.citationCount);
          if (paper.pdfUrl) detailLines.push("PDF: " + paper.pdfUrl);
          if (paper.officialUrl) detailLines.push("链接: " + paper.officialUrl);
          if (paper.abstract) detailLines.push("摘要: " + paper.abstract);
          detail.textContent = detailLines.join("\n");
          item.appendChild(detail);
          var actions = el("div", { class: "ap-actions" });
          var btnDetail = el("button", { class: "ap-ghost" }, ["详情"]);
          btnDetail.addEventListener("click", function () {
            detail.style.display = detail.style.display === "none" ? "" : "none";
          });
          var btnRemove = el("button", { class: "ap-danger" }, ["移除"]);
          btnRemove.addEventListener("click", function () {
            fetchJson(REMOVE_PATH, "POST", { session: currentSession, paperId: paper.id })
              .then(function () { return refreshLibrary(); })
              .catch(function (error) { setStatus("移除失败：" + error.message); });
          });
          actions.append(btnDetail, btnRemove);
          item.appendChild(actions);
          libraryBox.appendChild(item);
        });
      }

      function refreshLibrary() {
        return fetchJson(LIBRARY_PATH + "?session=" + encodeURIComponent(currentSession))
          .then(function (data) {
            renderPaperList(data.library);
            setStatus((data.library || []).length + " 篇");
          })
          .catch(function (error) {
            libraryBox.replaceChildren(el("div", { class: "ap-note" }, ["加载文献库失败：" + error.message]));
            setStatus("");
          });
      }

      function renderHistory() {
        return fetchJson(LIBRARY_PATH + "?session=" + encodeURIComponent(currentSession))
          .then(function (data) {
            historyBox.replaceChildren();
            var history = data.history || [];
            if (history.length === 0) {
              historyBox.appendChild(el("div", { class: "ap-note" }, ["暂无检索历史。"]));
              return;
            }
            history.slice().reverse().forEach(function (entry) {
              var when = new Date(entry.timestamp).toLocaleTimeString();
              historyBox.appendChild(el("div", { class: "ap-history-item" }, [
                "「" + entry.keyword + "」 命中 " + entry.resultCount + " 条 · " + when,
              ]));
            });
          })
          .catch(function (error) {
            historyBox.replaceChildren(el("div", { class: "ap-note" }, ["加载检索历史失败：" + error.message]));
          });
      }

      function showExport(format) {
        fetchText(EXPORT_PATH + "?session=" + encodeURIComponent(currentSession) + "&format=" + format)
          .then(function (content) {
            exportArea.value = content.length > EXPORT_LIMIT ? content.slice(0, EXPORT_LIMIT) + "\n…（内容过长已截断）" : content;
            exportBox.style.display = "";
            setStatus(format === "markdown" ? "Markdown 已导出" : "BibTeX 已导出");
          })
          .catch(function (error) {
            setStatus("导出失败：" + error.message);
          });
      }

      btnClear.addEventListener("click", function () {
        if (!window.confirm("确定清空当前会话文献库吗？")) return;
        fetchJson(CLEAR_PATH, "POST", { session: currentSession })
          .then(function () { return refreshAll(); })
          .catch(function (error) { setStatus("清空失败：" + error.message); });
      });
      btnExportBib.addEventListener("click", function () { showExport("bibtex"); });
      btnExportMd.addEventListener("click", function () { showExport("markdown"); });

      exportCopy.addEventListener("click", function () {
        exportArea.select();
        try {
          document.execCommand("copy");
          setStatus("已复制到剪贴板");
        } catch (error) {
          setStatus("复制失败，请手动 Ctrl+C");
        }
      });

      function refreshAll() {
        applyScheme();
        refreshSessions()
          .then(function () {
            if (tabLibrary.className.indexOf("ap-on") !== -1) return refreshLibrary();
            return renderHistory();
          })
          .catch(function (error) {
            setStatus("面板数据加载失败：" + error.message);
          });
      }

      // ---- 主题实时跟随：GUI 切换浅色/深色时同步换肤 ----
      var themeObserver = null;
      var themeMql = null;
      var themeTimer = null;

      function applyScheme() {
        var s = computeScheme();
        host.classList.toggle("ap-light", s === "light");
        host.classList.toggle("ap-dark", s === "dark");
      }

      function scheduleScheme() {
        if (themeTimer !== null) clearTimeout(themeTimer);
        themeTimer = setTimeout(applyScheme, 120);
      }

      function startThemeWatch() {
        applyScheme();
        try {
          themeMql = window.matchMedia("(prefers-color-scheme: dark)");
          if (themeMql && typeof themeMql.addEventListener === "function") {
            themeMql.addEventListener("change", scheduleScheme, { passive: true });
          }
        } catch (e) { themeMql = null; }
        try {
          themeObserver = new MutationObserver(scheduleScheme);
          themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
          if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
        } catch (e) { themeObserver = null; }
      }

      function stopThemeWatch() {
        if (themeTimer !== null) { clearTimeout(themeTimer); themeTimer = null; }
        if (themeMql && typeof themeMql.removeEventListener === "function") {
          try { themeMql.removeEventListener("change", scheduleScheme); } catch (e) { /* 忽略 */ }
          themeMql = null;
        }
        if (themeObserver) {
          try { themeObserver.disconnect(); } catch (e) { /* 忽略 */ }
          themeObserver = null;
        }
      }

      // ---- 挂载与清理 ----
      var disposed = false;
      var mounted = false;
      var pollTimer = null;

      function mount() {
        if (disposed || mounted) return;
        mounted = true;
        startThemeWatch();
        if (!style.parentNode) document.head.appendChild(style);
        if (document.body) document.body.appendChild(host);
        else document.addEventListener("DOMContentLoaded", function () {
          if (!disposed) document.body.appendChild(host);
        }, { once: true });
        syncHidden();
        pollTimer = setInterval(function () {
          if (disposed) return;
          if (!hidden && document.contains(host)) refreshAll();
        }, POLL_MS);
      }

      function dispose() {
        if (disposed) return;
        disposed = true;
        stopThemeWatch();
        if (pollTimer !== null) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        if (host.parentNode) host.parentNode.removeChild(host);
        else host.remove();
        if (style.parentNode) style.parentNode.removeChild(style);
        else style.remove();
      }

      var effect = (ctx !== null && typeof ctx === "object" && typeof ctx.effect === "function") ? ctx.effect : null;
      if (effect) {
        effect(function () {
          mount();
          return dispose;
        }, NAME + ": 侧边面板 DOM/样式/轮询（fiber 清理）");
        return;
      }
      // 兼容兜底：宿主未提供 ctx.effect 时按旧约定立即挂载并返回 disposer。
      mount();
      return dispose;
    }

    module.exports = { name: NAME, apply: apply };
    return module.exports;
  },
});
