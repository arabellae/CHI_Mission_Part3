/* Private reader notes, stored only in this browser (localStorage) with export and import. No server involved.
   Each note has a highlight color and an optional category: one of the seven guide questions or one the reader makes. */
const KEY = "notes-v1", CAT_KEY = "categories-v1";
const MAX_PAGE = 14, MAX_CUSTOM = 10;

// Note colors: a soft fill with a darker edge. Names are shown in text so color is never the only cue.
export const COLORS = [
  { id: "yellow", name: "Yellow", fill: "#ffe680", edge: "#8a6d00" },
  { id: "mint", name: "Mint", fill: "#b8f0c8", edge: "#2f7d4a" },
  { id: "sky", name: "Sky", fill: "#b8dcff", edge: "#1f6fb2" },
  { id: "rose", name: "Rose", fill: "#ffc4d9", edge: "#b8326f" },
  { id: "lilac", name: "Lilac", fill: "#dccbff", edge: "#6f45b8" },
  { id: "peach", name: "Peach", fill: "#ffd0a8", edge: "#a85a00" },
  { id: "gray", name: "Gray", fill: "#dcdce1", edge: "#5b5b66" }
];
const COLOR_IDS = COLORS.map((c) => c.id);
export const colorOf = (id) => COLORS.find((c) => c.id === id) || COLORS[0];
// Default note color when a guide question is chosen as the category.
const GUIDE_COLOR = { G: "gray", B: "sky", S: "mint", R: "rose", E: "lilac", I: "peach", U: "yellow" };

let notes = [], customCats = [];
let guideCats = []; // [{ key, name }] supplied by the reader
let storageOk = true;
let filter = () => true;
let notifier = () => {}; // (text, actions) => shows a message near the paper
const listeners = [];
let ui = {};

function readJSON(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch (e) { storageOk = false; return fallback; }
}
function load() {
  customCats = cleanCats(readJSON(CAT_KEY, []));
  notes = clean(readJSON(KEY, []), customCats).list;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(notes)); localStorage.setItem(CAT_KEY, JSON.stringify(customCats)); storageOk = true; }
  catch (e) { storageOk = false; }
  message(storageOk ? "" : "Couldn't save notes in this browser. Export them to keep a copy.", !storageOk);
  listeners.forEach((fn) => fn());
}
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function cleanCats(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [], seen = new Set();
  arr.forEach((c) => {
    if (!c || typeof c.name !== "string" || !c.name.trim()) return;
    const id = typeof c.id === "string" && /^[\w-]{1,40}$/.test(c.id) ? c.id : newId();
    if (seen.has(id)) return; seen.add(id);
    out.push({ id, name: c.name.trim().slice(0, 40), color: COLOR_IDS.includes(c.color) ? c.color : "yellow" });
  });
  return out.slice(0, MAX_CUSTOM);
}

// Accepts parsed JSON and returns only well-formed notes (used for both stored data and imports).
function clean(data, cats) {
  const arr = Array.isArray(data) ? data : data && Array.isArray(data.notes) ? data.notes : null;
  if (!arr) throw new Error("not a notes file");
  const customIds = new Set(cats.map((c) => c.id));
  const list = []; let skipped = 0;
  arr.forEach((n) => {
    const okRects = Array.isArray(n && n.rects) ? n.rects.filter((r) => Array.isArray(r) && r.length === 4 && r.every((v) => typeof v === "number" && v >= 0 && v <= 1)) : [];
    if (!n || typeof n.text !== "string" || !n.text.trim() || !Number.isInteger(n.page) || n.page < 1 || n.page > MAX_PAGE) { skipped++; return; }
    let cat = typeof n.categoryId === "string" ? n.categoryId : null;
    if (cat && !(/^g:[GBSREIU]$/.test(cat) || (cat.startsWith("c:") && customIds.has(cat.slice(2))))) cat = null;
    list.push({
      id: typeof n.id === "string" && n.id ? n.id : newId(),
      page: n.page, quote: typeof n.quote === "string" ? n.quote.slice(0, 600) : "",
      rects: okRects, text: n.text.slice(0, 5000),
      color: COLOR_IDS.includes(n.color) ? n.color : "yellow", categoryId: cat,
      createdAt: typeof n.createdAt === "number" ? n.createdAt : Date.now()
    });
  });
  return { list, skipped };
}

