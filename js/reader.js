/* Shows the paper itself (PDF.js) with the reading guide drawn on top of the real page, plus glossary links and reader notes. */
import * as pdfjsLib from "../vendor/pdfjs/pdf.min.js";
import { Notes, mountPanel, colorOf } from "./notes.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.js", import.meta.url).href;

const PDF_URL = "pdfs/touching-emotions-original.pdf";
const $ = (id) => document.getElementById(id);
const reader = $("reader"), stage = $("stage"), sheet = $("sheet"), canvas = $("canvas");
const textLayer = $("text-layer"), hlLayer = $("hl-layer"), noteLayer = $("note-layer"), pinLayer = $("pin-layer"), focusLayer = $("focus-layer"), glLayer = $("gl-layer");
const tip = $("tip"), pop = $("popover");
const state = { doc: null, data: null, gloss: null, cats: {}, byId: {}, termById: {}, page: 1, zoom: 1, active: new Set(), token: 0, sel: null, lastKey: "", fs: false, cursorPid: null };
let chain = Promise.resolve();

// Which section each PDF page belongs to (used by the scrubber). Pages that hold two sections are named for the first.
const PAGE_SECTION = ["Abstract", "Intro", "Background", "Background", "Study", "Study", "Findings", "Findings", "Findings", "Discussion", "Discussion", "Wrap-Up", "References", "References"];
// The seven question tiles, in rows of four. The eighth tile (All seven) clears the filters.
const KEY_ORDER = ["G", "B", "S", "R", "E", "I", "U"];

function el(tag, attrs, text) {
  const e = document.createElement(tag);
  Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
  if (text != null) e.textContent = text;
  return e;
}
const pct = (v) => (v * 100).toFixed(3) + "%";
const clamp = (v) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;
const toHost = (x, y) => { const r = reader.getBoundingClientRect(); return { x: x - r.left, y: y - r.top }; };

/* ---------- tooltips and the glossary pop-up ---------- */
let tipPinned = false;
function placeNear(node, x, y) {
  const r = reader.getBoundingClientRect();
  const w = node.offsetWidth || 240;
  node.style.left = Math.max(4, Math.min(x - r.left - 16, r.width - w - 4)) + "px";
  node.style.top = (y - r.top + 14) + "px";
}
function showTip(cat, x, y, pinned, onAdd) {
  tip.textContent = "";
  tip.appendChild(el("b", {}, cat.name));
  tip.appendChild(document.createTextNode(cat.plain_question));
  tip.appendChild(el("br"));
  tip.appendChild(el("span", {}, cat.explain));
  if (onAdd) {
    const b = el("button", { type: "button", "class": "btn-sm" }, "Add Note on This Highlight");
    b.addEventListener("click", (e) => { e.stopPropagation(); hideTip(true); onAdd(x, y); });
    tip.appendChild(el("br")); tip.appendChild(b);
  }
  tip.classList.toggle("pinned", !!pinned);
  tip.style.pointerEvents = pinned ? "auto" : "none";
  tip.style.display = "block";
  tipPinned = !!pinned;
  placeNear(tip, x, y);
}
function showTermTip(t, x, y, pinned, focusIt) {
  const term = state.termById[t.term];
  tip.textContent = "";
  tip.appendChild(el("b", {}, term.term));
  if (pinned) {
    tip.appendChild(el("span", {}, term.definition));
    const acts = el("div", { "class": "acts" });
    const go = el("button", { type: "button", "class": "btn-sm" }, "Go to Glossary Entry");
    go.addEventListener("click", (e) => { e.stopPropagation(); location.href = "glossary.html?from=read&page=" + state.page + "#" + term.id; });
    const cl = el("button", { type: "button", "class": "btn-sm" }, "Close");
    cl.addEventListener("click", (e) => { e.stopPropagation(); hideTip(true); });
    acts.append(go, cl); tip.appendChild(acts);
  } else {
    tip.appendChild(el("span", {}, "Glossary word. Click for the meaning."));
  }
  tip.classList.toggle("pinned", !!pinned);
  tip.style.pointerEvents = pinned ? "auto" : "none";
  tip.style.display = "block";
  tipPinned = !!pinned;
  placeNear(tip, x, y);
  if (pinned && focusIt) { const b = tip.querySelector("button"); if (b) b.focus({ preventScroll: true }); }
}
function hideTip(force) {
  if (tipPinned && !force) return;
  tip.style.display = "none"; tipPinned = false;
  sheet.querySelectorAll(".hl.on, .term.on").forEach((h) => h.classList.remove("on"));
}
// Tooltips from the key sit by the key, not over the paper, so they use their own floating box.
const keyTip = el("div", { "class": "tip", role: "tooltip", style: "position:fixed;z-index:90" });
document.body.appendChild(keyTip);
function showKeyTip(cat, node) {
  keyTip.textContent = "";
  keyTip.appendChild(el("b", {}, cat.name)); keyTip.appendChild(document.createTextNode(cat.plain_question));
  keyTip.appendChild(el("br")); keyTip.appendChild(el("span", {}, cat.explain));
  keyTip.style.display = "block";
  const r = node.getBoundingClientRect(), w = keyTip.offsetWidth;
  keyTip.style.left = Math.max(8, r.left - w - 8) + "px";
  keyTip.style.top = Math.max(8, Math.min(r.top, window.innerHeight - keyTip.offsetHeight - 8)) + "px";
}
const hideKeyTip = () => { keyTip.style.display = "none"; };

