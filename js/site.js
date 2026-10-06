/* Shared top bar (title, where you are, one black button, page links, sun | moon switch) and the reading guide On | Off setting.
   No build step; all paths are relative. Pages can set the middle label and the button with data attributes on <body>:
   data-ctx="Glossary - 13 terms"  data-ctx-swatch="all | doc | #fill|#edge"  data-cta-label="..."  data-cta-href="..."  data-cta-download */
(function () {

  var NAV = [
    { href: "index.html", label: "Home" },
    { label: "Understand", items: [["short-version.html", "Short Version · 3 Min"], ["study.html", "How the Study Worked"], ["findings.html", "What the Children Found"], ["cautions.html", "How Much to Trust It"]] },
    { href: "read.html", label: "Read the Paper" },
    { label: "Reference", items: [["glossary.html", "Glossary"], ["downloads.html", "Downloads and Credit"]] }
  ];
  var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>';
  var BARS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  var DOC = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M5 6h10M5 10h10M5 14h6"/></svg>';
  var ALL = ["#dcdce1", "#c4e3ff", "#cdf3c6", "#ffd3e6", "#e4d6fb", "#ffddaa", "#b3121a"];

  var root = document.documentElement;
  var file = (location.pathname.split("/").pop() || "index.html");
  var ds = document.body.dataset;

  /* Color mode: a saved choice wins, otherwise the system setting. Storage can fail, so every access is guarded. */
  function currentTheme() {
    var t = root.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function setTheme(t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("theme", t); } catch (e) {}
    syncTheme();
  }
  function syncTheme() {
    var t = currentTheme();
    document.querySelectorAll("[data-theme-set]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-theme-set") === t ? "true" : "false");
    });
  }

  /* Guide setting: on or off, shown by a switch (and by any On | Off buttons). Default is on. */
  var KEY = "guide-on";
  function getGuide() { try { return localStorage.getItem(KEY) !== "0"; } catch (e) { return true; } }
  function setGuide(on) { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {} apply(on); }
  function apply(on) {
    document.body.classList.toggle("guide-off", !on);
    document.querySelectorAll("[data-guide-set]").forEach(function (b) {
      b.setAttribute("aria-pressed", (b.getAttribute("data-guide-set") === "on") === on ? "true" : "false");
    });
    document.querySelectorAll("[data-guide-switch]").forEach(function (b) { b.setAttribute("aria-checked", on ? "true" : "false"); });
    document.dispatchEvent(new CustomEvent("guidechange", { detail: { on: on } }));
  }
  window.Guide = { get: getGuide, set: setGuide };

  /* Header */
  var list = NAV.map(function (n, i) {
    if (n.items) {
      var cur = n.items.some(function (x) { return x[0] === file; });
      var links = n.items.map(function (x) {
        return '<li><a href="' + x[0] + '"' + (x[0] === file ? ' aria-current="page"' : "") + ">" + x[1] + "</a></li>";
      }).join("");
      return '<li class="dd' + (cur ? " cur" : "") + '"><button type="button" aria-expanded="false" aria-haspopup="true" aria-controls="menu' + i + '">' + n.label + '</button><ul class="menu" id="menu' + i + '">' + links + "</ul></li>";
    }
    return '<li><a href="' + n.href + '"' + (n.href === file ? ' aria-current="page"' : "") + ">" + n.label + "</a></li>";
  }).join("");

  var header = document.createElement("header");
  header.className = "site";
  header.innerHTML = '<div class="inner"><div class="top"><a class="brand" href="index.html">Touching Emotions, Smelling Shapes</a>' +
    '<div class="ctx"><span class="ctx-sw" id="ctx-sw" aria-hidden="true"></span><span class="ctx-text" id="ctx-text"></span></div>' +
    '<div class="tools"><a class="btn" id="cta" href="read.html"></a><div class="seg" role="group" aria-label="Color mode">' +
    '<button type="button" data-theme-set="light" aria-pressed="false" aria-label="Light mode">' + SUN + '</button>' +
    '<button type="button" data-theme-set="dark" aria-pressed="false" aria-label="Dark mode">' + MOON + "</button></div>" +
    '<button type="button" class="btn-sm burger" id="burger" aria-expanded="false" aria-controls="nav-list">' + BARS + '<span class="sr-only">Menu</span></button></div></div>' +
    '<nav class="main" aria-label="Main"><ul id="nav-list">' + list + "</ul></nav></div>";
  document.body.insertBefore(header, document.body.firstChild);

  /* The middle label (with a small swatch) and the black button. Pages and scripts can change both. */
  var ctxSw = document.getElementById("ctx-sw"), ctxText = document.getElementById("ctx-text"), cta = document.getElementById("cta");
  function setContext(text, spec) {
    ctxText.textContent = text;
    spec = spec || "doc";
    ctxSw.className = "ctx-sw"; ctxSw.removeAttribute("style"); ctxSw.textContent = "";
    if (spec === "all") {
      ctxSw.classList.add("all");
      ALL.forEach(function (c) { var i = document.createElement("i"); i.style.setProperty("--f", c); ctxSw.appendChild(i); });
    } else if (spec === "doc") {
      ctxSw.classList.add("doc"); ctxSw.innerHTML = DOC;
    } else {
      var p = spec.split("|");
      ctxSw.style.setProperty("--f", p[0]); if (p[1]) ctxSw.style.setProperty("--e", p[1]);
    }
  }
  function setCta(label, href, download) {
    cta.hidden = !label;
    cta.textContent = label || "";
    if (href) cta.setAttribute("href", href);
    if (download) cta.setAttribute("download", ""); else cta.removeAttribute("download");
  }
  setContext(ds.ctx || document.title.split(" | ")[0], ds.ctxSwatch);
  setCta(ds.ctaLabel != null ? ds.ctaLabel : (file === "read.html" ? "" : "Read the Paper"), ds.ctaHref || "read.html", ds.ctaDownload != null);
  window.Site = { setContext: setContext, setCta: setCta };

  header.querySelectorAll("[data-theme-set]").forEach(function (b) {
    b.addEventListener("click", function () { setTheme(b.getAttribute("data-theme-set")); });
  });
  syncTheme();

  var nav = header.querySelector("nav.main");
  var burger = document.getElementById("burger");
  burger.addEventListener("click", function () {
    var open = !nav.classList.contains("open");
    nav.classList.toggle("open", open); burger.setAttribute("aria-expanded", open ? "true" : "false");
  });
  function closeMenus(except) {
    header.querySelectorAll(".dd.open").forEach(function (d) {
      if (d !== except) { d.classList.remove("open"); d.querySelector("button").setAttribute("aria-expanded", "false"); }
    });
  }
  header.querySelectorAll(".dd > button").forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      var d = b.parentNode, open = !d.classList.contains("open");
      closeMenus(d); d.classList.toggle("open", open); b.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });
  document.addEventListener("click", function () { closeMenus(null); });
  header.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var openDd = header.querySelector(".dd.open");
      closeMenus(null);
      if (openDd) openDd.querySelector("button").focus();
      else if (nav.classList.contains("open")) { nav.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); burger.focus(); }
    }
  });

  var skip = document.createElement("a");
  skip.className = "skip"; skip.href = "#main"; skip.textContent = "Skip to Content";
  document.body.insertBefore(skip, document.body.firstChild);


  var main = document.querySelector("main");
  if (main && !main.id) main.id = "main";

  document.querySelectorAll("[data-guide-set]").forEach(function (b) {
    b.addEventListener("click", function () { setGuide(b.getAttribute("data-guide-set") === "on"); });
  });
  document.querySelectorAll("[data-guide-switch]").forEach(function (b) {
    b.addEventListener("click", function () { setGuide(!getGuide()); });
  });
  apply(getGuide());

  /* "On this page" list. The current row is the last heading above a reading line near the top of the window.
     A click marks its row at once. Extra space after the last section lets every heading reach the top, so no link looks dead. */
  var toc = Array.prototype.slice.call(document.querySelectorAll(".sv-toc a"));
  if (toc.length) {
    var READ_LINE = 120;
    var canvas = document.querySelector(".sv-canvas");
    var items = toc.map(function (a) { return { a: a, t: document.getElementById(a.getAttribute("href").slice(1)) }; }).filter(function (x) { return x.t; });
    var spy = items.filter(function (x) { return canvas && canvas.contains(x.t); });
    var mark = function (it) { items.forEach(function (x) { if (x === it) x.a.setAttribute("aria-current", "true"); else x.a.removeAttribute("aria-current"); }); };
    var pinUntil = 0;
    var update = function () {
      if (!spy.length || Date.now() < pinUntil) return;
      var cur = spy[0];
      spy.forEach(function (x) { if (x.t.getBoundingClientRect().top <= READ_LINE + 1) cur = x; });
      if (window.innerHeight + window.pageYOffset >= document.documentElement.scrollHeight - 2) cur = spy[spy.length - 1];
      mark(cur);
    };
    var sizePad = function () {
      if (!canvas || !spy.length) return;
      canvas.style.paddingBottom = "";
      var last = spy[spy.length - 1].t;
      var lastTop = last.getBoundingClientRect().top + window.pageYOffset;
      var m = document.querySelector("main");
      var contentBottom = canvas.getBoundingClientRect().bottom + window.pageYOffset + parseFloat(getComputedStyle(m).paddingBottom);
      var extra = Math.max(0, lastTop - 18 + window.innerHeight - contentBottom);
      if (extra > 0) canvas.style.paddingBottom = "calc(2.6rem + " + Math.ceil(extra) + "px)";
    };
    items.forEach(function (x) {
      x.a.addEventListener("click", function () {
        mark(x);
        if (!(canvas && canvas.contains(x.t))) { pinUntil = Date.now() + 900; x.t.setAttribute("tabindex", "-1"); x.t.focus({ preventScroll: true }); }
        else pinUntil = 0;
      });
    });
    sizePad(); update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", function () { sizePad(); update(); });
    window.addEventListener("load", function () { sizePad(); update(); });
  }
})();