function sorted() {
  return notes.slice().sort((a, b) => a.page - b.page || ((a.rects[0] || [0, 0])[1] - (b.rects[0] || [0, 0])[1]) || ((a.rects[0] || [0])[0] - (b.rects[0] || [0])[0]) || a.createdAt - b.createdAt);
}
function categoryName(id) {
  if (!id) return "";
  if (id.startsWith("g:")) { const g = guideCats.find((c) => c.key === id.slice(2)); return g ? g.name : ""; }
  const c = customCats.find((x) => x.id === id.slice(2)); return c ? c.name : "";
}
// The id the Key's filter uses for a note's category: a guide key ("R") or "c:<id>".
const filterKey = (n) => (n.categoryId ? (n.categoryId.startsWith("g:") ? n.categoryId.slice(2) : n.categoryId) : null);

export const Notes = {
  all: sorted,
  forPage: (p) => sorted().filter((n) => n.page === p),
  number: (id) => sorted().findIndex((n) => n.id === id) + 1,
  on: (fn) => listeners.push(fn),
  categories: () => customCats.slice(),
  categoryName,
  filterKey,
  setGuideCategories(list) { guideCats = list; },
  setNotifier(fn) { notifier = fn; },
  setFilter(fn) { filter = fn; renderList(); },
  visible: (n) => filter(n),
  add(n) { notes.push({ id: newId(), page: n.page, quote: n.quote, rects: n.rects, text: n.text, color: n.color, categoryId: n.categoryId || null, createdAt: Date.now() }); save(); notifier("Note saved."); },
  update(id, text) { const n = notes.find((x) => x.id === id); if (n) { n.text = text; save(); notifier("Note updated."); } },
  // Deleting is immediate and can be undone for a few seconds from the status message.
  remove(id) {
    const gone = notes.find((n) => n.id === id);
    if (!gone) return;
    notes = notes.filter((n) => n.id !== id); save();
    notifier("Note deleted.", [{ label: "Undo", run: () => { notes.push(gone); save(); notifier("Note restored."); } }]);
  },
  addCategory(name, color) {
    const c = { id: newId(), name: name.trim().slice(0, 40), color: COLOR_IDS.includes(color) ? color : "yellow" };
    customCats.push(c); return c;
  },
  openComposer,
  flash(id) {
    const el = document.querySelector('[data-note="' + id + '"]');
    if (!el) return;
    el.scrollIntoView({ block: "center" }); el.classList.add("flash"); el.focus && el.focus({ preventScroll: true });
    setTimeout(() => el.classList.remove("flash"), 1800);
  }
};

function el(tag, attrs, text) {
  const e = document.createElement(tag);
  Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
  if (text != null) e.textContent = text;
  return e;
}
function message(text, isErr) {
  if (!ui.status) return;
  ui.status.textContent = text; ui.status.className = "status" + (isErr ? " err" : "");
}