/* ---------- key and filters ---------- */
function toggleActive(k, btn) {
  if (state.active.has(k)) state.active.delete(k); else state.active.add(k);
  btn.setAttribute("aria-pressed", state.active.has(k) ? "true" : "false");
  onFilterChange();
}
/* Each tile is a color with its name written on it, so the key never depends on color alone. */
function buildKey() {
  const host = $("key-groups");
  KEY_ORDER.forEach((k) => {
    const c = state.cats[k];
    const b = el("button", { type: "button", "class": "keyitem tile" + (k === "U" ? " u" : ""), "data-k": k, "aria-pressed": "false" });
    b.style.setProperty("--f", c.color); b.style.setProperty("--e", c.edge);
    b.append(el("span", { "class": "tl" }, c.label), el("span", { "class": "sr-only" }, ". " + c.plain_question + " " + c.explain));
    b.addEventListener("click", () => toggleActive(k, b));
    b.addEventListener("mouseenter", () => showKeyTip(c, b)); b.addEventListener("focus", () => showKeyTip(c, b));
    b.addEventListener("mouseleave", hideKeyTip); b.addEventListener("blur", hideKeyTip);
    host.appendChild(b);
  });
  const all = el("button", { type: "button", "class": "keyitem tile all", "data-all": "1", "aria-pressed": "true" });
  KEY_ORDER.forEach((k, i) => all.style.setProperty("--c" + (i + 1), state.cats[k].color));
  all.append(el("span", { "class": "tl" }, "All Seven"), el("span", { "class": "sr-only" }, ". Show every highlight."));
  all.addEventListener("click", clearFilters);
  host.appendChild(all);
  syncKey();
}
/* Keep the tiles, the label under them and the bar's middle label in step with the active filters. */
function syncKey() {
  document.querySelectorAll(".keyitem[data-k]").forEach((b) => b.setAttribute("aria-pressed", state.active.has(b.dataset.k) ? "true" : "false"));
  const grid = $("key-groups");
  if (grid) grid.classList.toggle("filtered", state.active.size > 0);
  const all = document.querySelector(".keyitem[data-all]");
  if (all) all.setAttribute("aria-pressed", state.active.size ? "false" : "true");
  const label = $("key-label"), desc = $("key-desc");
  const keys = [...state.active];
  if (!keys.length) {
    label.textContent = "All Seven Questions";
    desc.textContent = "Every highlight is showing. Press a color to show only that question.";
    Site.setContext("Reading Lens – All Seven Questions", "all");
  } else if (keys.length === 1) {
    const c = state.cats[keys[0]], mine = keys[0].startsWith("c:") ? Notes.categories().find((x) => "c:" + x.id === keys[0]) : null;
    label.textContent = c ? c.plain_question : (mine ? mine.name : "One Category");
    desc.textContent = c ? c.explain : "Showing only your notes in this category.";
    Site.setContext("Reading Lens – " + label.textContent, c ? c.color + "|" + c.edge : "doc");
  } else {
    label.textContent = keys.length + " Questions";
    desc.textContent = "Showing only the colors you pressed. Press All Seven to see everything.";
    Site.setContext("Reading Lens – " + keys.length + " Questions", "all");
  }
}
function renderCustomKey() {
  const host = $("key-custom");
  host.textContent = "";
  const cats = Notes.categories();
  if (!cats.length) return;
  host.appendChild(el("h3", {}, "My categories"));
  cats.forEach((c) => {
    const col = colorOf(c.color), k = "c:" + c.id;
    const b = el("button", { type: "button", "class": "keyitem", "data-k": k, "aria-pressed": state.active.has(k) ? "true" : "false" });
    const sw = el("span", { "class": "sw", "aria-hidden": "true" });
    sw.style.setProperty("--f", col.fill); sw.style.setProperty("--e", col.edge);
    b.append(sw, el("span", {}, c.name));
    b.addEventListener("click", () => toggleActive(k, b));
    host.appendChild(b);
  });
}
const visible = (p) => !state.active.size || state.active.has(p.category);
const noteVisible = (n) => !state.active.size || (Notes.filterKey(n) !== null && state.active.has(Notes.filterKey(n)));
function onFilterChange() { syncKey(); applyFilter(); drawNotes(); Notes.setFilter(noteVisible); clearTimeout(noticeTimer); noticeActive = false; refreshStatus(); }
function applyFilter() {
  hlLayer.querySelectorAll(".hl").forEach((h) => h.classList.toggle("dim", !visible(state.byId[h.dataset.pid])));
  focusLayer.querySelectorAll(".focus-hl").forEach((f) => f.setAttribute("tabindex", visible(state.byId[f.dataset.pid]) ? "0" : "-1"));
  const n = pagePassages().filter(visible).length;
  $("hl-n").textContent = String(n); $("hl-t").textContent = "on this page" + (state.active.size ? " (filtered)" : "");
}
const pagePassages = () => state.data.passages.filter((p) => p.page === state.page);
const pageTerms = () => state.gloss.occurrences.filter((o) => o.page === state.page);

