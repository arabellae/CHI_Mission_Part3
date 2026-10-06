/* Renders the glossary from data/glossary.json. A link from the paper (?from=read&page=N#term-id) scrolls to the entry,
   outlines it, and offers buttons back to the same page of the paper. */
(function () {
  var dl = document.getElementById("entries");
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }
  fetch("data/glossary.json").then(function (r) { return r.json(); }).then(function (data) {
    dl.textContent = "";
    data.terms.forEach(function (t) {
      var wrap = el("div", { "class": "entry", id: t.id, tabindex: "-1" });
      wrap.appendChild(el("dt", {}, t.term));
      wrap.appendChild(el("dd", {}, t.definition));
      dl.appendChild(wrap);
    });
    Site.setContext("Glossary – " + data.terms.length + " terms", "#dcdce1|#5b5b66");
    var params = new URLSearchParams(location.search);
    var page = parseInt(params.get("page"), 10);
    if (params.get("from") === "read" && page >= 1 && page <= 14) {
      var bar = document.getElementById("backbar");
      bar.hidden = false;
      bar.appendChild(el("a", { "class": "btn secondary", href: "read.html#page=" + page }, "← Back to Page " + page));
      Site.setCta("Back to reading", "read.html#page=" + page);
    }
    var id = decodeURIComponent(location.hash.slice(1));
    var target = id && document.getElementById(id);
    if (target) {
      target.classList.add("hit");
      target.scrollIntoView({ block: "center" });
      target.focus({ preventScroll: true });
    }
  }).catch(function () {
    dl.textContent = "";
    dl.appendChild(el("dt", {}, "The glossary could not be loaded."));
  });
})();