function download(name, type, body) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = el("a", { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function toMarkdown() {
  let out = "# My Notes on Touching Emotions, Smelling Shapes\n\n";
  let last = 0;
  sorted().forEach((n) => {
    if (n.page !== last) { out += "## Page " + n.page + "\n\n"; last = n.page; }
    const cat = categoryName(n.categoryId);
    if (cat) out += "**Category:** " + cat + " · **Color:** " + colorOf(n.color).name + "\n\n";
    if (n.quote) out += "> " + n.quote.replace(/\n/g, " ") + "\n\n";
    out += n.text + "\n\n";
  });
  return out;
}

function renderList() {
  if (!ui.list) return;
  ui.list.textContent = "";
  const all = sorted();
  if (!all.length) { ui.list.appendChild(el("p", { "class": "status" }, "No notes yet. Select any words on the paper, then choose Add Note.")); return; }
  all.forEach((n, i) => {
    const c = colorOf(n.color);
    const card = el("div", { "class": "notecard" + (filter(n) ? "" : " dim"), "data-note": n.id, tabindex: "-1", style: "--nc:" + c.fill + ";--ne:" + c.edge });
    const cat = categoryName(n.categoryId);
    card.appendChild(el("div", { "class": "meta" }, "Note " + (i + 1) + " · Page " + n.page + (cat ? " · " + cat : "") + " · " + c.name));
    if (n.quote) card.appendChild(el("p", { "class": "quote" }, "“" + n.quote + "”"));
    card.appendChild(el("div", { "class": "body" }, n.text));
    const acts = el("div", { "class": "acts" });
    const go = el("button", { type: "button", "class": "btn-sm" }, "Go to Page " + n.page);
    go.addEventListener("click", () => ui.goTo(n.page, n.id));
    const ed = el("button", { type: "button", "class": "btn-sm" }, "Edit");
    ed.addEventListener("click", () => editCard(card, n));
    const del = el("button", { type: "button", "class": "btn-sm" }, "Delete");
    del.addEventListener("click", () => Notes.remove(n.id));
    acts.append(go, ed, del); card.appendChild(acts);
    ui.list.appendChild(card);
  });
}
function editCard(card, n) {
  card.textContent = "";
  const wrap = el("div", { "class": "note-edit" });
  const ta = el("textarea", { "aria-label": "Edit your note" }); ta.value = n.text;
  const err = el("span", { "class": "err" });
  const acts = el("div", { "class": "acts" });
  const sv = el("button", { type: "button", "class": "btn-sm" }, "Save Note");
  const cn = el("button", { type: "button", "class": "btn-sm" }, "Cancel");
  sv.addEventListener("click", () => { const v = ta.value.trim(); if (!v) { err.textContent = "Write a note first"; return; } Notes.update(n.id, v); });
  cn.addEventListener("click", renderList);
  acts.append(sv, cn, err); wrap.append(ta, acts); card.appendChild(wrap); ta.focus();
}

// The composer is a pop-up over the paper, placed next to the selection. anchor = { x, y } in pixels inside the reader box.
let openBox = null, returnFocus = null;
function closeComposer() {
  if (openBox) { openBox.remove(); openBox = null; }
  if (returnFocus && returnFocus.focus) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
}
function swatchRow(selected, onPick) {
  const row = el("div", { "class": "swatches", role: "group" });
  let cur = selected;
  COLORS.forEach((c) => {
    const b = el("button", { type: "button", "aria-label": c.name, "aria-pressed": c.id === cur ? "true" : "false", title: c.name, style: "--c:" + c.fill });
    b.textContent = c.id === cur ? "✓" : "";
    b.addEventListener("click", () => { cur = c.id; set(c.id); onPick(c.id); });
    row.appendChild(b);
  });
  function set(id) {
    cur = id;
    row.querySelectorAll("button").forEach((b, i) => { const on = COLORS[i].id === id; b.setAttribute("aria-pressed", on ? "true" : "false"); b.textContent = on ? "✓" : ""; });
  }
  return { row, set, get: () => cur };
}
function openComposer(draft, anchor) {
  if (openBox) { openBox.remove(); openBox = null; }
  else returnFocus = document.activeElement;
  const host = ui.host;
  const box = el("div", { "class": "composer-pop", role: "dialog", "aria-label": "Add a note" });
  if (draft.quote) box.appendChild(el("p", { "class": "q" }, draft.quote));
  box.appendChild(el("label", { "for": "note-text", "class": "lbl" }, "Your note (page " + draft.page + ")"));
  const ta = el("textarea", { id: "note-text", placeholder: "What does this mean to you?" });
  box.appendChild(ta);

  const colorLbl = el("span", { "class": "lbl", id: "color-lbl" });
  const colorName = el("b", {}, colorOf("yellow").name);
  colorLbl.append("Highlight color: ", colorName);
  const sw = swatchRow("yellow", (id) => { colorName.textContent = colorOf(id).name; });
  sw.row.setAttribute("aria-labelledby", "color-lbl");
  box.append(colorLbl, sw.row);

  box.appendChild(el("label", { "for": "note-cat", "class": "lbl" }, "Add to a category"));
  const sel = el("select", { id: "note-cat" });
  sel.appendChild(el("option", { value: "" }, "No category"));
  const g1 = el("optgroup", { label: "Reading Guide Questions" });
  guideCats.forEach((c) => g1.appendChild(el("option", { value: "g:" + c.key }, c.name)));
  sel.appendChild(g1);
  if (customCats.length) {
    const g2 = el("optgroup", { label: "My Categories" });
    customCats.forEach((c) => g2.appendChild(el("option", { value: "c:" + c.id }, c.name)));
    sel.appendChild(g2);
  }
  if (customCats.length < MAX_CUSTOM) sel.appendChild(el("option", { value: "new" }, "+ Create My Own Category"));
  box.appendChild(sel);

  const own = el("div", { "class": "own" }); own.hidden = true;
  own.appendChild(el("label", { "for": "cat-name", "class": "lbl" }, "Category name"));
  const nameIn = el("input", { type: "text", id: "cat-name", maxlength: "40", placeholder: "Questions for Class" });
  own.appendChild(nameIn);
  const ownColorLbl = el("span", { "class": "lbl", id: "own-color-lbl" }, "Category color");
  const ownSw = swatchRow("sky", () => {});
  ownSw.row.setAttribute("aria-labelledby", "own-color-lbl");
  own.append(ownColorLbl, ownSw.row);
  box.appendChild(own);

  sel.addEventListener("change", () => {
    own.hidden = sel.value !== "new";
    let id = null;
    if (sel.value.startsWith("g:")) id = GUIDE_COLOR[sel.value.slice(2)];
    else if (sel.value.startsWith("c:")) { const c = customCats.find((x) => x.id === sel.value.slice(2)); id = c && c.color; }
    if (id) { sw.set(id); colorName.textContent = colorOf(id).name; }
  });

  const err = el("span", { "class": "err", role: "alert" });
  const acts = el("div", { style: "display:flex;gap:.4rem;align-items:center;margin-top:.7rem;flex-wrap:wrap" });
  const sv = el("button", { type: "button", "class": "btn-sm primary" }, "Save Note");
  const cn = el("button", { type: "button", "class": "btn-sm" }, "Cancel");
  sv.addEventListener("click", () => {
    const v = ta.value.trim();
    if (!v) { err.textContent = "Write a note first"; ta.focus(); return; }
    let catId = sel.value || null;
    if (sel.value === "new") {
      const nm = nameIn.value.trim();
      if (!nm) { err.textContent = "Name your category first"; nameIn.focus(); return; }
      if (customCats.some((c) => c.name.toLowerCase() === nm.toLowerCase())) { err.textContent = "You already have a category with that name"; nameIn.focus(); return; }
      catId = "c:" + Notes.addCategory(nm, ownSw.get()).id;
    }
    Notes.add({ page: draft.page, quote: draft.quote, rects: draft.rects, text: v, color: sw.get(), categoryId: catId });
    closeComposer();
  });
  cn.addEventListener("click", closeComposer);
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeComposer(); } });
  ta.addEventListener("input", () => { err.textContent = ""; });
  nameIn.addEventListener("input", () => { err.textContent = ""; });
  acts.append(sv, cn, err); box.appendChild(acts);

  host.appendChild(box); openBox = box;
  const hw = host.clientWidth, hh = host.clientHeight, bw = box.offsetWidth, bh = box.offsetHeight;
  const ax = anchor ? anchor.x : hw / 2, ay = anchor ? anchor.y : 40;
  box.style.left = Math.max(8, Math.min(ax - bw / 2, hw - bw - 8)) + "px";
  box.style.top = Math.max(8, (ay + 14 + bh > hh ? ay - bh - 14 : ay + 14)) + "px";
  // Only scroll if the pop-up is out of view, and only as far as needed.
  const r = box.getBoundingClientRect();
  if (r.top < 0 || r.bottom > window.innerHeight) box.scrollIntoView({ block: "nearest" });
  ta.focus({ preventScroll: true });
}