/* ---------- page rendering ---------- */
function schedule(n, opts) {
  state.page = n;
  const t = ++state.token;
  // A new request cancels the render in progress so a stalled or slow page never blocks turning pages.
  try { if (state.task) state.task.cancel(); if (state.tl) state.tl.cancel(); } catch (e) {}
  chain = chain.then(() => renderPage(n, t, opts || {})).catch((e) => { console.error(e); setStatus("This page could not be shown. " + e.message, true); });
}
/* Status strip under the toolbar: load problems, short notices (with optional buttons), and the active filters. */
let noticeTimer, noticeActive = false;
function renderStatus(text, actions, err) {
  const s = $("status");
  s.textContent = ""; s.className = "status" + (err ? " err" : "");
  if (text) s.appendChild(el("span", {}, text));
  (actions || []).forEach((a) => {
    const b = el("button", { type: "button", "class": "btn-sm" }, a.label);
    b.addEventListener("click", a.run);
    s.appendChild(b);
  });
}
function filterMessage() {
  if (!state.active.size) return null;
  const names = [...state.active].map((k) => k.startsWith("c:") ? (Notes.categories().find((c) => "c:" + c.id === k) || {}).name : state.cats[k] && state.cats[k].name).filter(Boolean);
  return { text: "Showing only: " + names.join(", ") + ".", actions: [{ label: "Clear Filters", run: clearFilters }] };
}
function refreshStatus() { if (noticeActive) return; const f = filterMessage(); if (f) renderStatus(f.text, f.actions); else renderStatus(""); }
function notify(text, actions) { clearTimeout(noticeTimer); noticeActive = true; renderStatus(text, actions); noticeTimer = setTimeout(() => { noticeActive = false; refreshStatus(); }, 8000); }
function setStatus(msg, err) { clearTimeout(noticeTimer); noticeActive = false; renderStatus(msg, [], err); }
function clearFilters() {
  state.active.clear();
  onFilterChange();
}

