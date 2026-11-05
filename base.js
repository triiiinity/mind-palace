/* ============================================================
   BASE.JS — the frame around the room: name at the top, the
   little menu on the left, and the pop-up picture viewer.
   The room itself is room.js; its starting lists are room-data.js.
   ============================================================ */

/* the name across the top of the page: the plus platform, just a + for now.
   (click it to go to the home page) */
const SITE_NAME = "+";

/* where your own work comes from: your portfolio site. The strip of 2026
   work across the top reads that site's works.js + images, so it stays up
   to date on its own. When trinitylester.com points at the new site,
   change this line to "https://trinitylester.com" (and the works.js
   line in index.html). */
const PORTFOLIO = "https://trinitylester.trinityl-lester.workers.dev";

/* the menu on the left: the four steps, in order. Each link is a page of
   the room (the part after # in the address). Add or rename pages here. */
const MENU = [
  { step: "1 remembering", pages: [["bin", "inspiration list"], ["pure", "pure art"], ["library", "library"], ["nature", "pure images"]] },
  { step: "2 collecting", pages: [["collection", "image feed"], ["picker", "color picker"], ["split", "splitscreen"], ["obliterate", "obliterate"]] },
  { step: "3 creating", pages: [["bank", "color bank"], ["ideas", "idea board"], ["order", "order of operations"], ["progress", "progress tracker"]] },
  { step: "4 posting", pages: [["share", "profile"], ["notes", "notes"]] }
];

/* THE CURSOR: gray plus signs falling from the mouse. false = off. */
const PLUS_CURSOR = true;
const PLUS_SHADES = ["#4a4a4a", "#666666", "#808080", "#999999", "#b3b3b3", "#cccccc"];

/* THE GRID: click any empty white space and a small circle of grid shows through.
   GRID_SIZE = size of each square, GRID_RADIUS = size of the circle (pixels),
   GRID_STAYS = seconds before it fades. */
const GRID_SIZE = 28;
const GRID_RADIUS = 90;
const GRID_STAYS = 1.6;
/* GRID_ALWAYS = true: the grid shows on the whole page, all the time (a click
   still makes a darker circle of grid). false = back to grid-only-on-click.
   To hide it on one page, add that page to GRID_OFF, e.g. ["bank", "web"].
   (the page names are the words after # in the address) */
const GRID_ALWAYS = true;
const GRID_OFF = [];

/* ---------- YOUR WORKS (from the portfolio) ---------- */

const ALL = (window.WORKS || []).map((w) => ({
  ...w,
  file: /^https?:/.test(w.file) ? w.file : PORTFOLIO + "/" + String(w.file).replace(/^\//, ""),
  tagList: (w.tags || "").toLowerCase().split(/\s+/).filter(Boolean)
}));

// every work that has ALL of the given tags (room.js uses this for the 2026 strip)
function worksWithTags(tags) {
  return ALL.filter((w) => tags.every((t) => w.tagList.includes(t)));
}

/* ---------- TOP: NAME + LEFT MENU ---------- */

function currentPage() {
  const p = location.pathname.split("/").pop();
  return p === "" ? "index.html" : p;
}

function renderHeader() {
  const header = document.getElementById("site-header");
  if (!header) return;
  // each step shows just its name; hover (or tap) it and its pages drop down
  const items = MENU.map((m) => `<div class="menu-step"><button type="button" class="menu-label">${m.step}</button><div class="menu-pages">${m.pages.map(([k, label]) =>
    `<a href="#${k}" data-page="${k}">${label}</a>`).join("")}</div></div>`).join("");
  header.innerHTML = `<div class="name-bar"><a href="#home">${SITE_NAME}</a></div><nav class="menu">${items}</nav>`;
  header.querySelectorAll(".menu-label").forEach((b) => b.addEventListener("click", () => {
    const step = b.parentElement, was = step.classList.contains("open");
    header.querySelectorAll(".menu-step").forEach((x) => x.classList.remove("open"));
    step.classList.toggle("open", !was);
  }));
  markMenu();
  window.addEventListener("hashchange", markMenu);
}

// underline the page you're on
function markMenu() {
  const h = decodeURIComponent(location.hash.slice(1));
  const page = h.startsWith("artist/") || h === "artists" ? "pure" : h.startsWith("read/") ? "library" : h;
  document.querySelectorAll("#site-header [data-page]").forEach((a) => a.classList.toggle("current", a.dataset.page === page));
  // the step you're in stays a little open so you can see where you are
  document.querySelectorAll("#site-header .menu-step").forEach((st) => {
    st.classList.toggle("here", !!st.querySelector(".current"));
    st.classList.remove("open");
  });
}

/* ---------- THE GRID: shows through wherever you click on empty space ---------- */

function startGrid() {
  if (GRID_ALWAYS) {
    document.documentElement.classList.add("grid-always");
    document.documentElement.style.setProperty("--grid", GRID_SIZE + "px");
    const off = () => {
      const page = location.hash.slice(1).split("/")[0] || "home";
      document.documentElement.classList.toggle("grid-off", GRID_OFF.includes(page));
    };
    off(); window.addEventListener("hashchange", off);
  }
  const layer = document.createElement("div");
  layer.className = "grid-layer";
  layer.style.setProperty("--grid", GRID_SIZE + "px");
  document.body.appendChild(layer);
  let timer = null, raf = null;
  const BUSY = "a, button, input, textarea, select, label, canvas, img, pre, summary, [contenteditable], .rm-tile, .rm-panel, #lightbox, .rm-cpop";
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest(BUSY)) return;
    if (window.getSelection && String(window.getSelection())) return;      // selecting text isn't a click on the white
    const x = e.clientX, y = e.clientY, far = GRID_RADIUS;
    layer.style.setProperty("--gx", x + "px"); layer.style.setProperty("--gy", y + "px");
    layer.classList.add("on");
    cancelAnimationFrame(raf);
    const t0 = performance.now();
    const grow = (t) => {           // a little circle of grid opens around where you clicked
      const k = Math.min(1, (t - t0) / 350), r = far * (1 - Math.pow(1 - k, 3));
      layer.style.setProperty("--gr", r + "px");
      if (k < 1) raf = requestAnimationFrame(grow);
    };
    raf = requestAnimationFrame(grow);
    clearTimeout(timer);
    timer = setTimeout(() => layer.classList.remove("on"), GRID_STAYS * 1000);
  });
}