export function mountPanel(root, goTo, host) {
  load();
  root.textContent = "";
  root.appendChild(el("h2", {}, "Your Notes"));
  root.appendChild(el("p", { "class": "hint" }, "Saved only in this browser. Nobody else can see them."));
  const row = el("div", { "class": "cta-row", style: "margin:.4rem 0" });
  const md = el("button", { type: "button", "class": "btn-sm" }, "Export as Markdown");
  const js = el("button", { type: "button", "class": "btn-sm" }, "Export as JSON");
  const im = el("button", { type: "button", "class": "btn-sm" }, "Import Notes");
  const file = el("input", { type: "file", accept: "application/json,.json", hidden: "", "aria-label": "Choose a notes file to import" });
  md.addEventListener("click", () => { if (!notes.length) return message("There are no notes to export yet.", false); download("touching-emotions-notes.md", "text/markdown", toMarkdown()); });
  js.addEventListener("click", () => { if (!notes.length) return message("There are no notes to export yet.", false); download("touching-emotions-notes.json", "application/json", JSON.stringify({ notes: sorted(), categories: customCats }, null, 1)); });
  im.addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    const f = file.files[0]; if (!f) return;
    f.text().then((t) => {
      let parsed, res;
      try {
        parsed = JSON.parse(t);
        const incoming = cleanCats(parsed && parsed.categories);
        const have = new Set(customCats.map((c) => c.id));
        incoming.forEach((c) => { if (!have.has(c.id) && customCats.length < MAX_CUSTOM) customCats.push(c); });
        res = clean(parsed, customCats);
      } catch (e) { message("That file isn't a notes file exported from this guide.", true); notifier("That file isn't a notes file exported from this guide."); return; }
      const haveN = new Set(notes.map((n) => n.id));
      const fresh = res.list.filter((n) => !haveN.has(n.id));
      notes = notes.concat(fresh); save();
      const skipped = res.skipped + res.list.length - fresh.length;
      const msg = "Imported " + fresh.length + " note" + (fresh.length === 1 ? "" : "s") + (skipped ? ", skipped " + skipped + "." : ".");
      message(msg, false); notifier(msg);
    });
    file.value = "";
  });
  row.append(md, js, im, file); root.appendChild(row);
  const status = el("p", { "class": "status", role: "status", "aria-live": "polite" });
  const list = el("div");
  root.append(status, list);
  ui = { status, list, goTo, host };
  if (!storageOk) message("Notes can't be saved in this browser right now. Export them to keep a copy.", true);
  listeners.push(renderList);
  renderList();
}