async function renderPage(n, token, opts) {
  if (token !== state.token) return;
  const page = await state.doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  state.lastKey = layoutKey();
  let scale;
  if (state.fs) {
    const col = rgrid.querySelector(".a-paper").clientWidth;
    const availW = Math.max(col - (window.innerWidth > 1100 ? 120 : 0), 200);
    const availH = window.innerWidth > 1100 ? window.innerHeight - 2 : Infinity;
    scale = Math.min(availW / base.width, availH / base.height) * state.zoom;
  } else {
    const avail = Math.min(Math.max(stage.clientWidth - 6, 240), 900);
    scale = (avail / base.width) * state.zoom;
  }
  const vp = page.getViewport({ scale });
  const dpr = window.devicePixelRatio || 1;
  sheet.style.width = vp.width + "px"; sheet.style.height = vp.height + "px";
  sheet.style.setProperty("--scale-factor", String(scale));
  canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
  [textLayer, hlLayer, noteLayer, glLayer, pinLayer, focusLayer].forEach((l) => l.replaceChildren());
  const task = page.render({ canvasContext: canvas.getContext("2d"), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
  const tl = new pdfjsLib.TextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport: vp });
  state.task = task; state.tl = tl;
  try { await Promise.all([task.promise, tl.render()]); }
  catch (e) { if (token !== state.token) return; throw e; } // a cancelled render is expected when the reader moves on
  if (token !== state.token) return;
  drawHighlights(); drawTerms(); drawNotes(); updatePager(); updateGuideText(); renderTerms();
  refreshStatus();
  if (opts.focusHl) {
    const f = focusLayer.querySelector('.focus-hl[data-pid="' + opts.focusHl + '"]');
    if (f) { f.scrollIntoView({ block: "center" }); f.focus({ preventScroll: true }); }
  } else if (opts.focusNote) {
    const pin = pinLayer.querySelector('[data-note="' + opts.focusNote + '"]');
    if (pin) { pin.scrollIntoView({ block: "center" }); pin.focus({ preventScroll: true }); }
  } else if (opts.scroll) {
    $("toolbar").scrollIntoView({ block: "start" });
  }
}

function drawHighlights() {
  pagePassages().forEach((p) => {
    const c = state.cats[p.category];
    p.rects.forEach((r) => {
      const d = el("div", { "class": "hl" + (p.category === "U" ? " u" : ""), "data-pid": p.id });
      d.style.cssText = "left:" + pct(r[0]) + ";top:" + pct(r[1]) + ";width:" + pct(r[2] - r[0]) + ";height:" + pct(r[3] - r[1]) + ";--f:" + c.color + ";--e:" + c.edge;
      hlLayer.appendChild(d);
    });
    const f = el("button", { type: "button", "class": "focus-hl", "data-pid": p.id, "aria-label": "Highlight, " + c.name + ": " + p.text });
    f.style.left = pct(p.rects[0][0]); f.style.top = pct(p.rects[0][1]);
    f.addEventListener("focus", () => { state.cursorPid = p.id; const b = f.getBoundingClientRect(); showTip(c, b.left, b.bottom, false); markOn(p.id, true); });
    f.addEventListener("blur", () => { hideTip(); markOn(p.id, false); });
    f.addEventListener("click", () => { const b = f.getBoundingClientRect(); showTip(c, b.left, b.bottom, true, (x, y) => addNoteForPassage(p, x, y)); });
    focusLayer.appendChild(f);
  });
  applyFilter();
}
function markOn(pid, on) { hlLayer.querySelectorAll('[data-pid="' + pid + '"]').forEach((h) => h.classList.toggle("on", on)); }

function drawTerms() {
  pageTerms().forEach((t, i) => {
    t.rects.forEach((r) => {
      const d = el("div", { "class": "term", "data-ti": String(i) });
      d.style.cssText = "left:" + pct(r[0]) + ";top:" + pct(r[1]) + ";width:" + pct(r[2] - r[0]) + ";height:" + pct(r[3] - r[1]);
      glLayer.appendChild(d);
    });
    const term = state.termById[t.term];
    const f = el("button", { type: "button", "class": "focus-term", "aria-label": "Glossary word: " + term.term + ". Press Enter for the meaning." });
    f.style.left = pct(t.rects[0][0]); f.style.top = pct(t.rects[0][1]);
    f.addEventListener("click", () => { const b = f.getBoundingClientRect(); showTermTip(t, b.left, b.bottom, true, true); });
    focusLayer.appendChild(f);
  });
}
function termOn(i, on) { glLayer.querySelectorAll('[data-ti="' + i + '"]').forEach((h) => h.classList.toggle("on", on)); }

function drawNotes() {
  noteLayer.replaceChildren(); pinLayer.replaceChildren();
  Notes.forPage(state.page).filter(noteVisible).forEach((n) => {
    const c = colorOf(n.color), vars = "--nf:" + c.fill + ";--ne:" + c.edge;
    n.rects.forEach((r) => {
      const d = el("div", { "class": "nrect" });
      d.style.cssText = "left:" + pct(r[0]) + ";top:" + pct(r[1]) + ";width:" + pct(r[2] - r[0]) + ";height:" + pct(r[3] - r[1]) + ";" + vars;
      noteLayer.appendChild(d);
    });
    const r0 = n.rects[0] || [0.02, 0.02, 0, 0];
    const pin = el("button", { type: "button", "class": "pin", "data-note": n.id, "aria-label": "Note " + Notes.number(n.id) + ": " + n.text.slice(0, 80) }, String(Notes.number(n.id)));
    pin.style.cssText = "left:" + pct(r0[0]) + ";top:" + pct(r0[1]) + ";pointer-events:auto;" + vars;
    pin.addEventListener("click", () => Notes.flash(n.id));
    pinLayer.appendChild(pin);
  });
}

