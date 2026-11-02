/* ============================================================
   BASE.JS — the frame around the room: name at the top, the
   little menu on the left, and the pop-up picture viewer.
   The room itself is room.js; its starting lists are room-data.js.
   ============================================================ */

/* the name across the top of the page. just a + for now.
   (the site is mind palace: see the <title> line of index.html) */
const SITE_NAME = "+";

/* where your own work comes from: your portfolio site. The strip of 2026
   work across the top reads that site's works.js + images, so it stays up
   to date on its own. When trinitylester.com points at the new site,
   change this line to "https://trinitylester.com" (and the works.js
   line in index.html). */
const PORTFOLIO = "https://trinitylester.trinityl-lester.workers.dev";

/* the menu on the left. add pages here as the site grows. */
const MENU = [
  { label: "mind palace", href: "index.html" },
  { label: "trinity lester ↗", href: PORTFOLIO, external: true }
];

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
  const here = currentPage().replace(/\.html$/, "");
  const items = MENU.map((m) =>
    `<a href="${m.href}"${m.external ? ' target="_blank" rel="noopener"' : ""} class="${m.href.replace(/\.html$/, "") === here || (here === "index" && m.href === "index.html") ? "current" : ""}">${m.label}</a>`
  ).join("");
  header.innerHTML = `<div class="name-bar"><a href="index.html">${SITE_NAME}</a></div><nav>${items}</nav>`;
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
});