/* ---------- THE CURSOR: plus signs falling from the mouse ---------- */

function startPlusCursor() {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let last = 0;
  document.addEventListener("mousemove", (e) => {
    const now = performance.now();
    if (now - last < 45) return;                                       // a few at a time, not a flood
    if (e.target.closest && e.target.closest("canvas")) return;          // not while drawing or picking colors
    last = now;
    const p = document.createElement("span");
    p.className = "fallplus";
    p.textContent = "+";
    p.style.left = e.clientX + "px"; p.style.top = e.clientY + "px";
    p.style.color = PLUS_SHADES[Math.floor(Math.random() * PLUS_SHADES.length)];
    p.style.setProperty("--dx", (Math.random() * 24 - 12).toFixed(1) + "px");
    p.style.setProperty("--dy", (34 + Math.random() * 40).toFixed(1) + "px");
    p.style.fontSize = (10 + Math.random() * 6).toFixed(0) + "px";
    p.addEventListener("animationend", () => p.remove());
    document.body.appendChild(p);
  });
}

/* ---------- THE PICTURE VIEWER (click a picture: it opens big) ----------
   Click the picture to zoom, move the mouse to look around, scroll to zoom
   more or less, arrow keys for next / previous, escape to close. */

let lbList = [], lbIndex = 0, lbZoom = 1;

function buildLightbox() {
  const lb = document.createElement("div");
  lb.id = "lightbox";
  lb.innerHTML = `<span class="lb-close">close</span>
    <span class="lb-prev">‹</span><span class="lb-next">›</span>
    <div class="lb-stage"><img class="lb-img" alt=""></div>
    <div class="lb-caption"></div>`;
  document.body.appendChild(lb);
  const stage = lb.querySelector(".lb-stage");

  lb.addEventListener("click", (e) => {
    if (e.target.classList.contains("lb-prev")) return step(-1);
    if (e.target.classList.contains("lb-next")) return step(1);
    if (e.target.closest(".lb-stage")) return setZoom(lbZoom > 1 ? 1 : 2.5, e.clientX, e.clientY);
    if (e.target === lb || e.target.classList.contains("lb-close")) closeLightbox();
  });
  stage.addEventListener("mousemove", (e) => { if (lbZoom > 1) panTo(e.clientX, e.clientY); });
  stage.addEventListener("touchmove", (e) => {
    if (lbZoom > 1) { e.preventDefault(); panTo(e.touches[0].clientX, e.touches[0].clientY); }
  }, { passive: false });
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    setZoom(lbZoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY);
  }, { passive: false });

  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("show")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });
}

function setZoom(z, x, y) {
  const stage = document.querySelector(".lb-stage");
  lbZoom = Math.min(6, Math.max(1, z));
  if (lbZoom > 1 && x !== undefined) panTo(x, y);
  stage.querySelector("img").style.transform = `scale(${lbZoom})`;
  stage.classList.toggle("zoomed", lbZoom > 1);
}

function panTo(x, y) {
  const stage = document.querySelector(".lb-stage");
  const r = stage.getBoundingClientRect();
  stage.querySelector("img").style.transformOrigin =
    `${((x - r.left) / r.width) * 100}% ${((y - r.top) / r.height) * 100}%`;
}

function openLightbox(list, i) {
  lbList = list;
  lbIndex = i;
  const w = lbList[i];
  const lb = document.getElementById("lightbox");
  const img = lb.querySelector("img");
  img.style.transformOrigin = "50% 50%";
  setZoom(1);
  img.src = w.file;
  lb.querySelector(".lb-caption").innerHTML =
    [w.title ? `<b>${w.title}</b>` : "", w.details || ""].filter(Boolean).join(" :: ");
  lb.classList.add("show");
}

function closeLightbox() { document.getElementById("lightbox").classList.remove("show"); }

function step(d) {
  if (!lbList.length) return;
  openLightbox(lbList, (lbIndex + d + lbList.length) % lbList.length);
}

/* ---------- GO ---------- */

document.addEventListener("DOMContentLoaded", () => {
  renderHeader();
  buildLightbox();
  startGrid();
  if (PLUS_CURSOR) startPlusCursor();
});