/* ---------- Look For panel, the stats note and the dotted words on this page ---------- */
function updateGuideText() {
  const pr = state.data.page_prompts[String(state.page)];
  const strip = $("strip"), stats = $("stats");
  strip.textContent = pr ? pr.prompt : "No prompt for this page. The references and acknowledgements start here.";
  strip.classList.toggle("new-section", !!(pr && pr.new_section));
  stats.hidden = !(pr && pr.stats_note);
  if (pr && pr.stats_note) stats.textContent = pr.stats_note;
}
function renderTerms() {
  const list = $("terms-list");
  list.textContent = "";
  const ids = [...new Set(pageTerms().map((t) => t.term))];
  ids.forEach((id) => {
    const t = state.termById[id], li = el("li");
    li.appendChild(el("a", { href: "glossary.html?from=read&page=" + state.page + "#" + t.id }, t.term));
    list.appendChild(li);
  });
  if (!ids.length) list.appendChild(el("li", {}, "No dotted words on this page."));
  $("gl-link").setAttribute("href", "glossary.html?from=read&page=" + state.page);
}
/* The Questions | Terms | Notes tabs: arrow keys move between them. */
function initTabs() {
  const tabs = [...document.querySelectorAll(".ptabs [role=tab]")];
  const pick = (t, focus) => {
    tabs.forEach((x) => {
      const on = x === t;
      x.setAttribute("aria-selected", on ? "true" : "false"); x.tabIndex = on ? 0 : -1;
      $(x.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) t.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => pick(t, false));
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (d) { e.preventDefault(); pick(tabs[(i + d + tabs.length) % tabs.length], true); }
      else if (e.key === "Home") { e.preventDefault(); pick(tabs[0], true); }
      else if (e.key === "End") { e.preventDefault(); pick(tabs[tabs.length - 1], true); }
    });
  });
}

