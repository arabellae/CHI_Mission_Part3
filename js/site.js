/* Shared header (grouped nav, sun | moon switch) and the reading guide On | Off setting. No build step; all paths are relative. */
(function () {

  var NAV = [
    { href: "index.html", label: "Home" },
    { label: "Understand", items: [["short-version.html", "Short Version"], ["study.html", "The Study"], ["findings.html", "What They Found"], ["cautions.html", "Be Cautious"]] },
    { href: "read.html", label: "Read the Paper" },
    { label: "Reference", items: [["glossary.html", "Glossary"], ["downloads.html", "Downloads and Credit"]] }
  ];
  var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>';
  var BARS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

  var root = document.documentElement;
  var file = (location.pathname.split("/").pop() || "index.html");

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

  /* Guide setting: both states shown, current one marked. Default is on. */
  var KEY = "guide-on";
  function getGuide() { try { return localStorage.getItem(KEY) !== "0"; } catch (e) { return true; } }
  function setGuide(on) { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {} apply(on); }
  function apply(on) {
    document.body.classList.toggle("guide-off", !on);
    document.querySelectorAll("[data-guide-set]").forEach(function (b) {
      b.setAttribute("aria-pressed", (b.getAttribute("data-guide-set") === "on") === on ? "true" : "false");
    });
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
  header.innerHTML = '<div class="inner"><div class="top"><a class="brand" href="index.html">Touching Emotions, Smelling Shapes: A Reading Guide</a>' +
    '<div class="tools"><div class="seg" role="group" aria-label="Color mode">' +
    '<button type="button" data-theme-set="light" aria-pressed="false" aria-label="Light mode">' + SUN + '</button>' +
    '<button type="button" data-theme-set="dark" aria-pressed="false" aria-label="Dark mode">' + MOON + "</button></div>" +
    '<button type="button" class="btn-sm burger" id="burger" aria-expanded="false" aria-controls="nav-list">' + BARS + '<span class="sr-only">Menu</span></button></div></div>' +
    '<nav class="main" aria-label="Main"><ul id="nav-list">' + list + "</ul></nav></div>";
  document.body.insertBefore(header, document.body.firstChild);

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
  apply(getGuide());
})();