/* ---------- paging: arrows, path scrubber, typed page ---------- */
const TOTAL = () => state.doc.numPages;
function sectionRuns() {
  const runs = []; let i = 0;
  while (i < TOTAL()) {
    let j = i; while (j + 1 < TOTAL() && PAGE_SECTION[j + 1] === PAGE_SECTION[i]) j++;
    runs.push({ name: PAGE_SECTION[i], from: i + 1, to: j + 1 });
    i = j + 1;
  }
  return runs;
}
function buildScrubber(sc, vertical) {
  sc.textContent = "";
  sc.appendChild(el("i", { "class": "ln", "aria-hidden": "true" }));
  sc.appendChild(el("i", { "class": "prog", "aria-hidden": "true" }));
  if (!vertical) sc.appendChild(el("span", { "class": "here", "aria-hidden": "true" }, "You are here"));
  const at = (node, p) => { if (vertical) node.style.gridRow = String(p); else node.style.gridColumn = String(p); return node; };
  for (let p = 1; p <= TOTAL(); p++) {
    const b = el("button", { type: "button", "class": "pt", "data-p": String(p), "aria-label": "Page " + p + ", " + PAGE_SECTION[p - 1], title: "Page " + p });
    b.appendChild(el("span", { "class": "dot" }));
    b.addEventListener("click", () => go(p, { scroll: false }));
    sc.appendChild(at(b, p));
    sc.appendChild(at(el("span", { "class": "num", "data-p": String(p), "aria-hidden": "true" }, String(p)), p));
  }
  let singles = 0;
  sectionRuns().forEach((r) => {
    const pages = r.from === r.to ? "page " + r.from : "pages " + r.from + " to " + r.to;
    const b = el("button", { type: "button", "class": "sec" + (r.from === r.to ? " one" + (singles++ % 2 === 0 ? " lo" : "") : ""), "data-from": String(r.from), "data-to": String(r.to), "data-name": r.name, "aria-label": r.name + ", " + pages });
    b.append(el("span", { "class": "brkt", "aria-hidden": "true" }), el("span", { "class": "lbl", "aria-hidden": "true" }, r.name));
    b.addEventListener("click", () => go(r.from, { scroll: false }));
    const span = (r.to - r.from + 1);
    if (vertical) b.style.gridRow = r.from + " / span " + span; else b.style.gridColumn = r.from + " / span " + span;
    sc.appendChild(b);
  });
}
function updatePager() {
  const n = TOTAL(), p = state.page;
  $("page-select").value = String(p);
  $("prev").disabled = p <= 1; $("next").disabled = p >= n;
  $("zoom-label").textContent = Math.round(state.zoom * 100) + "%";
  document.querySelectorAll(".scrub").forEach((sc) => {
    sc.style.setProperty("--p", String((p - 1) / (n - 1)));
    sc.querySelectorAll("button.pt").forEach((b) => {
      const bp = +b.dataset.p;
      b.classList.toggle("done", bp < p);
      if (bp === p) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    sc.querySelectorAll(".num").forEach((x) => x.classList.toggle("cur", +x.dataset.p === p));
    sc.querySelectorAll("button.sec").forEach((x) => x.classList.toggle("cur", p >= +x.dataset.from && p <= +x.dataset.to));
    const here = sc.querySelector(".here");
    if (here) here.style.left = ((p - 0.5) / n * 100) + "%";
  });
  const run = sectionRuns().find((r) => p >= r.from && p <= r.to);
  $("scrub-now").textContent = run ? run.name + ": " + (run.from === run.to ? "page " + run.from : "pages " + run.from + " to " + run.to) : "";
  try { history.replaceState(null, "", "#page=" + p); } catch (e) {}
  try { localStorage.setItem("last-page", String(p)); } catch (e) {}
}
function go(n, opts) { if (!(n >= 1 && n <= TOTAL())) return; if (!opts || !opts.focusHl) state.cursorPid = null; hideTip(true); hidePop(); schedule(n, opts); }
function goToPage(n, noteId) { go(n, { focusNote: noteId }); }

/* ---------- selection and notes ---------- */
function hidePop() { pop.style.display = "none"; state.sel = null; }
function checkSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) { hidePop(); return; }
  const range = sel.getRangeAt(0);
  if (!textLayer.contains(range.commonAncestorContainer)) { hidePop(); return; }
  const quote = sel.toString().replace(/\s+/g, " ").trim();
  if (!quote) { hidePop(); return; }
  const sr = sheet.getBoundingClientRect();
  const crs = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
  const raw = crs.map((r) => [clamp((r.left - sr.left) / sr.width), clamp((r.top - sr.top) / sr.height), clamp((r.right - sr.left) / sr.width), clamp((r.bottom - sr.top) / sr.height)]);
  const rects = mergeRects(raw);
  if (!rects.length) { hidePop(); return; }
  const last = crs[crs.length - 1];
  state.sel = { page: state.page, quote: quote.slice(0, 600), rects, x: last.right, y: last.bottom };
  pop.style.display = "flex"; placeNear(pop, last.right, last.bottom);
}
function mergeRects(rs) {
  rs.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const out = [];
  rs.forEach((r) => {
    const l = out[out.length - 1];
    if (l && Math.abs(l[1] - r[1]) < 0.006 && r[0] - l[2] < 0.02) { l[2] = Math.max(l[2], r[2]); l[1] = Math.min(l[1], r[1]); l[3] = Math.max(l[3], r[3]); }
    else out.push(r.slice());
  });
  return out;
}
function addNoteForPassage(p, x, y) {
  Notes.openComposer({ page: p.page, quote: p.text, rects: p.rects }, toHost(x, y));
}
let selTimer;
document.addEventListener("selectionchange", () => { clearTimeout(selTimer); selTimer = setTimeout(checkSelection, 200); });
$("add-note").addEventListener("mousedown", (e) => e.preventDefault());
$("add-note").addEventListener("click", () => {
  if (!state.sel) return;
  const d = state.sel; window.getSelection().removeAllRanges(); hidePop();
  Notes.openComposer({ page: d.page, quote: d.quote, rects: d.rects }, toHost(d.x, d.y));
});

/* ---------- pointer interaction on the page ---------- */
function pointNorm(e) { const r = sheet.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
const inRects = (rects, x, y) => rects.some((q) => x >= q[0] && x <= q[2] && y >= q[1] && y <= q[3]);
function hit(e) { const [x, y] = pointNorm(e); return pagePassages().find((p) => visible(p) && inRects(p.rects, x, y)); }
function hitTerm(e) { const [x, y] = pointNorm(e); const ts = pageTerms(); const i = ts.findIndex((t) => inRects(t.rects, x, y)); return i < 0 ? null : { t: ts[i], i }; }
sheet.addEventListener("mousemove", (e) => {
  if (document.body.classList.contains("guide-off") || tipPinned) return;
  glLayer.querySelectorAll(".term.on").forEach((h) => h.classList.remove("on"));
  const th = hitTerm(e);
  sheet.style.cursor = th ? "pointer" : "";
  if (th) { hlLayer.querySelectorAll(".hl.on").forEach((h) => h.classList.remove("on")); termOn(th.i, true); showTermTip(th.t, e.clientX, e.clientY, false); return; }
  const p = hit(e);
  if (!p) { hideTip(); return; }
  hlLayer.querySelectorAll(".hl.on").forEach((h) => { if (h.dataset.pid !== p.id) h.classList.remove("on"); });
  markOn(p.id, true);
  showTip(state.cats[p.category], e.clientX, e.clientY, false);
});
sheet.addEventListener("mouseleave", () => hideTip());
sheet.addEventListener("click", (e) => {
  if (document.body.classList.contains("guide-off")) return;
  const s = window.getSelection();
  if (s && !s.isCollapsed && s.toString().trim()) return;
  const th = hitTerm(e);
  if (th) { showTermTip(th.t, e.clientX, e.clientY, true, false); return; }
  const p = hit(e);
  if (p) showTip(state.cats[p.category], e.clientX, e.clientY, true, (x, y) => addNoteForPassage(p, x, y));
  else hideTip(true);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { hideTip(true); hidePop(); hideKeyTip(); $("key").classList.remove("open"); if (state.fs) exitFs(); return; }
  const t = e.target, tag = t && t.tagName;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
  if (!state.doc) return;
  if (e.key === "ArrowLeft") { e.preventDefault(); go(state.page - 1, { scroll: false }); }
  else if (e.key === "ArrowRight") { e.preventDefault(); go(state.page + 1, { scroll: false }); }
  else if (e.key === "Home") { e.preventDefault(); go(1, { scroll: false }); }
  else if (e.key === "End") { e.preventDefault(); go(TOTAL(), { scroll: false }); }
});
document.addEventListener("guidechange", () => { hideTip(true); hideKeyTip(); });

/* ---------- previous and next highlight (follows the visible, filtered set across pages) ---------- */
function stepHighlight(dir) {
  const list = state.data.passages.filter(visible);
  if (!list.length) { notify("No highlights to show. Clear the filters to see them."); return; }
  const i = list.findIndex((p) => p.id === state.cursorPid);
  let j;
  if (i >= 0) j = i + dir;
  else if (dir > 0) { j = list.findIndex((p) => p.page >= state.page); if (j < 0) j = list.length; } // first at or after this page
  else { j = -1; for (let k = list.length - 1; k >= 0; k--) if (list[k].page <= state.page) { j = k; break; } } // last at or before this page
  if (j < 0 || j >= list.length) { notify(dir > 0 ? "That was the last highlight." : "That was the first highlight."); return; }
  const p = list[j];
  state.cursorPid = p.id;
  if (p.page === state.page) {
    const f = focusLayer.querySelector('.focus-hl[data-pid="' + p.id + '"]');
    if (f) { f.scrollIntoView({ block: "center" }); f.focus({ preventScroll: true }); }
  } else go(p.page, { focusHl: p.id });
}
$("hl-prev").addEventListener("click", () => stepHighlight(-1));
$("hl-next").addEventListener("click", () => stepHighlight(1));

/* ---------- panels on narrow screens ---------- */
/* ---------- full screen: an always-white layer (and the browser's full screen when it is available) ---------- */
const rgrid = $("rgrid"), fsBtn = $("fs-btn");
const layoutKey = () => state.fs ? window.innerWidth + "x" + window.innerHeight : String(stage.clientWidth);
function setFs(on) {
  if (on === state.fs) return;
  state.fs = on;
  rgrid.classList.toggle("fs", on); document.body.classList.toggle("fs-open", on);
  fsBtn.setAttribute("aria-pressed", on ? "true" : "false");
  fsBtn.setAttribute("aria-label", on ? "Exit full screen" : "Full screen"); fsBtn.title = on ? "Exit full screen" : "Full screen";
  hideTip(true); hidePop();
  if (on && window.innerWidth <= 1100) $("look").classList.add("collapsed");
  setTimeout(() => schedule(state.page), 80);
  fsBtn.focus({ preventScroll: true });
}
async function enterFs() { setFs(true); try { if (rgrid.requestFullscreen) await rgrid.requestFullscreen(); } catch (e) { /* the white layer alone is the fallback */ } }
function exitFs() { if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} } setFs(false); }
fsBtn.addEventListener("click", (e) => { e.stopPropagation(); if (state.fs) exitFs(); else enterFs(); });
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && state.fs) setFs(false); });

const lookPanel = $("look");
$("look-toggle").addEventListener("click", () => {
  const c = lookPanel.classList.toggle("collapsed");
  $("look-toggle").setAttribute("aria-expanded", c ? "false" : "true");
});
const keyPanel = $("key"), fab = $("key-fab");
fab.addEventListener("click", () => { const o = keyPanel.classList.toggle("open"); fab.setAttribute("aria-expanded", o ? "true" : "false"); });

/* ---------- wiring ---------- */
$("prev").addEventListener("click", () => go(state.page - 1, { scroll: false }));
$("next").addEventListener("click", () => go(state.page + 1, { scroll: false }));
$("page-select").addEventListener("change", (e) => { const n = Math.round(Number(e.target.value)); if (n >= 1 && n <= TOTAL()) go(n, { scroll: false }); else e.target.value = String(state.page); });
$("jump-first").addEventListener("click", () => {
  const list = state.data.passages.filter(visible);
  if (!list.length) { notify("No highlights to show. Clear the filters to see them."); return; }
  state.cursorPid = list[0].id;
  go(list[0].page, { focusHl: list[0].id });
});
$("zoom-out").addEventListener("click", () => { state.zoom = Math.max(0.6, +(state.zoom - 0.2).toFixed(2)); schedule(state.page); });
$("zoom-in").addEventListener("click", () => { state.zoom = Math.min(2.4, +(state.zoom + 0.2).toFixed(2)); schedule(state.page); });
let rzTimer;
window.addEventListener("resize", () => { clearTimeout(rzTimer); rzTimer = setTimeout(() => { if (state.doc && layoutKey() !== state.lastKey) schedule(state.page); }, 200); });

async function init() {
  try {
    const [data, gloss, doc] = await Promise.all([
      fetch("data/highlights.json").then((r) => r.json()),
      fetch("data/glossary.json").then((r) => r.json()),
      pdfjsLib.getDocument(PDF_URL).promise
    ]);
    state.data = data; state.gloss = gloss; state.doc = doc;
    data.categories.forEach((c) => { state.cats[c.key] = c; });
    data.passages.forEach((p) => { state.byId[p.id] = p; });
    gloss.terms.forEach((t) => { state.termById[t.id] = t; });
    Notes.setGuideCategories(data.categories.map((c) => ({ key: c.key, name: c.name })));
    const sel = $("page-select");
    sel.textContent = "";
    for (let p = 1; p <= doc.numPages; p++) sel.appendChild(el("option", { value: String(p) }, "Page " + p + " of " + doc.numPages + " · " + PAGE_SECTION[p - 1]));
    $("rn-count").textContent = gloss.terms.length + " plain-language terms";
    buildKey(); initTabs(); buildScrubber($("scrub"), false); buildScrubber($("scrub-v"), true);
    mountPanel($("notes-root"), goToPage, reader);
    Notes.setFilter(noteVisible);
    renderCustomKey();
    Notes.on(() => { renderCustomKey(); drawNotes(); });
    const m = /page=(\d+)/.exec(location.hash);
    Notes.setNotifier(notify);
    let start = 1, back = 0;
    if (m) start = Math.min(Math.max(1, +m[1]), doc.numPages);
    else { try { back = parseInt(localStorage.getItem("last-page"), 10) || 0; } catch (e) {} if (back > 1 && back <= doc.numPages) start = back; else back = 0; }
    schedule(start);
    if (back) notify("Welcome back. Opened at page " + back + ".", [{ label: "Start from Page 1", run: () => go(1, { scroll: false }) }]);
  } catch (e) {
    console.error(e);
    setStatus(location.protocol === "file:"
      ? "This page can't load the paper when opened as a file. Run start-site.bat (or python -m http.server 8000 in the site folder) and open http://localhost:8000/read.html instead."
      : "The paper could not be loaded. Check your connection and reload the page, or download the PDF from the Downloads and Credit page.", true);
  }
}
init();
