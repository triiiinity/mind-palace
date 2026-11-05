/* ============================================================
   ROOM.JS — mind palace: a research room in four steps.
   1 remembering · 2 engaging · 3 creating · 4 sharing

   artists   your list. type a name in the bar, each artist gets a page
             of their work (made CUTOFF_YEAR or earlier) from the open
             museum collections (Art Institute of Chicago, The Met,
             Cleveland Museum of Art).
   explore   artists suggested from the ones on your list.
   lineages  a family tree for each artist on your list.
   mind palace  a word bank: every word that inspires you, as a cloud,
             a plain list (the inspiration bin) and a web of strings.

   Everything you add is saved in THIS browser. "backup" (bottom of
   collection) downloads a copy; "restore" loads it on another computer.
   ============================================================ */

(function () {
  const R = window.ROOM;
  const root = document.getElementById("room");
  if (!R || !root) return;

  const CUT = R.CUTOFF_YEAR || 2010;
  const CACHE_DAYS = 7;          // museum results are remembered this long ("refresh" re-asks)
  const MET_MAX = 40;            // The Met needs one request per object, so it's capped

  /* ---------- helpers ---------- */

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plain = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const today = () => new Date().toISOString().slice(0, 10);
  const artistHref = (name) => "#artist/" + encodeURIComponent(name);

  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem("room:" + k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("room:" + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }
  };
  // museum answers are cached so pages open fast; keep that cache under about 1.5 MB so the browser's
  // storage (about 5 MB for the whole site) always has room for your own things
  (function pruneCache() {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("room:c:"));
      let size = keys.reduce((t, k) => t + localStorage.getItem(k).length, 0);
      if (size < 1.5e6) return;
      const aged = keys.map((k) => { let t = 0; try { t = JSON.parse(localStorage.getItem(k)).t || 0; } catch (e) {} return [k, t]; }).sort((a, b) => a[1] - b[1]);
      for (const [k] of aged) { if (size < 1e6) break; size -= localStorage.getItem(k).length; localStorage.removeItem(k); }
    } catch (e) { /* storage blocked */ }
  })();
  const cacheGet = (k, days) => { const c = store.get("c:" + k, null); return c && Date.now() - c.t < days * 864e5 ? c.v : null; };
  const cacheSet = (k, v) => store.set("c:" + k, { t: Date.now(), v });

  /* ---------- your saved things ---------- */

  let mine = store.get("mine", null) || R.STARTING_ARTISTS.map((name) => ({ name, note: "", added: today() }));
  let dismissed = store.get("dismissed", []);             // explore suggestions you said no to
  let lineAdds = store.get("lineAdds", {});               // names you added under someone in lineages
  let collection = store.get("collection", []);
  let ideas = store.get("ideas", []);
  let commissions = store.get("commissions", []);
  let legend = store.get("legend", null) || R.STRING_COLORS.map((c) => ({ ...c }));
  let natureTags = store.get("natureTags", null) || R.NATURE_TAGS.map((t) => ({ t, on: true }));
  let colors = store.get("colors", []);                   // picked colors: {id, hex, side, from:{title, artist, thumb}}
  let combos = store.get("combos", []);                   // saved color combinations: {id, name, hexes, layout}
  let lists = store.get("lists", null) || (R.STARTING_LISTS || []).map((l) => ({ id: uid(), name: l.name, items: l.items.map((t) => ({ id: uid(), t, done: false })) }));
  let gardenReady = false;                                // the garden (bottom of the page) draws once everything is set up
  let goals = store.get("goals", []);                     // progress tracker: {id, name, start, end, days:{date:true}}
  let notes = store.get("notes", null) || [{ id: uid(), title: "notes", text: "", draw: "" }];
  let books = store.get("books", []);   // your library: {id, title, author, pages, size, added, page, thumb, cloud}. the PDFs themselves live in IndexedDB
  let share = store.get("share", null) || { roomName: R.ROOM_NAME || "my room", artist: true, instagram: "", now: (R.NOW || []).map((x) => ({ ...x })), posts: [] };

  function saveAll() {
    store.set("mine", mine); store.set("dismissed", dismissed); store.set("lineAdds", lineAdds);
    store.set("collection", collection); store.set("ideas", ideas); store.set("commissions", commissions);
    store.set("palace", palace); store.set("legend", legend);
    store.set("natureTags", natureTags); store.set("colors", colors); store.set("combos", combos);
    store.set("lists", lists); store.set("share", share); store.set("goals", goals); store.set("notes", notes);
    store.set("books", books);
    if (gardenReady) { drawGarden(); cloudSoon(); }
  }

  const isMine = (name) => mine.some((m) => plain(m.name) === plain(name));
  const mineEntry = (name) => mine.find((m) => plain(m.name) === plain(name));
  const savedWork = (id) => collection.find((w) => w.id === id);

  // 3 · the mind palace: every word, its group, where it sits on the web, and the strings between
  const GROUPS = R.GROUPS;
  const OLD_TYPE = { concept: "ideas", artist: "artists", work: "works", "place + time": "places", source: "sources", note: "ideas" };
  let palace = store.get("palace", null);
  if (!palace) { palace = buildPalace(); store.set("palace", palace); }   // first visit: the old web (or the grid) becomes words
  Object.defineProperty(palace, "nodes", { get() { return this.words; }, enumerable: false });   // the board code calls them nodes
  saveAll();

  function addArtist(name) {
    name = name.trim();
    if (!name || isMine(name)) return;
    mine.push({ name, note: "", added: today() });
    dismissed = dismissed.filter((d) => plain(d) !== plain(name));
    saveAll();
  }

  /* ============================================================
     MUSEUMS (pictures)
     ============================================================ */

  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  async function fromChicago(q, limit = 100) {
    const fields = "id,title,artist_title,artist_display,date_display,date_end,image_id,medium_display,classification_title,thumbnail";
    const j = await getJSON(`https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(q)}&limit=${limit}&fields=${fields}`);
    const iiif = (j.config && j.config.iiif_url) || "https://www.artic.edu/iiif/2";
    return (j.data || []).map((a) => ({
      id: "aic-" + a.id, museum: "Art Institute of Chicago",
      title: a.title, artist: a.artist_title || (a.artist_display || "").split("\n")[0],
      date: a.date_display, year: a.date_end, medium: a.medium_display, kind: a.classification_title,
      thumb: a.image_id ? `${iiif}/${a.image_id}/full/400,/0/default.jpg` : "",
      img: a.image_id ? `${iiif}/${a.image_id}/full/843,/0/default.jpg` : "",
      ratio: a.thumbnail && a.thumbnail.width && a.thumbnail.height ? a.thumbnail.width / a.thumbnail.height : null,
      url: `https://www.artic.edu/artworks/${a.id}`
    }));
  }

  async function fromMet(q) {
    const s = await getJSON(`https://collectionapi.metmuseum.org/public/collection/v1/search?artistOrCulture=true&q=${encodeURIComponent(q)}`);
    const ids = (s.objectIDs || []).slice(0, MET_MAX);
    const objs = await Promise.all(ids.map((id) =>
      getJSON(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`).catch(() => null)));
    return objs.filter(Boolean).map((o) => ({
      id: "met-" + o.objectID, museum: "The Met",
      title: o.title, artist: o.artistDisplayName || "",
      date: o.objectDate, year: o.objectEndDate, medium: o.medium, kind: o.classification || o.objectName,
      thumb: o.primaryImageSmall || "", img: o.primaryImage || o.primaryImageSmall || "",
      ratio: null, url: o.objectURL
    }));
  }

  async function fromCleveland(q) {
    const j = await getJSON(`https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(q)}&limit=80&created_before=${CUT}`);
    return (j.data || []).map((a) => {
      const web = (a.images && a.images.web) || {};
      const big = (a.images && (a.images.print || a.images.web)) || {};
      const who = (a.creators && a.creators[0] && a.creators[0].description) || "";
      return {
        id: "cma-" + a.id, museum: "Cleveland Museum of Art",
        title: a.title, artist: String(who).replace(/\s*\(.*$/, ""),
        date: a.creation_date, year: a.creation_date_latest, medium: a.technique, kind: a.type,
        thumb: web.url || "", img: big.url || web.url || "",
        ratio: Number(web.width) && Number(web.height) ? Number(web.width) / Number(web.height) : null,
        url: a.url
      };
    });
  }

  const SOURCES = [
    { key: "chicago", run: (q) => fromChicago(q) },
    { key: "met", run: (q) => fromMet(q) },
    { key: "cleveland", run: (q) => fromCleveland(q) }
  ];

  // is this work really by this artist? every part of the name has to be in the credit
  function byArtist(name, w) {
    const credit = plain(w.artist);
    return plain(name).split(/[\s-]+/).filter((t) => t.length > 1).every((t) => credit.includes(t));
  }
  function inRange(w) {
    const y = Number(w.year);
    return w.year == null || w.year === "" || isNaN(y) || y <= CUT;
  }

  // every work by one artist, from all three museums
  async function worksBy(name, fresh) {
    const key = "works:" + plain(name);
    if (!fresh) { const c = cacheGet(key, CACHE_DAYS); if (c) return c; }
    const counts = {}, failed = [];
    const lists = await Promise.all(SOURCES.map((src) => src.run(name)
      .then((list) => { const ok = list.filter((w) => byArtist(name, w) && inRange(w)); counts[src.key] = ok.length; return ok; })
      .catch(() => { failed.push(src.key); return []; })));
    const seen = new Set();
    const items = lists.flat().filter((w) => !seen.has(w.id) && seen.add(w.id));
    const res = { items, counts, failed };
    if (items.length) cacheSet(key, res);
    return res;
  }

  // a few pictures fast (Chicago only), for previews on cards
  async function previewOf(name) {
    const key = "pv:" + plain(name);
    const c = cacheGet(key, 30) || (cacheGet("works:" + plain(name), CACHE_DAYS) || {}).items;
    if (c) return c.filter((w) => w.thumb).slice(0, 4);
    try {
      const list = (await fromChicago(name, 40)).filter((w) => byArtist(name, w) && inRange(w) && w.thumb);
      cacheSet(key, list.slice(0, 6));
      return list.slice(0, 4);
    } catch (e) { return []; }
  }

  /* ============================================================
     WIKIDATA (spelling + life dates while you type, and who
     influenced whom, for explore + lineages)
     ============================================================ */

  const ARTISTY = /artist|painter|sculptor|photographer|printmaker|draughtsman|draftsman|weaver|textile|designer|illustrator|architect/i;

  async function wdSearch(q) {
    const j = await getJSON(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&uselang=en&type=item&limit=10&format=json&origin=*`);
    const list = (j.search || []).map((s) => ({ id: s.id, label: s.label, desc: s.description || "" }));
    return list.filter((s) => ARTISTY.test(s.desc)).concat(list.filter((s) => !ARTISTY.test(s.desc))).slice(0, 6);
  }

  async function sparql(query) {
    const j = await getJSON("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query));
    return j.results.bindings;
  }

  // {desc, by:[names], on:[names], movements:[names], peers:[names]}
  async function aboutArtist(name) {
    const key = "wd:" + plain(name);
    const c = cacheGet(key, 30);
    if (c) return c;
    const out = { desc: "", by: [], on: [], movements: [], peers: [] };
    try {
      const hits = await wdSearch(name);
      const hit = hits.find((h) => ARTISTY.test(h.desc) && plain(h.label) === plain(name)) || hits.find((h) => ARTISTY.test(h.desc));
      if (!hit) { cacheSet(key, out); return out; }
      out.desc = hit.desc;
      const Q = hit.id;
      const rows = await sparql(`SELECT ?kind ?oLabel WHERE {
        { wd:${Q} wdt:P737 ?o . BIND("by" AS ?kind) }
        UNION { ?o wdt:P737 wd:${Q} . ?o wdt:P31 wd:Q5 . BIND("on" AS ?kind) }
        UNION { wd:${Q} wdt:P135 ?o . BIND("movement" AS ?kind) }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 80`);
      rows.forEach((r) => {
        const label = r.oLabel && r.oLabel.value;
        if (!label || /^Q\d+$/.test(label)) return;
        ({ by: out.by, on: out.on, movement: out.movements })[r.kind.value].push(label);
      });
      if (out.movements.length) {
        const peers = await sparql(`SELECT DISTINCT ?oLabel ?sl WHERE {
          wd:${Q} wdt:P135 ?m . ?o wdt:P135 ?m ; wdt:P31 wd:Q5 ; wikibase:sitelinks ?sl . FILTER(?o != wd:${Q})
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY DESC(?sl) LIMIT 14`).catch(() => []);
        out.peers = peers.map((r) => r.oLabel && r.oLabel.value).filter((l) => l && !/^Q\d+$/.test(l));
      }
    } catch (e) { return out; }   // don't cache a failure
    cacheSet(key, out);
    return out;
  }

  // hand-made relations first, Wikidata after
  function curatedNear(name) {
    const tree = Object.keys(R.LINEAGE).find((k) => plain(k) === plain(name));
    const rel = Object.keys(R.RELATED).find((k) => plain(k) === plain(name));
    const fromTree = tree ? R.LINEAGE[tree].flatMap((b) => b.artists) : [];
    const fromRel = rel ? R.RELATED[rel] : [];
    // and anyone whose own list mentions this artist
    const back = Object.keys(R.RELATED).filter((k) => R.RELATED[k].some((n) => plain(n) === plain(name)));
    return [...new Set(fromTree.concat(fromRel, back))];
  }

  /* ============================================================
     FRAME + ROUTES
     ============================================================ */

  /* the four steps. The menu itself is in the left column (base.js); these feed the home page. */
  const STEPS = [
    { n: 1, label: "remembering", line: "everything you carry around", pages: [["bin", "inspiration list"], ["images", "images"], ["library", "library"]] },
    { n: 2, label: "collecting", line: "gathering what you remember", pages: [["picker", "color picker"], ["split", "splitscreen"]] },
    { n: 3, label: "creating", line: "now you should have an idea", pages: [["bank", "color bank"], ["ideas", "idea board"], ["order", "order of operations"]] },
    { n: 4, label: "posting", line: "your studio, as it goes", pages: [["share", "profile"]] }
  ];
  const PAGES = STEPS.flatMap((st) => st.pages.map(([k]) => k)).concat("home", "visit", "blog");
  // pages that were folded into others, so old links still land somewhere
  const MOVED = { pure: "images", nature: "images", artists: "images", collection: "images", obliterate: "split", progress: "order", notes: "share" };
  // the way through, start to finish (the little "next" line at the bottom of each page)
  const TRAIL = ["bin", "images", "picker", "split", "bank", "ideas", "order", "blog"];
  const TRAIL_WHY = { bin: "write down what inspires you", images: "see real art and real pictures of it", picker: "pick the colors out", split: "put art and the world side by side",
    bank: "your colors, all together", ideas: "plant an idea", order: "list the steps; each one waters it", blog: "show people what you're working on" };
  const LABEL = Object.assign(Object.fromEntries(STEPS.flatMap((st) => st.pages)), { blog: "blog", home: "home" });

  root.innerHTML = `
    <section id="rm-view"></section>
    <nav class="rm-trail" id="rm-trail" aria-label="next step"></nav>
    <aside class="rm-panel" id="rm-panel" hidden></aside>`;

  function drawTrail(page) {
    const t = $("rm-trail"), k = TRAIL.indexOf(page);
    if (!t) return;
    if (k < 0 || page === "bank") { t.innerHTML = ""; return; }
    const prev = TRAIL[k - 1], next = TRAIL[k + 1];
    t.innerHTML = `<span class="rm-trailsteps">${TRAIL.map((p, i) => `<a href="#${p}" class="${i < k ? "past" : i === k ? "here" : ""}" title="${esc(LABEL[p])}"></a>`).join("")}</span>`
      + (prev ? `<a href="#${prev}" class="rm-why">← ${esc(LABEL[prev])}</a>` : "")
      + (next ? `<a href="#${next}" class="rm-trailnext">next: ${esc(LABEL[next])} <span class="rm-why">${esc(TRAIL_WHY[next])}</span> →</a>` : `<span class="rm-why">that's the whole way through. start again with a new word →</span> <a href="#bin">inspiration list</a>`);
  }

  /* your 2026 work: a strip of small pictures across the top of every room page.
     Newest first (the last lines in works.js). Click one to see it big. */
  // works come from your portfolio site (see PORTFOLIO in base.js); small copies live in its images/thumbs/ folder
  const thumbOf = (file) => String(file).replace(/(^|\/)images\//, "$1images/thumbs/").replace(/\.[a-z0-9]+$/i, ".webp");
  function drawMyWork(box) {
    if (!box) return;
    if (!share.artist) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    const list = (typeof worksWithTags === "function" ? worksWithTags([String(R.MY_WORK_TAG || "2026")]) : []).slice().reverse();
    if (!list.length) { box.hidden = true; return; }
    box.innerHTML = `<span class="rm-mylabel">${esc(R.MY_WORK_TAG || "2026")}</span>` + list.map((w, i) =>
      `<button type="button" data-i="${i}" title="${esc(w.title || "")}"><img src="${esc(thumbOf(w.file))}" data-full="${esc(w.file)}" alt="${esc(w.title || "")}" loading="lazy"></button>`).join("");
    // small copies (images/thumbs/…) keep the strip quick; a work without one yet just shows the full picture
    box.querySelectorAll("img").forEach((im) => im.addEventListener("error", () => { if (im.src.indexOf(im.dataset.full) < 0) im.src = im.dataset.full; }, { once: true }));
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      if (typeof openLightbox === "function") openLightbox(list, +b.dataset.i);
    }));
  }
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    const isArtist = h.startsWith("artist/");
    const isBook = h.startsWith("read/");
    if (MOVED[h]) { location.replace("#" + MOVED[h]); return; }
    const page = isArtist ? "images" : isBook ? "library" : PAGES.includes(h) ? h : "home";
    closePanel();
    root.classList.toggle("on-web", page === "web");
    root.classList.toggle("on-bank", page === "bank");
    root.dataset.page = page;
    if (isArtist) showArtist(h.slice(7));
    else if (isBook) showBook(h.slice(5));
    else ({ home: showHome, images: showImages, library: showLibrary, picker: showPicker, bank: showBank, order: showOrder, share: showShare,
            split: showSplit, bin: showBin, ideas: showIdeas, visit: showVisit, blog: showBlog })[page]();
    drawTrail(page);
    closeMachine();
    drawGarden();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  /* ---------- the typing bar (with name suggestions) ---------- */

  function typingBar(box, { placeholder, onPick, suggest = true }) {
    box.innerHTML = `<form class="rm-bigbar" autocomplete="off">
        <input type="text" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}">
        <button type="submit" class="rm-btn">add</button>
        <ul class="rm-suggest" hidden></ul>
      </form>`;
    const form = box.querySelector("form"), input = form.querySelector("input"), list = form.querySelector(".rm-suggest");
    let timer, items = [], active = -1;
    const draw = () => {
      list.hidden = !items.length;
      list.innerHTML = items.map((s, i) => `<li class="${i === active ? "on" : ""}" data-i="${i}"><b>${esc(s.label)}</b> <span>${esc(s.desc)}</span></li>`).join("");
    };
    const pick = (name, item) => { input.value = ""; items = []; draw(); if (name.trim()) onPick(name.trim(), item || null); };
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 3 || !suggest) { items = []; draw(); return; }
      timer = setTimeout(() => wdSearch(q).then((r) => { if (input.value.trim() === q) { items = r; active = -1; draw(); } }).catch(() => {}), 250);
    });
    input.addEventListener("keydown", (e) => {
      if (!items.length) return;
      if (e.key === "ArrowDown") { active = (active + 1) % items.length; draw(); e.preventDefault(); }
      if (e.key === "ArrowUp") { active = (active - 1 + items.length) % items.length; draw(); e.preventDefault(); }
      if (e.key === "Escape") { items = []; draw(); }
    });
    list.addEventListener("mousedown", (e) => { const li = e.target.closest("li"); if (li) { e.preventDefault(); pick(items[+li.dataset.i].label, items[+li.dataset.i]); } });
    form.addEventListener("submit", (e) => { e.preventDefault(); pick(active >= 0 ? items[active].label : input.value, active >= 0 ? items[active] : null); });
    return input;
  }

  /* ============================================================
     ARTISTS: your list
     ============================================================ */

  /* ---------- one artist ---------- */

  const view = store.get("view", { medium: "all", squares: false, sort: "oldest" });

  async function showArtist(name) {
    const v = $("rm-view");
    const m = mineEntry(name);
    const others = mine.filter((x) => x !== m);
    const searchLinks = [
      ["MoMA", `https://www.moma.org/collection/?q=${encodeURIComponent(name)}`],
      ["Tate", `https://www.tate.org.uk/search?q=${encodeURIComponent(name)}`],
      ["Google Arts & Culture", `https://artsandculture.google.com/search?q=${encodeURIComponent(name)}`],
      ["Wikipedia", `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`]
    ];
    const curatedKey = Object.keys(R.ELSEWHERE).find((k) => plain(k) === plain(name));
    const elsewhere = curatedKey ? R.ELSEWHERE[curatedKey] : [];

    v.innerHTML = `
      <div class="rm-ahead">
        <div>
          <p class="rm-crumbs"><a href="#images">images</a>${others.length ? " · " + others.slice(-6).map((o) => `<a href="${artistHref(o.name)}">${esc(o.name)}</a>`).join(" · ") : ""}</p>
          <h1>${esc(name)}</h1>
          <p class="rm-why" id="rm-adesc"></p>
        </div>
        <div class="rm-aact">
          ${m ? `<button type="button" class="rm-btn quiet" id="rm-remove">remove from my list</button>` : `<button type="button" class="rm-btn" id="rm-addme">+ add to my artists</button>`}
          <button type="button" class="rm-btn quiet" id="rm-toweb">${palace.words.some((w) => plain(w.label) === plain(name)) ? "in the mind palace ✓" : "+ add to the mind palace"}</button>
        </div>
      </div>
      ${m ? `<textarea id="rm-anote" rows="2" placeholder="what I love about ${esc(name)}…">${esc(m.note)}</textarea>` : ""}
      <div class="rm-filters">
        <span>show <select id="rm-medium">
          <option value="all">everything</option><option value="paper">works on paper</option>
          <option value="painting">paintings</option><option value="other">other</option></select></span>
        <label><input type="checkbox" id="rm-squares"> squares only</label>
        <span>order <select id="rm-sort"><option value="oldest">oldest first</option><option value="newest">newest first</option><option value="shuffle">shuffle</option></select></span>
        <button type="button" id="rm-refresh">refresh</button>
        <span class="rm-status" id="rm-status">asking the museums…</span>
      </div>
      <div class="rm-grid big" id="rm-grid"><div class="rm-loading">${"<i></i>".repeat(12)}</div></div>
      <div class="rm-near" id="rm-near"></div>
      <div class="rm-elsewhere">
        <h3>${esc(name)} elsewhere</h3>
        <p class="rm-note">for work the open collections can't show. opens in a new tab.</p>
        <ul>
          ${elsewhere.map((e) => `<li${e.onview ? ' class="onview"' : ""}><a href="${esc(e.href)}" target="_blank" rel="noopener"><b>${esc(e.where)}</b> ${esc(e.what)}</a>${e.onview ? " <em>on view now</em>" : ""}</li>`).join("")}
          ${searchLinks.map(([w, h]) => `<li><a href="${h}" target="_blank" rel="noopener"><b>${w}</b> search for ${esc(name)}</a></li>`).join("")}
        </ul>
      </div>`;

    $("rm-medium").value = view.medium; $("rm-sort").value = view.sort; $("rm-squares").checked = view.squares;
    if (m) {
      $("rm-anote").addEventListener("input", (e) => { m.note = e.target.value; saveAll(); });
      $("rm-remove").addEventListener("click", () => {
        if (!confirmTwice($("rm-remove"), "click again to remove")) return;
        mine = mine.filter((x) => x !== m); saveAll(); location.hash = "#images";
      });
    } else $("rm-addme").addEventListener("click", () => { addArtist(name); showArtist(name); });
    $("rm-toweb").addEventListener("click", () => {
      const had = palace.words.find((w) => plain(w.label) === plain(name));
      if (!had) { const [w] = addWords(name); if (w) { w.type = "artists"; placeWord(palace, w); saveAll(); } }
      $("rm-toweb").textContent = "in the mind palace ✓";
    });

    let items = [], res = null;
    const draw = () => {
      const grid = $("rm-grid");
      if (!grid) return;
      const list = arrange(items, view);
      grid.classList.toggle("sq-only", view.squares);
      grid.innerHTML = list.length ? list.map(tileHTML).join("")
        : `<p class="rm-empty">${res && res.failed.length === SOURCES.length ? "the museums didn't answer. check your connection and press refresh." : items.length ? "nothing for this filter." : `nothing by ${esc(name)} in the open collections. try the links below, or check the spelling.`}</p>`;
      wireTiles(grid, list);
      if (res) $("rm-status").textContent = `${list.length} works · ` + SOURCES.map((s) => res.failed.includes(s.key) ? `${s.key} didn't answer` : `${s.key} ${res.counts[s.key] || 0}`).join(" · ");
    };
    const load = async (fresh) => {
      $("rm-status").textContent = "asking the museums…";
      res = await worksBy(name, fresh);
      if (decodeURIComponent(location.hash.slice(1)) !== "artist/" + name) return;   // you moved on
      items = res.items; draw();
    };
    $("rm-medium").addEventListener("change", (e) => { view.medium = e.target.value; store.set("view", view); draw(); });
    $("rm-sort").addEventListener("change", (e) => { view.sort = e.target.value; store.set("view", view); draw(); });
    $("rm-squares").addEventListener("change", (e) => { view.squares = e.target.checked; store.set("view", view); $("rm-grid").classList.toggle("sq-only", view.squares); });
    $("rm-refresh").addEventListener("click", () => load(true));
    load(false);

    // description + nearby artists (hand-made first, then Wikidata)
    const about = await aboutArtist(name);
    if (!$("rm-adesc")) return;
    $("rm-adesc").textContent = about.desc || "";
    const near = [...new Set(curatedNear(name).concat(about.by, about.on))].filter((n) => plain(n) !== plain(name)).slice(0, 24);
    if (near.length) $("rm-near").innerHTML = `<h3>near ${esc(name)}</h3><p class="rm-chips">${near.map((n) => `<a href="${artistHref(n)}" class="${isMine(n) ? "mine" : ""}">${esc(n)}</a>`).join("")}</p>`;
  }

  /* ---------- tiles ---------- */

  const PAPER = /paper|drawing|print|watercolou?r|graphite|pencil|ink|gouache|pastel|charcoal|lithograph|etching|screenprint|serigraph|woodcut|engraving|aquatint|crayon/i;
  const PAINT = /oil|acrylic|canvas|tempera|painting|panel|linen|enamel/i;
  function mediumOf(w) {
    const s = (w.medium || "") + " " + (w.kind || "");
    if (PAINT.test(s) && !/on paper/i.test(s)) return "painting";
    if (PAPER.test(s)) return "paper";
    return "other";
  }
  const squareish = (r) => r && r > 0.9 && r < 1.11;
  function shuffle(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function arrange(items, f) {
    let list = items.filter((w) => f.medium === "all" || mediumOf(w) === f.medium);
    if (f.sort === "oldest") list.sort((a, b) => (a.year || 9999) - (b.year || 9999));
    else if (f.sort === "newest") list.sort((a, b) => (b.year || 0) - (a.year || 0));
    else list = shuffle(list);
    return list;
  }

  function tileHTML(w) {
    const pic = w.thumb
      ? `<img src="${esc(w.thumb)}" alt="${esc(w.title)}" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="rm-pencil"><i>${esc(w.title || "untitled")}</i><small>no shareable image</small></span>`;
    const sq = squareish(w.ratio) ? " is-sq" : w.ratio ? " not-sq" : "";
    return `<button class="rm-tile${sq}${savedWork(w.id) ? " saved" : ""}" data-id="${esc(w.id)}" type="button">
      <span class="rm-pic">${pic}</span>
      <span class="rm-quick" role="button" tabindex="0" aria-label="save to my collection"><span class="q-plus">+</span><span class="q-x">×</span></span>
      <span class="rm-cap"><b>${esc(w.title || "untitled")}</b>${w.year ? ", " + esc(w.year) : ""}<br>${esc(w.artist || "")}</span>
    </button>`;
  }

  function wireTiles(box, list) {
    box.querySelectorAll(".rm-tile").forEach((el) => {
      const w = list.find((x) => x.id === el.dataset.id);
      el.addEventListener("click", () => openPanel(w));
      // the little + saves it straight to the collection (no tags or notes needed); × takes it out again
      const q = el.querySelector(".rm-quick");
      const quick = (e) => {
        e.stopPropagation(); e.preventDefault();
        if (savedWork(w.id)) {
          collection = collection.filter((x) => x.id !== w.id);
          ideas.forEach((i) => { i.refs = i.refs.filter((r) => r !== w.id); });
          saveAll(); markTile(w.id, false);
          if (location.hash === "#images" && imgView === "saved") showImages();
        } else {
          collection = collection.concat({ ...w, tags: [], note: "", saved: today() });
          saveAll(); markTile(w.id, true);
        }
      };
      q.addEventListener("click", quick);
      q.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") quick(e); });
      const img = el.querySelector("img");
      if (!img) return;
      img.addEventListener("load", () => {
        if (!img.naturalWidth) return;
        w.ratio = img.naturalWidth / img.naturalHeight;
        el.classList.toggle("is-sq", squareish(w.ratio));
        el.classList.toggle("not-sq", !squareish(w.ratio));
      });
      img.addEventListener("error", () => { img.outerHTML = `<span class="rm-pencil"><i>${esc(w.title || "untitled")}</i><small>image didn't load</small></span>`; });
    });
  }

  /* ============================================================
     EXPLORE: suggestions from your list
     ============================================================ */

  // how famous is each name? (number of Wikipedia languages it has a page in — fewer = more niche)
  async function fameOf(names) {
    const need = names.filter((n) => cacheGet("fame:" + plain(n), 30) == null).slice(0, 60);
    if (need.length) {
      try {
        const values = need.map((n) => `"${n.replace(/["\\]/g, "")}"@en`).join(" ");
        const rows = await sparql(`SELECT ?name (MAX(?sl) AS ?s) WHERE { VALUES ?name { ${values} } ?o rdfs:label ?name ; wdt:P31 wd:Q5 ; wikibase:sitelinks ?sl . } GROUP BY ?name`);
        const got = {};
        rows.forEach((r) => { got[plain(r.name.value)] = +r.s.value; });
        need.forEach((n) => cacheSet("fame:" + plain(n), got[plain(n)] != null ? got[plain(n)] : -1));
      } catch (e) { /* unknown for now */ }
    }
    const out = {};
    names.forEach((n) => { const f = cacheGet("fame:" + plain(n), 30); out[plain(n)] = f == null ? -1 : f; });
    return out;
  }
  const fameWord = (f) => f < 0 ? "" : f >= 80 ? "well known" : f >= 40 ? "known" : f >= 15 ? "lesser known" : "niche";

  const exOpts = store.get("exOpts", { order: "close", deeper: false });

  async function showExplore() {
    const v = $("rm-view");
    v.innerHTML = `
      <p class="rm-intro">artists near the ones on your list. add the ones you like and the suggestions move with you, further out each time. you decide who stays.</p>
      <div class="rm-filters">
        <span>order <select id="rm-exorder"><option value="close">closest to my list</option><option value="niche">most niche first</option></select></span>
        <label><input type="checkbox" id="rm-deeper"${exOpts.deeper ? " checked" : ""}> go deeper (artists near the suggestions)</label>
      </div>
      <div class="rm-recs" id="rm-recs"><div class="rm-loading">${"<i></i>".repeat(8)}</div></div>
      ${dismissed.length ? `<p class="rm-why rm-backup">${dismissed.length} passed on · <button type="button" id="rm-undismiss">bring them back</button></p>` : ""}`;
    $("rm-exorder").value = exOpts.order;
    $("rm-exorder").addEventListener("change", (e) => { exOpts.order = e.target.value; store.set("exOpts", exOpts); showExplore(); });
    $("rm-deeper").addEventListener("change", (e) => { exOpts.deeper = e.target.checked; store.set("exOpts", exOpts); showExplore(); });
    if ($("rm-undismiss")) $("rm-undismiss").addEventListener("click", () => { dismissed = []; saveAll(); showExplore(); });

    // score: a point for each of your artists they're near (hand-made links count a bit more)
    const cand = new Map();
    const bump = (n, because, pts) => {
      if (!n || isMine(n) || dismissed.some((d) => plain(d) === plain(n))) return;
      const k = plain(n);
      const c = cand.get(k) || { name: n, score: 0, because: new Set() };
      c.score += pts; c.because.add(because); cand.set(k, c);
    };
    const abouts = await Promise.all(mine.map((m) => aboutArtist(m.name)));
    mine.forEach((m, i) => {
      curatedNear(m.name).forEach((n) => bump(n, m.name, 1.5));
      abouts[i].by.forEach((n) => bump(n, m.name, 1));
      abouts[i].on.forEach((n) => bump(n, m.name, 1));
      abouts[i].peers.forEach((n) => bump(n, m.name, 0.5));
    });
    if (exOpts.deeper) {
      const first = [...cand.values()].sort((a, b) => b.score - a.score).slice(0, 15);
      const deeper = await Promise.all(first.map((c) => aboutArtist(c.name)));
      first.forEach((c, i) => {
        curatedNear(c.name).concat(deeper[i].by, deeper[i].on).forEach((n) => { if (!cand.has(plain(n))) bump(n, "via " + c.name, 0.3); else bump(n, "via " + c.name, 0.2); });
      });
    }
    let recs = [...cand.values()].sort((a, b) => b.because.size - a.because.size || b.score - a.score).slice(0, 40);
    const fame = await fameOf(recs.map((r) => r.name));
    if (exOpts.order === "niche") recs.sort((a, b) => {
      const fa = fame[plain(a.name)], fb = fame[plain(b.name)];
      return (fa < 0 ? 999 : fa) - (fb < 0 ? 999 : fb) || b.score - a.score;
    });
    recs = recs.slice(0, 30);
    const box = $("rm-recs");
    if (!box) return;
    box.innerHTML = recs.map((r) => `
      <div class="rm-rec" data-name="${esc(r.name)}">
        <a class="rm-strip" href="${artistHref(r.name)}"><i></i><i></i><i></i><i></i></a>
        <a href="${artistHref(r.name)}"><b>${esc(r.name)}</b></a>
        <span class="rm-why">${fameWord(fame[plain(r.name)]) ? `<span class="rm-fame f-${fameWord(fame[plain(r.name)]).replace(/ /g, "-")}">${fameWord(fame[plain(r.name)])}</span> · ` : ""}near ${[...r.because].slice(0, 3).map(esc).join(" + ")}</span>
        <span class="rm-row"><button type="button" class="rm-btn" data-add>+ add</button><button type="button" class="rm-del" data-no>not for me</button></span>
      </div>`).join("") || `<p class="rm-empty">add a few artists first, then come back.</p>`;

    box.querySelectorAll(".rm-rec").forEach(async (card) => {
      const name = card.dataset.name;
      card.querySelector("[data-add]").addEventListener("click", (e) => { addArtist(name); e.target.textContent = "added ✓"; e.target.disabled = true; });
      card.querySelector("[data-no]").addEventListener("click", () => { dismissed.push(name); saveAll(); card.remove(); });
      const pics = await previewOf(name);
      const cells = card.querySelectorAll(".rm-strip i");
      pics.forEach((w, i) => { if (cells[i]) cells[i].innerHTML = `<img src="${esc(w.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">`; });
    });
  }

  /* ============================================================
     LINEAGES: one tree per artist on your list
     ============================================================ */

  async function showLineages() {
    const v = $("rm-view");
    v.innerHTML = `<p class="rm-intro">a tree for each artist on your list. click any name to see their work. add your own names at the bottom of each tree.</p>
      <div class="rm-trees" id="rm-trees"><div class="rm-loading">${"<i></i>".repeat(6)}</div></div>
      <div class="rm-bridges" id="rm-bridges"></div>`;

    const trees = await Promise.all(mine.map(async (m) => {
      const key = Object.keys(R.LINEAGE).find((k) => plain(k) === plain(m.name));
      let branches;
      if (key) branches = R.LINEAGE[key].map((b) => ({ label: b.label, artists: b.artists.slice() }));
      else {
        const a = await aboutArtist(m.name);
        const near = curatedNear(m.name);
        branches = [
          { label: "influenced by", artists: a.by },
          { label: "influenced", artists: a.on },
          { label: a.movements.length ? a.movements.join(", ") : "movement", artists: a.peers.slice(0, 8) },
          { label: "related", artists: near }
        ].filter((b) => b.artists.length);
      }
      const adds = lineAdds[m.name] || [];
      if (adds.length) branches.push({ label: "my additions", artists: adds, mine: true });
      return { root: m.name, branches };
    }));
    if (!$("rm-trees")) return;

    // bridges: names that show up under two or more of your artists (or are on your list and under another)
    const where = new Map();
    trees.forEach((t) => t.branches.forEach((b) => b.artists.forEach((n) => {
      const k = plain(n); const e = where.get(k) || { name: n, roots: new Set() }; e.roots.add(t.root); where.set(k, e);
    })));
    mine.forEach((m) => { const e = where.get(plain(m.name)); if (e) e.roots.add(m.name); });
    const bridges = [...where.values()].filter((e) => e.roots.size > 1);
    const bridgeSet = new Set(bridges.map((b) => plain(b.name)));

    const nameLink = (n, rootName, mineList) => `<li><a href="${artistHref(n)}" class="${isMine(n) ? "mine" : ""}${bridgeSet.has(plain(n)) ? " bridge" : ""}">${esc(n)}</a>${mineList ? ` <button type="button" class="rm-del" data-root="${esc(rootName)}" data-del="${esc(n)}">×</button>` : ""}</li>`;
    $("rm-trees").innerHTML = trees.map((t) => `
      <div class="rm-tree">
        <h2><a href="${artistHref(t.root)}">${esc(t.root)}</a></h2>
        ${t.branches.map((b) => `<div class="rm-branch"><h4>${esc(b.label)}</h4><ul>${b.artists.map((n) => nameLink(n, t.root, b.mine)).join("")}</ul></div>`).join("") || `<p class="rm-why">no family tree found yet. add names below.</p>`}
        <form class="rm-lineadd" data-root="${esc(t.root)}"><input placeholder="+ add a name under ${esc(t.root)}"></form>
      </div>`).join("") || `<p class="rm-empty">add artists to your list first.</p>`;
    $("rm-bridges").innerHTML = bridges.length ? `<h4>bridges</h4><p class="rm-why">names that connect two or more of your artists</p>
      ${bridges.map((b) => `<a href="${artistHref(b.name)}" class="${isMine(b.name) ? "mine" : ""}">${esc(b.name)}</a> <span class="rm-why">${[...b.roots].filter((r) => plain(r) !== plain(b.name)).map(esc).join(" + ")}</span>`).join("<br>")}` : "";

    v.querySelectorAll(".rm-lineadd").forEach((f) => f.addEventListener("submit", (e) => {
      e.preventDefault();
      const n = f.querySelector("input").value.trim();
      if (!n) return;
      (lineAdds[f.dataset.root] = lineAdds[f.dataset.root] || []).push(n); saveAll(); showLineages();
    }));
    v.querySelectorAll(".rm-del[data-root]").forEach((b) => b.addEventListener("click", () => {
      lineAdds[b.dataset.root] = (lineAdds[b.dataset.root] || []).filter((n) => n !== b.dataset.del); saveAll(); showLineages();
    }));
  }

  /* ============================================================
     3 · THE MIND PALACE: a word bank.
     Every word you put in (the grid, gray, jellyfish, alaska…) is one
     list: the palace. It sorts itself into groups (artists, places,
     nature, colors, materials…) and shows three ways:
       mind palace       the landing page: a slow cloud of every word
       inspiration bin   just the words, as a list
       web               the words floating in their groups; tie them
                         together with colored strings
     ============================================================ */


  // a first guess at a word's group, from the word itself
  function guessGroup(label) {
    const p = plain(label);
    const known = new Set([...R.STARTING_ARTISTS, ...Object.keys(R.LINEAGE), ...Object.values(R.LINEAGE).flat().flatMap((b) => b.artists),
      ...Object.keys(R.RELATED), ...Object.values(R.RELATED).flat()].map(plain));
    if (isMine(label) || known.has(p)) return "artists";
    for (const [g, words] of Object.entries(R.GROUP_WORDS)) {
      if (words.some((w) => new RegExp("(^|\\W)" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "s?(\\W|$)").test(p))) return g;
    }
    if (/^["“]|\bessay\b|\bbook\b|\bletter\b/.test(p)) return "sources";
    return "ideas";
  }
  // a second guess from Wikipedia's one-line description, for words the first guess didn't know
  function groupFromDescription(d) {
    d = plain(d);
    if (!d) return "";
    if (/painter|artist|sculptor|photographer|printmaker|illustrator|designer|architect|weaver|textile/.test(d)) return "artists";
    if (/video game|website|film|television|tv series|band|album|song|franchise|virtual pet|social network|cartoon|anime|comic|toy|brand|singer|musician|rapper|actor|actress/.test(d)) return "culture";
    if (/\b(state|city|country|island|region|province|county|town|capital|mountain|river|lake|borough|neighborhood|village|national park|desert|peninsula|archipelago)\b/.test(d)) return "places";
    if (/species|genus|family of|order of|invertebrate|animal|plant|fung|tree|bird|fish|mammal|insect|flower|weather|phenomenon|cnidaria|mineral/.test(d)) return "nature";
    if (/\bcolou?r\b|hue|shade/.test(d)) return "colors";
    if (/material|pigment|fabric|textile|allotrope|medium|paper/.test(d)) return "materials";
    if (/essay|book|novel|article|poem|treatise/.test(d)) return "sources";
    return "";
  }

  function buildPalace() {
    const old = store.get("webs", null) || [seedWeb(R.GRID_WEB)];
    const P = { words: [], links: [], view: null };
    const byLabel = {}, remap = {};
    old.forEach((W) => {
      W.nodes.forEach((n) => {
        const k = plain(n.label);
        if (!byLabel[k]) {
          let g = OLD_TYPE[n.type] || "ideas";
          if (g === "ideas") { const guess = guessGroup(n.label); if (guess !== "ideas") g = guess; }
          byLabel[k] = { id: n.id, label: n.label, type: g, notes: n.notes || "", url: n.url || "", added: today(), x: 0, y: 0 };
          P.words.push(byLabel[k]);
        }
        remap[n.id] = byLabel[k].id;
      });
      W.links.forEach((l) => {
        const a = remap[l.a], b = remap[l.b];
        if (a && b && a !== b && !P.links.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))) P.links.push({ ...l, a, b });
      });
    });
    sortIntoGroups(P);
    return P;
  }

  // where each group sits: around a ring, in the order of GROUPS
  function groupCenters(P) {
    const present = GROUPS.filter((g) => P.words.some((w) => w.type === g));
    const r = 240 + present.length * 30;
    const out = {};
    present.forEach((g, i) => {
      const a = (i / present.length) * Math.PI * 2 - Math.PI / 2;
      out[g] = { x: Math.round(Math.cos(a) * r * 1.35), y: Math.round(Math.sin(a) * r) };
    });
    return out;
  }
  function spot(c, k) {          // the k-th place in a group: a loose sunflower spiral
    const a = k * 2.399963, d = 64 * Math.sqrt(k + 0.4);
    return { x: Math.round(c.x + Math.cos(a) * d * 1.6), y: Math.round(c.y + Math.sin(a) * d * 0.8) };
  }
  function sortIntoGroups(P) {
    const C = groupCenters(P);
    GROUPS.forEach((g) => P.words.filter((w) => w.type === g).forEach((w, k) => Object.assign(w, spot(C[g], k))));
  }
  function placeWord(P, w) {
    const C = groupCenters(P);
    const k = P.words.filter((x) => x.type === w.type && x !== w).length;
    const s = spot(C[w.type] || { x: 0, y: 0 }, k);
    w.x = s.x + Math.round((Math.random() - 0.5) * 20); w.y = s.y + Math.round((Math.random() - 0.5) * 14);
  }

  // add one word (or several, separated by commas). Returns the words added.
  function addWords(text, near) {
    const added = [];
    text.split(",").map((t) => t.trim()).filter(Boolean).forEach((label) => {
      if (palace.words.some((w) => plain(w.label) === plain(label))) return;
      const w = { id: uid(), label, type: guessGroup(label), notes: "", url: "", added: today(), x: 0, y: 0 };
      palace.words.push(w);
      if (near) { w.x = Math.round(near.x + 150 + Math.random() * 60); w.y = Math.round(near.y + (Math.random() - 0.5) * 200); }
      else placeWord(palace, w);
      added.push(w);
      if (w.type === "ideas") refineGroup(w);
    });
    saveAll();
    return added;
  }
  // ask Wikipedia what the word is; move it to that group (and its spot) if it fits one better
  async function refineGroup(w) {
    const s = await wikiSummary(w.label);
    const g = s && groupFromDescription(s.description);
    if (!g || w.type !== "ideas" || !palace.words.includes(w)) return;
    w.type = g; placeWord(palace, w); saveAll();
    const h = location.hash.slice(1);
    if (h === "bin") showBin(); else if (h === "palace") showPalace(); else if (h === "web") drawBoard();
  }

  function deleteWord(id) {
    palace.words.splice(palace.words.findIndex((x) => x.id === id), 1);
    palace.links = palace.links.filter((l) => l.a !== id && l.b !== id);
    saveAll();
  }

  // the add bar on all three pages
  function wordBar(box, onAdd, extra = "") {
    box.innerHTML = `<form class="rm-bigbar" autocomplete="off">
        <input id="rm-wlabel" placeholder="add a word: the grid, gray, jellyfish, alaska…">
        <button type="submit" class="rm-btn">add</button>
      </form>${extra}<span class="rm-status rm-wsaid"></span>`;
    const input = box.querySelector("input");
    box.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      const added = onAdd(text);
      const said = box.querySelector(".rm-wsaid");
      said.textContent = added.length ? "" : "already in the palace";
      setTimeout(() => { said.textContent = ""; }, 2500);
      input.value = "";
      input.focus();
    });
    input.focus();
    return input;
  }
  let goTo = null;            // a word to select when the web opens
  const toWeb = (id) => { goTo = id; location.hash = "#web"; };

  /* ---------- the mind palace: a cloud of every word ---------- */

  function showPalace() {
    const v = $("rm-view");
    v.innerHTML = `
      <div class="rm-webtop" id="rm-pbar"></div>
      <div class="rm-cloud" id="rm-cloud"></div>
      <p class="rm-why rm-pfoot">${palace.words.length} words · <a href="#bin">inspiration bin</a> · <a href="#web">web</a></p>`;
    wordBar($("rm-pbar"), (t) => { const a = addWords(t); drawCloud(a.map((w) => w.id)); return a; });
    drawCloud([]);
  }
  function drawCloud(fresh) {
    const box = $("rm-cloud");
    if (!box) return;
    const W = palace.words;
    if (!W.length) { box.innerHTML = `<p class="rm-empty">the palace is empty: type a word above.</p>`; return; }
    const xs = W.map((w) => w.x), ys = W.map((w) => w.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const ties = (w) => palace.links.filter((l) => l.a === w.id || l.b === w.id).length;
    box.innerHTML = W.map((w, i) => {
      const left = maxX > minX ? 6 + ((w.x - minX) / (maxX - minX)) * 88 : 50;
      const top = maxY > minY ? 6 + ((w.y - minY) / (maxY - minY)) * 86 : 50;
      const size = 13 + Math.min(11, ties(w) * 1.6);
      const dx = (Math.sin(i * 7.1) * 10).toFixed(1), dy = (Math.cos(i * 3.7) * 8).toFixed(1);
      return `<button type="button" class="rm-cw g-${w.type}${fresh.includes(w.id) ? " fresh" : ""}" data-id="${w.id}"
        style="left:${left}%;top:${top}%;font-size:${size}px;--dx:${dx}px;--dy:${dy}px;animation-duration:${(11 + (i % 7) * 1.3).toFixed(1)}s;animation-delay:-${(i * 1.7) % 11}s"
        title="${esc(w.type)}">${esc(w.label)}</button>`;
    }).join("");
    // nudge words apart so none sit on top of each other (biggest first keep their place)
    const bw = box.clientWidth, bh = box.clientHeight, placed = [];
    [...box.querySelectorAll(".rm-cw")].sort((a, b) => parseFloat(b.style.fontSize) - parseFloat(a.style.fontSize)).forEach((el) => {
      const w = el.offsetWidth + 14, h = el.offsetHeight + 6;
      let x = el.offsetLeft, y = el.offsetTop;
      const hit = (x, y) => placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 && Math.abs(p.y - y) < (p.h + h) / 2);
      for (let k = 0; k < 400 && hit(x, y); k++) { const a = k * 0.6, d = 6 + k * 2.2; x = el.offsetLeft + Math.cos(a) * d * 1.6; y = el.offsetTop + Math.sin(a) * d; }
      x = Math.max(w / 2, Math.min(bw - w / 2, x)); y = Math.max(h / 2, Math.min(bh - h / 2, y));
      el.style.left = x + "px"; el.style.top = y + "px";
      placed.push({ x, y, w, h });
    });
    box.querySelectorAll(".rm-cw").forEach((b) => b.addEventListener("click", () => toWeb(b.dataset.id)));
    const foot = document.querySelector(".rm-pfoot");
    if (foot) foot.firstChild.textContent = `${W.length} words · `;
  }

  /* ---------- the inspiration bin: just the words ---------- */

  function showBin() {
    const v = $("rm-view");
    const order = store.get("binOrder", "new");
    v.innerHTML = `
      <div class="rm-webtop" id="rm-bbar"></div>
      <div class="rm-filters">
        <span>order <select id="rm-border"><option value="new">newest first</option><option value="az">a to z</option><option value="group">by group</option></select></span>
        <span class="rm-why">${palace.words.length} words</span>
      </div>
      <p class="rm-why">everything that could ever inspire you: one word is enough (the grid, moss, alaska, audrey hepburn). each word opens on wikipedia; hover to see it.</p>
      <div class="rm-bin" id="rm-bin"></div>
      <div class="rm-prompts" id="rm-prompts"></div>`;
    wordBar($("rm-bbar"), (t) => { const a = addWords(t); showBin(); return a; });
    $("rm-border").value = order;
    $("rm-border").addEventListener("change", (e) => { store.set("binOrder", e.target.value); showBin(); });
    const row = (w) => `<li>
        <a class="rm-bword" data-word="${esc(w.label)}" href="${esc(w.url || "https://en.wikipedia.org/wiki/Special:Search?search=" + encodeURIComponent(w.label))}" target="_blank" rel="noopener">${esc(w.label)}</a>
        <select class="rm-bgroup" data-id="${w.id}" aria-label="group">${GROUPS.map((g) => `<option${g === w.type ? " selected" : ""}>${g}</option>`).join("")}</select>
        <span class="rm-why rm-bdate">${esc(w.added || "")}</span>
        <button type="button" class="rm-del" data-del="${w.id}" aria-label="delete ${esc(w.label)}">×</button>
      </li>`;
    const list = palace.words.slice();
    let html;
    if (order === "group") {
      html = GROUPS.filter((g) => list.some((w) => w.type === g)).map((g) => `<h4>${g}</h4><ul>${list.filter((w) => w.type === g)
        .sort((a, b) => a.label.localeCompare(b.label)).map(row).join("")}</ul>`).join("");
    } else {
      if (order === "az") list.sort((a, b) => a.label.localeCompare(b.label));
      else list.reverse();
      html = `<ul>${list.map(row).join("")}</ul>`;
    }
    $("rm-bin").innerHTML = html || `<p class="rm-empty">the bin is empty: type a word above.</p>`;
    v.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => toWeb(b.dataset.go)));
    hoverPictures($("rm-bin"));
    drawPrompts(() => showBin());
    v.querySelectorAll(".rm-bgroup").forEach((s) => s.addEventListener("change", () => {
      const w = palace.words.find((x) => x.id === s.dataset.id);
      w.type = s.value; placeWord(palace, w); saveAll(); if (order === "group") showBin();
    }));
    v.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      if (!confirmTwice(b, "delete?")) return;
      deleteWord(b.dataset.del); showBin();
    }));
  }

  /* ---------- the web: the words in their groups, tied with strings ---------- */

  function seedWeb(src) {
    return {
      id: uid(), name: src.name,
      nodes: src.nodes.map((n) => ({ ...n })),
      links: src.links.map(([a, b, c, label]) => ({ id: uid(), a, b, color: (R.STRING_COLORS[c] || R.STRING_COLORS[0]).color, label: label || "" })),
      view: null
    };
  }

  let sel = null;          // {kind:"node"|"link", id}
  let stringColor = legend[0].color;
  let outline = false;

  function showWeb() {
    const v = $("rm-view");
    const W = palace;
    v.innerHTML = `
      <div class="rm-webtop" id="rm-wbar"></div>
      <div class="rm-webtools">
        <button type="button" id="rm-wsort">sort into groups</button>
        <span class="rm-legend">string: ${legend.map((l, i) => `<button type="button" class="rm-sw${l.color === stringColor ? " on" : ""}" data-i="${i}" style="--c:${l.color}" title="${esc(l.means)}"></button><input class="rm-means" data-i="${i}" value="${esc(l.means)}" size="${Math.max(5, Math.round(l.means.length * 0.8))}">`).join("")}</span>
        <span class="rm-zoom"><button type="button" data-z="-1">−</button><button type="button" data-z="1">+</button><button type="button" data-z="0">fit</button>
        <button type="button" id="rm-woutline">${outline ? "board" : "outline"}</button></span>
      </div>
      <div class="rm-board rm-wordboard" id="rm-board"${outline ? " hidden" : ""}>
        <div class="rm-plane" id="rm-plane"><svg class="rm-strings" id="rm-strings" viewBox="-5000 -5000 10000 10000"></svg></div>
      </div>
      <div class="rm-outline" id="rm-outline"${outline ? "" : " hidden"}></div>
      <p class="rm-why rm-hint">drag a word to move it · drag empty space to move around · click a word, then shift-click another to tie a string · click a string to recolor or cut it · ctrl + scroll (or pinch) to zoom</p>`;

    wordBar($("rm-wbar"), (t) => {
      const from = sel && sel.kind === "node" && $("rm-wauto") && $("rm-wauto").checked ? W.words.find((n) => n.id === sel.id) : null;
      const added = addWords(t, from);
      if (from) added.forEach((w) => W.links.push({ id: uid(), a: from.id, b: w.id, color: stringColor, label: "" }));
      saveAll(); drawBoard(); if (outline) drawOutline(W);
      if (added.length) select({ kind: "node", id: added[added.length - 1].id }, false);
      return added;
    }, `<label class="rm-why rm-auto"><input type="checkbox" id="rm-wauto" ${store.get("wauto", false) ? "checked" : ""}> tie it to the selected word</label>`);
    $("rm-wauto").addEventListener("change", (e) => store.set("wauto", e.target.checked));

    $("rm-wsort").addEventListener("click", () => {
      if (!confirmTwice($("rm-wsort"), "click again: this moves every word back into its group")) return;
      sortIntoGroups(W); saveAll(); drawBoard(); fitView(W);
    });
    v.querySelectorAll(".rm-sw").forEach((b) => b.addEventListener("click", () => {
      stringColor = legend[+b.dataset.i].color;
      v.querySelectorAll(".rm-sw").forEach((x) => x.classList.toggle("on", x === b));
      if (sel && sel.kind === "link") { W.links.find((l) => l.id === sel.id).color = stringColor; saveAll(); drawStrings(); openLinkPanel(sel.id); }
    }));
    v.querySelectorAll(".rm-means").forEach((inp) => inp.addEventListener("input", () => { legend[+inp.dataset.i].means = inp.value; inp.size = Math.max(5, Math.round(inp.value.length * 0.8)); saveAll(); }));
    v.querySelectorAll(".rm-zoom [data-z]").forEach((b) => b.addEventListener("click", () => {
      const z = +b.dataset.z;
      if (!z) fitView(W); else zoomAt(W, z > 0 ? 1.2 : 1 / 1.2);
    }));
    $("rm-woutline").addEventListener("click", () => { outline = !outline; showWeb(); });

    if (outline) drawOutline(W);
    else {
      setupBoard(W); drawBoard();
      if (!W.view) fitView(W); else applyView(W);
      if (goTo && W.words.some((w) => w.id === goTo)) {
        const w = W.words.find((x) => x.id === goTo), b = $("rm-board");
        W.view = { z: Math.max(W.view.z, 0.9), x: 0, y: 0 };
        W.view.x = b.clientWidth / 2 - w.x * W.view.z; W.view.y = b.clientHeight / 2 - w.y * W.view.z;
        applyView(W); select({ kind: "node", id: goTo });
      }
    }
    goTo = null;
  }

  const NODE_W = 150;

  function screenCenter(W) {
    const b = $("rm-board"); const v = W.view || { x: 0, y: 0, z: 1 };
    if (!b) return { x: 0, y: 0 };
    return { x: (b.clientWidth / 2 - v.x) / v.z + (Math.random() - 0.5) * 80, y: (b.clientHeight / 2 - v.y) / v.z + (Math.random() - 0.5) * 80 };
  }

  function applyView(W) {
    const p = $("rm-plane"); if (!p) return;
    const v = W.view;
    p.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
  }
  function fitView(W) {
    const b = $("rm-board"); if (!b) return;
    const bw = b.clientWidth, bh = b.clientHeight;
    if (!W.nodes.length) { W.view = { x: bw / 2, y: bh / 2, z: 1 }; applyView(W); saveAll(); return; }
    const xs = W.nodes.map((n) => n.x), ys = W.nodes.map((n) => n.y);
    const minX = Math.min(...xs) - NODE_W, maxX = Math.max(...xs) + NODE_W, minY = Math.min(...ys) - 70, maxY = Math.max(...ys) + 60;
    const z = Math.min(1.3, Math.max(0.3, Math.min(bw / (maxX - minX), bh / (maxY - minY))));
    W.view = { z, x: bw / 2 - ((minX + maxX) / 2) * z, y: bh / 2 - ((minY + maxY) / 2) * z };
    applyView(W); saveAll();
  }
  function zoomAt(W, f, cx, cy) {
    const b = $("rm-board"); if (!b) return;
    const v = W.view;
    if (cx == null) { cx = b.clientWidth / 2; cy = b.clientHeight / 2; }
    const z = Math.min(2.5, Math.max(0.2, v.z * f));
    v.x = cx - (cx - v.x) * (z / v.z); v.y = cy - (cy - v.y) * (z / v.z); v.z = z;
    applyView(W); saveAll();
  }

  function drawBoard() {
    const W = palace, plane = $("rm-plane");
    if (!plane) return;
    plane.querySelectorAll(".rm-node, .rm-glabel").forEach((n) => n.remove());
    // a faint name over each group
    GROUPS.forEach((g) => {
      const ws = W.words.filter((w) => w.type === g);
      if (!ws.length) return;
      const el = document.createElement("div");
      el.className = "rm-glabel";
      el.style.left = Math.round(ws.reduce((t, w) => t + w.x, 0) / ws.length) + "px";
      el.style.top = (Math.min(...ws.map((w) => w.y)) - 46) + "px";
      el.textContent = g;
      plane.appendChild(el);
    });
    const ties = (n) => W.links.filter((l) => l.a === n.id || l.b === n.id).length;
    W.words.forEach((n) => {
      const el = document.createElement("div");
      el.className = "rm-node rm-word g-" + n.type + (sel && sel.kind === "node" && sel.id === n.id ? " sel" : "") + (n.notes ? " has-notes" : "");
      el.dataset.id = n.id;
      el.style.left = n.x + "px"; el.style.top = n.y + "px";
      el.style.fontSize = (15 + Math.min(9, ties(n) * 1.4)) + "px";
      el.textContent = n.label;
      plane.appendChild(el);
    });
    drawStrings();
  }

  function stringPath(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
    const sag = Math.min(70, dist * 0.14);
    return `M${a.x},${a.y} Q${(a.x + b.x) / 2},${(a.y + b.y) / 2 + sag} ${b.x},${b.y}`;
  }
  function drawStrings() {
    const W = palace, svg = $("rm-strings");
    if (!svg) return;
    const byId = Object.fromEntries(W.words.map((n) => [n.id, n]));
    svg.innerHTML = W.links.filter((l) => byId[l.a] && byId[l.b]).map((l) => {
      const d = stringPath(byId[l.a], byId[l.b]);
      const on = sel && sel.kind === "link" && sel.id === l.id;
      const a = byId[l.a], b = byId[l.b];
      return `<g data-link="${l.id}" class="${on ? "sel" : ""}">
        <path d="${d}" class="rm-hit"/>
        <path d="${d}" class="rm-str" stroke="${esc(l.color)}" stroke-width="${on ? 3 : 1.6}"/>
        ${l.label ? `<text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 + Math.min(70, Math.hypot(b.x - a.x, b.y - a.y) * 0.14) / 2 + 14}" class="rm-strlabel">${esc(l.label)}</text>` : ""}
      </g>`;
    }).join("");
  }

  function select(s, openIt = true) {
    sel = s;
    document.querySelectorAll(".rm-node").forEach((n) => n.classList.toggle("sel", !!s && s.kind === "node" && n.dataset.id === s.id));
    drawStrings();
    if (!s) closePanel();
    else if (openIt || s.kind === "node") s.kind === "node" ? openNodePanel(s.id) : openLinkPanel(s.id);
  }

  function setupBoard(W) {
    const board = $("rm-board");
    let drag = null;   // {mode:"node"|"pan", id, sx, sy, ox, oy, moved}

    board.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const nodeEl = e.target.closest(".rm-node");
      const linkEl = e.target.closest("[data-link]");
      if (linkEl && !nodeEl) { select({ kind: "link", id: linkEl.dataset.link }); return; }
      board.setPointerCapture(e.pointerId);
      if (nodeEl) {
        const n = W.words.find((x) => x.id === nodeEl.dataset.id);
        drag = { mode: "node", id: n.id, el: nodeEl, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false, shift: e.shiftKey };
      } else {
        drag = { mode: "pan", sx: e.clientX, sy: e.clientY, ox: W.view.x, oy: W.view.y, moved: false };
      }
    });
    board.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (!drag.moved) return;
      if (drag.mode === "node") {
        const n = W.words.find((x) => x.id === drag.id);
        n.x = Math.round(drag.ox + dx / W.view.z); n.y = Math.round(drag.oy + dy / W.view.z);
        drag.el.style.left = n.x + "px"; drag.el.style.top = n.y + "px";
        drawStrings();
      } else {
        W.view.x = drag.ox + dx; W.view.y = drag.oy + dy; applyView(W);
      }
    });
    board.addEventListener("pointerup", () => {
      if (!drag) return;
      const d = drag; drag = null;
      if (d.moved) { saveAll(); if (d.mode === "node") drawBoard(); return; }
      if (d.mode === "pan") { select(null); return; }
      if ((d.shift || connecting) && sel && sel.kind === "node" && sel.id !== d.id) {
        tie(W, sel.id, d.id);
        connecting = false;
        select({ kind: "node", id: d.id });
      } else select({ kind: "node", id: d.id });
    });
    board.addEventListener("wheel", (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = board.getBoundingClientRect();
      zoomAt(W, e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    board.addEventListener("dblclick", (e) => {
      if (e.target.closest(".rm-node")) return;
      $("rm-wlabel").focus();
    });
  }

  let connecting = false;
  function tie(W, a, b) {
    if (W.links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return;
    W.links.push({ id: uid(), a, b, color: stringColor, label: "" });
    saveAll(); drawBoard();
  }

  function meansOf(color) { const l = legend.find((x) => x.color === color); return l ? l.means : ""; }

  function openNodePanel(id) {
    const W = palace, n = W.words.find((x) => x.id === id);
    if (!n) return;
    const links = W.links.filter((l) => l.a === id || l.b === id);
    const other = (l) => W.words.find((x) => x.id === (l.a === id ? l.b : l.a));
    const p = $("rm-panel");
    p.innerHTML = `
      <button class="rm-x" id="rm-x" type="button" aria-label="close">×</button>
      <div class="rm-nedit">
        <input id="rm-nlabel" class="rm-ititle" value="${esc(n.label)}">
        <span class="rm-why">group <select id="rm-ntype">${GROUPS.map((t) => `<option${t === n.type ? " selected" : ""}>${t}</option>`).join("")}</select></span>
        <textarea id="rm-nnotes" rows="8" placeholder="notes: why it's here, what it reminds you of, where it's from…">${esc(n.notes)}</textarea>
        <input id="rm-nurl" placeholder="a link (optional)" value="${esc(n.url || "")}">
        <div class="rm-row">
          <button type="button" class="rm-btn quiet" id="rm-lookup">look it up on Wikipedia</button>
          ${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">open link ↗</a>` : ""}
        </div>
        <span class="rm-status" id="rm-lookst"></span>
        ${n.type === "artists" ? `<div class="rm-row"><a href="${artistHref(n.label)}">see their work →</a>${isMine(n.label) ? "" : ` <button type="button" class="rm-btn quiet" id="rm-nmine">+ add to my artists</button>`}</div>` : ""}
        <div class="rm-row"><button type="button" class="rm-btn" id="rm-ntie">tie a string to…</button><span class="rm-why">then click another word</span></div>
        <h4>strings (${links.length})</h4>
        <ul class="rm-nlinks">${links.map((l) => { const o = other(l); return o ? `<li><span class="rm-dot" style="--c:${esc(l.color)}"></span><button type="button" data-go="${o.id}">${esc(o.label)}</button>${l.label ? ` <span class="rm-why">${esc(l.label)}</span>` : ` <span class="rm-why">${esc(meansOf(l.color))}</span>`} <button type="button" class="rm-del" data-cut="${l.id}">cut</button></li>` : ""; }).join("") || `<li class="rm-why">no strings yet</li>`}</ul>
        <button type="button" class="rm-del" id="rm-ndel">delete this word</button>
      </div>`;
    p.hidden = false; requestAnimationFrame(() => p.classList.add("open"));

    const refresh = () => { saveAll(); drawBoard(); };
    $("rm-x").addEventListener("click", () => select(null));
    $("rm-nlabel").addEventListener("input", (e) => { n.label = e.target.value; refresh(); });
    $("rm-ntype").addEventListener("change", (e) => { n.type = e.target.value; placeWord(W, n); refresh(); openNodePanel(id); });
    $("rm-nnotes").addEventListener("input", (e) => { n.notes = e.target.value; saveAll(); });
    $("rm-nurl").addEventListener("change", (e) => { n.url = e.target.value.trim(); saveAll(); openNodePanel(id); });
    $("rm-lookup").addEventListener("click", async () => {
      $("rm-lookst").textContent = "looking…";
      const s = await wikiSummary(n.label);
      if (!s) { $("rm-lookst").textContent = "nothing found on Wikipedia under that name"; return; }
      n.notes = (n.notes ? n.notes.trim() + "\n\n" : "") + `[wikipedia: ${s.title}] ${s.extract}`;
      if (!n.url) n.url = s.url;
      saveAll(); openNodePanel(id); drawBoard();
    });
    if ($("rm-nmine")) $("rm-nmine").addEventListener("click", (e) => { addArtist(n.label); e.target.textContent = "added ✓"; e.target.disabled = true; });
    $("rm-ntie").addEventListener("click", () => { connecting = true; $("rm-ntie").textContent = "now click a word…"; });
    p.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => select({ kind: "node", id: b.dataset.go })));
    p.querySelectorAll("[data-cut]").forEach((b) => b.addEventListener("click", () => {
      W.links = W.links.filter((l) => l.id !== b.dataset.cut); saveAll(); drawBoard(); openNodePanel(id);
    }));
    $("rm-ndel").addEventListener("click", () => {
      if (!confirmTwice($("rm-ndel"), "click again to delete")) return;
      deleteWord(id); select(null); drawBoard();
    });
  }

  function openLinkPanel(id) {
    const W = palace, l = W.links.find((x) => x.id === id);
    if (!l) return;
    const a = W.words.find((x) => x.id === l.a), b = W.words.find((x) => x.id === l.b);
    const p = $("rm-panel");
    p.innerHTML = `
      <button class="rm-x" id="rm-x" type="button" aria-label="close">×</button>
      <div class="rm-nedit">
        <h4>string</h4>
        <p><button type="button" data-go="${a.id}">${esc(a.label)}</button> — <button type="button" data-go="${b.id}">${esc(b.label)}</button></p>
        <div class="rm-row">${legend.map((g) => `<button type="button" class="rm-sw${g.color === l.color ? " on" : ""}" data-c="${esc(g.color)}" style="--c:${g.color}" title="${esc(g.means)}"></button> <span class="rm-why">${esc(g.means)}</span>`).join(" ")}</div>
        <input id="rm-llabel" placeholder="what connects them (optional, shows on the string)" value="${esc(l.label)}">
        <button type="button" class="rm-del" id="rm-lcut">cut this string</button>
      </div>`;
    p.hidden = false; requestAnimationFrame(() => p.classList.add("open"));
    $("rm-x").addEventListener("click", () => select(null));
    p.querySelectorAll("[data-c]").forEach((s) => s.addEventListener("click", () => { l.color = s.dataset.c; saveAll(); drawStrings(); openLinkPanel(id); }));
    p.querySelectorAll("[data-go]").forEach((s) => s.addEventListener("click", () => select({ kind: "node", id: s.dataset.go })));
    $("rm-llabel").addEventListener("input", (e) => { l.label = e.target.value; saveAll(); drawStrings(); });
    $("rm-lcut").addEventListener("click", () => { W.links = W.links.filter((x) => x.id !== id); saveAll(); select(null); drawBoard(); });
  }

  async function wikiSummary(q) {
    const sum = (t) => getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, "_"))}`);
    try {
      let s;
      try { s = await sum(q); } catch (e) {
        const o = await getJSON(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=1&namespace=0&format=json&origin=*`);
        if (!o[1] || !o[1][0]) return null;
        s = await sum(o[1][0]);
      }
      if (!s || !s.extract || s.type === "disambiguation") return null;
      return { title: s.title, extract: s.extract, description: s.description || "", thumb: s.thumbnail ? s.thumbnail.source : "", url: s.content_urls && s.content_urls.desktop ? s.content_urls.desktop.page : "" };
    } catch (e) { return null; }
  }

  // the web as text: every word by group, its notes, and what it's tied to
  function drawOutline(W) {
    const byType = {};
    W.words.forEach((n) => (byType[n.type] = byType[n.type] || []).push(n));
    const ties = (n) => W.links.filter((l) => l.a === n.id || l.b === n.id).map((l) => {
      const o = W.words.find((x) => x.id === (l.a === n.id ? l.b : l.a));
      return o ? `<span class="rm-tie"><span class="rm-dot" style="--c:${esc(l.color)}"></span>${esc(o.label)}${l.label ? ` (${esc(l.label)})` : ""}</span>` : "";
    }).join("");
    $("rm-outline").innerHTML = GROUPS.filter((t) => byType[t]).map((t) => `
      <h4>${esc(t)}</h4>
      ${byType[t].sort((a, b) => a.label.localeCompare(b.label)).map((n) => `
        <div class="rm-oitem"><b>${esc(n.label)}</b>${n.url ? ` <a href="${esc(n.url)}" target="_blank" rel="noopener">↗</a>` : ""}
          ${n.notes ? `<p>${esc(n.notes).replace(/\n/g, "<br>")}</p>` : ""}
          <p class="rm-ties">${ties(n)}</p></div>`).join("")}`).join("") || `<p class="rm-empty">the palace is empty: type a word in the bar above.</p>`;
  }

  /* ============================================================
     2 · NATURE: photographs of the earth, from your tags.
     The pictures come from Wikimedia Commons, only from its
     "featured" and "quality" photographs (the best-rated ones),
     so it stays close to a nature magazine. Each one is credited.
     ============================================================ */

  async function natureFor(tag) {
    const key = "nat:" + plain(tag);
    const c = cacheGet(key, 1);
    if (c) return c;
    const q = `${tag} filetype:bitmap incategory:Featured_pictures_on_Wikimedia_Commons|Quality_images`;
    const page = (off) => getJSON(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=40&gsroffset=${off}&gsrsearch=${encodeURIComponent(q)}&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=600&iiextmetadatafilter=Artist|LicenseShortName|DateTimeOriginal|ObjectName`)
      .then((j) => Object.values((j.query && j.query.pages) || {})).catch(() => []);
    const pages = (await Promise.all([page(0), page(40 + Math.floor(Math.random() * 120))])).flat();
    const text = (html) => { const d = document.createElement("div"); d.innerHTML = html || ""; return d.textContent.trim(); };
    const seen = new Set();
    const list = pages.filter((p) => p.imageinfo && p.imageinfo[0] && p.imageinfo[0].thumburl && !seen.has(p.pageid) && seen.add(p.pageid)).map((p) => {
      const ii = p.imageinfo[0], m = ii.extmetadata || {};
      const thumb = ii.thumburl;
      return {
        id: "wm-" + p.pageid, kind: "nature", museum: "Wikimedia Commons", tag,
        title: text(m.ObjectName && m.ObjectName.value) || p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/_/g, " "),
        artist: "photo: " + (text(m.Artist && m.Artist.value).slice(0, 80) || "unknown"),
        date: text(m.DateTimeOriginal && m.DateTimeOriginal.value).slice(0, 10),
        medium: m.LicenseShortName ? text(m.LicenseShortName.value) : "",
        thumb, img: thumb.replace(/\/600px-/, "/1600px-"),
        ratio: ii.thumbwidth && ii.thumbheight ? ii.thumbwidth / ii.thumbheight : null,
        url: ii.descriptionurl
      };
    });
    if (list.length) cacheSet(key, list);
    return list;
  }

  /* ============================================================
     3 · SPLIT SCREEN: art you saved on the left, nature on the
     right. Click a picture to put it on its side's table, then
     click anywhere on it to pick that color.
     ============================================================ */

  let splitLeft = "art";   // "art" (saved from step 1) or "mine" (your 2026 work)

  function myWorkAsItems() {
    const list = typeof worksWithTags === "function" ? worksWithTags([String(R.MY_WORK_TAG || "2026")]).slice().reverse() : [];
    return list.map((w) => ({ id: "me-" + w.file, kind: "mine", title: w.title || "", artist: "me", thumb: w.file, img: w.file }));
  }

  function showSplit() {
    const v = $("rm-view");
    const art = collection.filter((w) => w.kind !== "nature" && w.kind !== "wreck" && (w.img || w.thumb));
    const nat = collection.filter((w) => w.kind === "nature" || w.kind === "wreck");
    const leftList = splitLeft === "mine" ? myWorkAsItems() : art;
    v.innerHTML = `
      <p class="rm-intro">art on the left, the world on the right. roll the dice on each side for a new pair. pick colors, or change a photograph: pixelate it, blur it, burn it. (the tools work on real photographs and your own work; other artists' work stays as it is.)</p>
      <div class="rm-mbtns rm-tools" id="rm-tools">${SPLIT_TOOLS.map(([k, l]) => `<button type="button" data-tool="${k}" class="${k === splitTool ? "on" : ""}">${l}</button>`).join("")}
        <span>size <input type="range" id="rm-wsize" min="6" max="120" value="${store.get("wsize", 40)}"></span>
        <button type="button" id="rm-wundo">undo</button><button type="button" id="rm-wreset">start over</button>
        <button type="button" id="rm-wsave">keep this version</button><button type="button" id="rm-wdl">download</button>
        <span class="rm-status" id="rm-wst"></span></div>
      <div class="rm-split">
        <div class="rm-side">
          <h4><button type="button" class="${splitLeft === "art" ? "on" : ""}" data-left="art">art I saved (${art.length})</button> · <button type="button" class="${splitLeft === "mine" ? "on" : ""}" data-left="mine">my work</button></h4>
          <div class="rm-stage" id="rm-stageL"></div>
          <div class="rm-minis" id="rm-minisL"></div>
        </div>
        <div class="rm-side">
          <h4>nature I saved (${nat.length})</h4>
          <div class="rm-stage" id="rm-stageR"></div>
          <div class="rm-minis" id="rm-minisR"></div>
        </div>
      </div>
      <div class="rm-picked">
        <h4>picked <a href="#bank" class="rm-why">the color bank →</a></h4>
        <div class="rm-swatches" id="rm-recent"></div>
      </div>
      <div class="rm-loupe" id="rm-loupe" hidden></div>`;

    v.querySelectorAll("[data-left]").forEach((b) => b.addEventListener("click", () => { splitLeft = b.dataset.left; showSplit(); }));
    setupSide("L", leftList, splitLeft === "mine" ? "mine" : "art",
      splitLeft === "mine" ? "nothing tagged " + (R.MY_WORK_TAG || "2026") + " in works.js yet." : `nothing saved yet: press + on art in <a href="#images">1 · images</a>.`);
    setupSide("R", nat, "nature", `nothing saved yet: press + on photographs in <a href="#images">1 · images</a>.`);
    drawRecent();

    // the tool bar works on whichever picture you touched last
    const st = $("rm-wst");
    v.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => {
      splitTool = b.dataset.tool; store.set("splitTool", splitTool);
      v.querySelectorAll("[data-tool]").forEach((x) => x.classList.toggle("on", x === b));
      v.classList.toggle("rm-wrecking", splitTool !== "pick");
    }));
    v.classList.toggle("rm-wrecking", splitTool !== "pick");
    $("rm-wsize").addEventListener("change", (e) => store.set("wsize", +e.target.value));
    const last = () => lastStage && lastStage.isConnected && lastStage._wreck;
    $("rm-wundo").addEventListener("click", () => { const k = last(); if (k && k.undo.length) k.ctx.putImageData(k.undo.pop(), 0, 0); });
    $("rm-wreset").addEventListener("click", () => { const k = last(); if (k) loadStage(lastStage, k.w, k.side, { tools: true }); });
    $("rm-wdl").addEventListener("click", () => {
      const k = last(); if (!k || !k.changed) { st.textContent = "change a photograph first"; return; }
      const a = document.createElement("a"); a.href = k.cv.toDataURL("image/png"); a.download = "changed-" + today() + ".png"; a.click();
    });
    $("rm-wsave").addEventListener("click", () => {
      const k = last(); if (!k || !k.changed) { st.textContent = "change a photograph first"; return; }
      const sc = Math.min(1, 700 / Math.max(k.cv.width, k.cv.height)), c = document.createElement("canvas");
      c.width = Math.round(k.cv.width * sc); c.height = Math.round(k.cv.height * sc);
      c.getContext("2d").drawImage(k.cv, 0, 0, c.width, c.height);
      const data = c.toDataURL("image/jpeg", 0.8);
      collection.push({ id: "wr-" + uid(), kind: "wreck", museum: "+", title: "changed: " + (k.w.title || "untitled"), artist: "me", thumb: data, img: data, url: "", tags: ["changed"], note: "", saved: today() });
      saveAll(); st.textContent = "kept: it's with your saved pictures now";
    });
  }

  /* the tools from obliterate, now in the split screen: pick a color (the default),
     or pixelate, blur, burn, smear with water, pour, scratch. Only on real photographs
     and your own work: never on someone else's art. */
  const SPLIT_TOOLS = [["pick", "pick a color"], ["pixelate", "pixelate"], ["blur", "blur"], ["burn", "burn"], ["water", "smear with water"], ["pour", "pour (click)"], ["scratch", "scratch"]];
  let splitTool = store.get("splitTool", "pick");
  let lastStage = null;
  const canChange = (side) => side === "nature" || side === "mine";

  function wreckDab(k, tool, x, y, lx, ly) {
    const { ctx, cv } = k, r = +(($("rm-wsize") || {}).value || 40) / 2;
    const circle = () => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip(); };
    ctx.save();
    if (tool === "pixelate") {
      const b = Math.max(6, Math.round(r / 2.5));
      const x0 = Math.floor((x - r) / b) * b, y0 = Math.floor((y - r) / b) * b;
      for (let yy = y0; yy < y + r; yy += b) for (let xx = x0; xx < x + r; xx += b) {
        if (xx < 0 || yy < 0 || xx >= cv.width || yy >= cv.height) continue;
        const d = ctx.getImageData(xx, yy, Math.min(b, cv.width - xx), Math.min(b, cv.height - yy)).data;
        let R2 = 0, G = 0, B = 0; const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) { R2 += d[i]; G += d[i + 1]; B += d[i + 2]; }
        ctx.fillStyle = `rgb(${R2 / n | 0},${G / n | 0},${B / n | 0})`; ctx.fillRect(xx, yy, b, b);
      }
    } else if (tool === "blur") {
      circle(); ctx.filter = `blur(${Math.max(2, r / 6)}px)`; ctx.drawImage(cv, 0, 0);
    } else if (tool === "burn") {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(20,8,0,0.35)"); g.addColorStop(0.6, "rgba(90,40,5,0.18)"); g.addColorStop(1, "rgba(120,60,10,0)");
      ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    } else if (tool === "water" && lx != null) {
      circle(); ctx.globalAlpha = 0.55; ctx.drawImage(cv, lx - r, ly - r, r * 2, r * 2, x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = 0.04; ctx.fillStyle = "#dfe9ee"; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    } else if (tool === "scratch") {
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = Math.max(1, r / 14);
      for (let q = 0; q < 3; q++) { ctx.beginPath(); ctx.moveTo(x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r); ctx.lineTo(x + (Math.random() - 0.5) * r * 2, y + (Math.random() - 0.5) * r * 2); ctx.stroke(); }
    } else if (tool === "pour") {      // water runs down from where you click, dragging the picture with it
      const streams = 3 + Math.floor(Math.random() * 4);
      for (let q = 0; q < streams; q++) {
        let sx = x + (Math.random() - 0.5) * r * 2, sy = y; const w = 3 + Math.random() * r / 3, len = cv.height * (0.15 + Math.random() * 0.5);
        for (let j = 0; j < len && sy < cv.height; j += 2) { ctx.globalAlpha = 0.5; ctx.drawImage(cv, sx, sy, w, 3, sx, sy + 2, w, 3); sx += (Math.random() - 0.5) * 1.5; sy += 2; }
      }
    }
    ctx.restore();
    k.changed = true;
  }

  function setupSide(k, list, side, emptyMsg) {
    const stage = $("rm-stage" + k), minis = $("rm-minis" + k);
    if (!list.length) { stage.innerHTML = `<p class="rm-empty">${emptyMsg}</p>`; return; }
    minis.innerHTML = list.map((w, i) => `<button type="button" data-i="${i}">${w.thumb ? `<img src="${esc(w.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</button>`).join("");
    minis.hidden = true;
    minis.insertAdjacentHTML("beforebegin", `<div class="rm-dicerow"><button type="button" class="rm-dice" title="roll for another">⚄ roll</button> <button type="button" class="rm-why rm-choose">or choose</button></div>`);
    let at = -1;
    const show = (i) => {
      at = i;
      minis.querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.i === i));
      loadStage(stage, list[i], side, { tools: true });
    };
    const roll = () => show(list.length < 2 ? 0 : (at + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length);
    minis.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => show(+b.dataset.i)));
    minis.previousElementSibling.querySelector(".rm-dice").addEventListener("click", (e) => {
      const d = e.currentTarget; d.classList.remove("spin"); void d.offsetWidth; d.classList.add("spin"); roll();
    });
    minis.previousElementSibling.querySelector(".rm-choose").addEventListener("click", () => { minis.hidden = !minis.hidden; });
    roll();
  }

  // draw a picture on a canvas so its colors can be read
  function loadStage(stage, w, side, opts = {}) {
    stage.innerHTML = `<canvas></canvas><p class="rm-why rm-stagecap">${esc(w.title || "")}${w.artist ? " · " + esc(w.artist) : ""}</p>`;
    const cv = stage.querySelector("canvas"), ctx = cv.getContext("2d", { willReadFrequently: true });
    const img = new Image();
    let readable = true;
    const draw = () => {
      const maxW = stage.clientWidth, maxH = Math.max(260, window.innerHeight * 0.48);
      const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1.5);
      cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      try { ctx.getImageData(0, 0, 1, 1); } catch (e) { readable = false; }
      if (!readable) stage.querySelector(".rm-stagecap").innerHTML += `<br>this museum doesn't let browsers read its pictures' colors. try another one.`;
    };
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = draw;
    img.onerror = () => {   // the museum won't allow color reading: show it anyway
      if (img.crossOrigin) { readable = false; img.crossOrigin = null; img.src = (w.img || w.thumb) + ""; }
    };
    img.src = w.img || w.thumb;

    const loupe = $("rm-loupe");
    const colorAt = (e) => {
      const r = cv.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) * cv.width / r.width), y = Math.floor((e.clientY - r.top) * cv.height / r.height);
      // average a little 5 x 5 square so one stray pixel doesn't decide
      const d = ctx.getImageData(Math.max(0, x - 2), Math.max(0, y - 2), 5, 5).data;
      let rr = 0, gg = 0, bb = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
      return toHex(rr / n, gg / n, bb / n);
    };
    cv.addEventListener("mousemove", (e) => {
      if (!readable) return;
      const hex = colorAt(e);
      loupe.hidden = false;
      loupe.style.left = e.clientX + 16 + "px"; loupe.style.top = e.clientY + 16 + "px";
      loupe.innerHTML = `<i style="background:${hex}"></i>${hex}`;
    });
    cv.addEventListener("mouseleave", () => { loupe.hidden = true; });
    // the split screen's tools: drag on a photograph to change it
    if (opts.tools) {
      const k = stage._wreck = { cv, ctx, w, side, undo: [], changed: false };
      let down = false, lx = null, ly = null;
      const at = (e) => { const r = cv.getBoundingClientRect(), p = e.touches ? e.touches[0] : e; return [(p.clientX - r.left) * cv.width / r.width, (p.clientY - r.top) * cv.height / r.height]; };
      const start = (e) => {
        lastStage = stage;
        if (splitTool === "pick" || !readable) return;
        e.preventDefault();
        if (!canChange(side)) { const st = $("rm-wst"); if (st) st.textContent = "other artists' work stays as it is: try a photograph, or your own work"; return; }
        k.undo.push(ctx.getImageData(0, 0, cv.width, cv.height)); if (k.undo.length > 12) k.undo.shift();
        const [x, y] = at(e);
        wreckDab(k, splitTool, x, y);
        if (splitTool !== "pour") { down = true; lx = x; ly = y; }
      };
      const move = (e) => { if (!down) return; e.preventDefault(); const [x, y] = at(e); wreckDab(k, splitTool, x, y, lx, ly); lx = x; ly = y; };
      cv.addEventListener("mousedown", start); cv.addEventListener("mousemove", move); window.addEventListener("mouseup", () => { down = false; });
      cv.addEventListener("touchstart", start, { passive: false }); cv.addEventListener("touchmove", move, { passive: false }); cv.addEventListener("touchend", () => { down = false; });
    }
    cv.addEventListener("click", (e) => {
      if (opts.tools && splitTool !== "pick") return;
      if (!readable) return;
      const hex = colorAt(e);
      colors.push({ id: uid(), hex, side, from: { title: w.title || "", artist: w.artist || "", thumb: w.thumb || "" }, t: today() });
      saveAll(); drawRecent(hex);
    });
  }

  const toHex = (r, g, b) => "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
  function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return { h: 0, s: 0, l };
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s, l };
  }

  function swatchHTML(c, extra = "") {
    return `<button type="button" class="rm-swatch" data-id="${c.id}" title="${esc(c.hex)} · from ${esc(c.from ? c.from.title : "")}" ${extra}><i style="background:${esc(c.hex)}"></i><span>${esc(c.hex)}</span></button>`;
  }

  function drawRecent(flash) {
    const box = $("rm-recent");
    if (!box) return;
    const last = colors.slice(-24).reverse();
    box.innerHTML = last.map((c) => swatchHTML(c)).join("") || `<span class="rm-why">nothing picked yet</span>`;
    if (flash) { const first = box.querySelector(".rm-swatch"); if (first) first.classList.add("new"); }
    box.querySelectorAll(".rm-swatch").forEach((b) => b.addEventListener("click", () => copyHex(colors.find((c) => c.id === b.dataset.id).hex, b)));
  }

  function copyHex(hex, el) {
    const done = () => { const s = el.querySelector("span"); if (s) { s.textContent = "copied"; setTimeout(() => { s.textContent = hex; }, 900); } };
    if (navigator.clipboard) navigator.clipboard.writeText(hex).then(done, done); else done();
  }

  /* ============================================================
     3 · COLORS: every color you've picked, and the color machine
     ============================================================ */

  let colorSort = "picked";
  let table = store.get("table", []);           // hexes on the table right now
  let layout = store.get("layout", { kind: "grid", n: 4 });
  let rollSeed = Math.random();

  // a repeatable random so "re-roll" changes the arrangement and nothing else
  function seeded(seed) { let x = Math.floor(seed * 2147483646) + 1; return () => (x = x * 16807 % 2147483647) / 2147483647; }

  function composition(hexes, lay, seed, small) {
    if (!hexes.length) return `<div class="rm-comp empty"><span class="rm-why">put colors on the table</span></div>`;
    const rnd = seeded(seed);
    const pick = () => hexes[Math.floor(rnd() * hexes.length)];
    if (lay.kind === "bands") return `<div class="rm-comp bands">${Array.from({ length: Math.max(hexes.length, lay.n * 2) }, (_, i) => `<i style="background:${hexes[i % hexes.length]}"></i>`).join("")}</div>`;
    if (lay.kind === "squares") {   // squares inside squares
      const hs = hexes.slice(0, 5);
      let inner = "";
      for (let i = hs.length - 1; i >= 0; i--) inner = `<i style="background:${hs[i]}">${inner}</i>`;
      return `<div class="rm-comp squares">${inner}</div>`;
    }
    const n = lay.n;
    const cells = Array.from({ length: n * n }, (_, i) => lay.kind === "checker" ? hexes[((i % n) + Math.floor(i / n)) % hexes.length] : pick());
    return `<div class="rm-comp grid" style="--n:${n}">${cells.map((c) => `<i style="background:${c};box-shadow:0 0 0 .6px ${c}"></i>`).join("")}</div>`;   // the thin shadow in the same color closes hairline seams at any size
  }

  function machine(mode, k) {
    const lib = colors.map((c) => ({ ...c, ...hexToHsl(c.hex) }));
    if (lib.length < 2) return null;
    const take = (list, m) => shuffle(list).slice(0, m);
    const seed = lib[Math.floor(Math.random() * lib.length)];
    const hueGap = (a, b) => { const d = Math.abs(a.h - b.h) % 360; return d > 180 ? 360 - d : d; };
    let out;
    if (mode === "random") out = take(lib, k);
    else if (mode === "near") out = lib.slice().sort((a, b) => hueGap(a, seed) - hueGap(b, seed) || Math.abs(a.l - seed.l) - Math.abs(b.l - seed.l)).slice(0, k);
    else if (mode === "opposite") {
      const opp = { h: (seed.h + 180) % 360 };
      const near = lib.slice().sort((a, b) => hueGap(a, seed) - hueGap(b, seed)).slice(0, Math.ceil(k / 2));
      const far = lib.slice().sort((a, b) => hueGap(a, opp) - hueGap(b, opp)).filter((c) => !near.includes(c)).slice(0, Math.floor(k / 2));
      out = near.flatMap((c, i) => far[i] ? [c, far[i]] : [c]);
    }
    else if (mode === "light") out = take(lib, k).sort((a, b) => b.l - a.l);
    else if (mode === "quiet") out = lib.filter((c) => c.s < 0.25).length >= 2 ? take(lib.filter((c) => c.s < 0.25), k) : take(lib, k).sort((a, b) => a.s - b.s);
    else if (mode === "meet") {      // art meets nature
      const a = lib.filter((c) => c.side !== "nature"), n = lib.filter((c) => c.side === "nature");
      if (!a.length || !n.length) return take(lib, k);
      const A = take(a, Math.ceil(k / 2)), N = take(n, Math.floor(k / 2));
      out = A.flatMap((c, i) => N[i] ? [c, N[i]] : [c]);
    }
    return [...new Set(out.map((c) => c.hex))];
  }

  function showColors() {
    const v = $("rm-cpopbody");
    if (!v) return;
    const sorted = colors.slice();
    if (colorSort === "hue") sorted.sort((a, b) => { const A = hexToHsl(a.hex), B = hexToHsl(b.hex); return (A.s < 0.1) - (B.s < 0.1) || A.h - B.h || A.l - B.l; });
    else if (colorSort === "light") sorted.sort((a, b) => hexToHsl(b.hex).l - hexToHsl(a.hex).l);
    else if (colorSort === "source") sorted.sort((a, b) => String(a.side).localeCompare(String(b.side)));
    else sorted.reverse();

    v.innerHTML = `
      <p class="rm-intro">${colors.length ? `${colors.length} colors picked.` : `no colors yet: pick some in the color picker.`} click colors to put them on the table, then put them in order: the machine arranges them, or save the combination.</p>
      <div class="rm-filters">
        <span>sort <select id="rm-csort">
          <option value="picked">newest picked</option><option value="hue">by hue</option><option value="light">light to dark</option><option value="source">art / mine / nature</option></select></span>
        <form id="rm-hexadd" class="rm-row"><input placeholder="#a1b2c3" size="9"><button type="submit">+ add a color by hand</button></form>
      </div>
      <div class="rm-swatches lib" id="rm-lib">${sorted.map((c) => `<span class="rm-libitem${table.includes(c.hex) ? " on" : ""}">${swatchHTML(c)}<button type="button" class="rm-del" data-del="${c.id}" title="delete">×</button></span>`).join("")}</div>

      <div class="rm-machine">
        <div class="rm-mleft">
          <h4>the table</h4>
          <div class="rm-swatches" id="rm-table">${table.map((h) => `<button type="button" class="rm-swatch" data-hex="${esc(h)}" title="click to copy, shift-click to take off"><i style="background:${esc(h)}"></i><span>${esc(h)}</span></button>`).join("") || `<span class="rm-why">empty</span>`}</div>
          <h4>the machine</h4>
          <div class="rm-mbtns">
            <span>how many <select id="rm-k">${[2, 3, 4, 5, 6, 8].map((k) => `<option${k === (store.get("k", 4)) ? " selected" : ""}>${k}</option>`).join("")}</select></span>
            <button type="button" data-m="random">random</button>
            <button type="button" data-m="near">near one color</button>
            <button type="button" data-m="opposite">opposites</button>
            <button type="button" data-m="light">light to dark</button>
            <button type="button" data-m="quiet">quiet / grays</button>
            <button type="button" data-m="meet">art meets nature</button>
            <button type="button" id="rm-tclear" class="rm-del">clear the table</button>
          </div>
          <h4>arrangement</h4>
          <div class="rm-mbtns">
            ${["grid", "checker", "bands", "squares"].map((k) => `<button type="button" data-lay="${k}" class="${layout.kind === k ? "on" : ""}">${k}</button>`).join("")}
            <span>size <input type="range" id="rm-n" min="2" max="12" value="${layout.n}"></span>
            <button type="button" id="rm-reroll">re-roll</button>
          </div>
          <form class="rm-row" id="rm-csave"><input placeholder="name this combination" size="22"><button type="submit" class="rm-btn">save</button><button type="button" id="rm-copyall">copy hex codes</button></form>
        </div>
        <div class="rm-mright" id="rm-comp">${composition(table, layout, rollSeed)}</div>
      </div>

      ${combos.length ? `<h4 class="rm-gap">saved combinations</h4><div class="rm-combos">${combos.slice().reverse().map((c) => `
        <div class="rm-combo" data-id="${c.id}">
          <button type="button" data-load="${c.id}">${composition(c.hexes, c.layout, c.seed || 0.5, true)}</button>
          <b>${esc(c.name || "untitled")}</b><span class="rm-why">${c.hexes.map(esc).join(" ")}</span>
          <button type="button" class="rm-del" data-cdel="${c.id}">delete</button>
        </div>`).join("")}</div>` : ""}`;

    $("rm-csort").value = colorSort;
    $("rm-csort").addEventListener("change", (e) => { colorSort = e.target.value; showColors(); });
    $("rm-hexadd").addEventListener("submit", (e) => {
      e.preventDefault();
      let h = e.target.querySelector("input").value.trim().replace(/^#?/, "#").toLowerCase();
      if (/^#[0-9a-f]{3}$/.test(h)) h = "#" + h.slice(1).split("").map((c) => c + c).join("");
      if (!/^#[0-9a-f]{6}$/.test(h)) return;
      colors.push({ id: uid(), hex: h, side: "by hand", from: { title: "added by hand" }, t: today() }); saveAll(); showColors();
    });
    const setTable = (t) => { table = t; store.set("table", table); showColors(); };
    v.querySelectorAll("#rm-lib .rm-swatch").forEach((b) => b.addEventListener("click", () => {
      const hex = colors.find((c) => c.id === b.dataset.id).hex;
      setTable(table.includes(hex) ? table.filter((h) => h !== hex) : table.concat(hex));
    }));
    v.querySelectorAll("#rm-lib [data-del]").forEach((b) => b.addEventListener("click", () => {
      if (!confirmTwice(b, "×?")) return;
      colors = colors.filter((c) => c.id !== b.dataset.del); saveAll(); showColors();
    }));
    v.querySelectorAll("#rm-table .rm-swatch").forEach((b) => b.addEventListener("click", (e) => {
      if (e.shiftKey) setTable(table.filter((h) => h !== b.dataset.hex)); else copyHex(b.dataset.hex, b);
    }));
    $("rm-k").addEventListener("change", (e) => store.set("k", +e.target.value));
    v.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => {
      const out = machine(b.dataset.m, +$("rm-k").value);
      if (!out) return alertLine("pick at least two colors first");
      rollSeed = Math.random(); setTable(out);
    }));
    $("rm-tclear").addEventListener("click", () => setTable([]));
    v.querySelectorAll("[data-lay]").forEach((b) => b.addEventListener("click", () => { layout.kind = b.dataset.lay; store.set("layout", layout); showColors(); }));
    $("rm-n").addEventListener("input", (e) => { layout.n = +e.target.value; store.set("layout", layout); $("rm-comp").innerHTML = composition(table, layout, rollSeed); });
    $("rm-reroll").addEventListener("click", () => { rollSeed = Math.random(); $("rm-comp").innerHTML = composition(table, layout, rollSeed); });
    $("rm-copyall").addEventListener("click", (e) => {
      const b = e.target, txt = table.join(" ");
      const done = () => { b.textContent = "copied"; setTimeout(() => { b.textContent = "copy hex codes"; }, 1000); };
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, done); else done();
    });
    $("rm-csave").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!table.length) return;
      combos.push({ id: uid(), name: e.target.querySelector("input").value.trim(), hexes: table.slice(), layout: { ...layout }, seed: rollSeed }); saveAll(); showColors();
    });
    v.querySelectorAll("[data-load]").forEach((b) => b.addEventListener("click", () => {
      const c = combos.find((x) => x.id === b.dataset.load);
      layout = { ...c.layout }; rollSeed = c.seed || 0.5; store.set("layout", layout); setTable(c.hexes.slice()); $("rm-cpop").scrollTo(0, 0);
    }));
    v.querySelectorAll("[data-cdel]").forEach((b) => b.addEventListener("click", () => {
      if (!confirmTwice(b)) return;
      combos = combos.filter((x) => x.id !== b.dataset.cdel); saveAll(); showColors();
    }));
  }

  /* ============================================================
     DETAIL PANEL for a work (opens from any tile)
     ============================================================ */

  const QUICK_TAGS = ["grid", "square", "paper", "painting", "color", "line", "to paint"];
  const NATURE_QUICK = ["rock", "water", "moss", "ice", "light", "texture", "color", "pattern"];

  function openPanel(w) {
    if (!w) return;
    const p = $("rm-panel");
    const s = savedWork(w.id);
    const tags = s ? s.tags : [];
    const nature = w.kind === "nature";
    const QUICK = nature ? NATURE_QUICK : QUICK_TAGS;
    p.innerHTML = `
      <button class="rm-x" id="rm-x" type="button" aria-label="close">×</button>
      <div class="rm-big">${w.img || w.thumb
        ? `<a href="${esc(w.img || w.thumb)}" target="_blank" rel="noopener"><img src="${esc(w.img || w.thumb)}" alt="${esc(w.title)}" referrerpolicy="no-referrer"></a>`
        : `<span class="rm-pencil big"><i>${esc(w.title || "untitled")}</i><small>no shareable image: open it at the museum</small></span>`}</div>
      <p class="rm-meta"><b>${esc(w.title || "untitled")}</b><br>${nature ? esc(w.artist || "") : `<a href="${artistHref(w.artist)}">${esc(w.artist || "")}</a>`}${w.date ? "<br>" + esc(w.date) : ""}${w.medium ? "<br>" + (nature ? "license: " : "") + esc(w.medium) : ""}</p>
      <p class="rm-meta"><a href="${esc(w.url)}" target="_blank" rel="noopener">see it ${nature ? "on" : "at"} ${esc(w.museum)} ↗</a></p>
      <div class="rm-save">
        <div class="rm-qtags">${QUICK.map((t) => `<button type="button" class="${tags.includes(t) ? "on" : ""}" data-t="${t}">${t}</button>`).join("")}</div>
        <input id="rm-tags" placeholder="more tags, separated by commas" value="${esc(tags.filter((t) => !QUICK.includes(t)).join(", "))}">
        <textarea id="rm-noteb" rows="4" placeholder="why this one? what to take from it?">${esc(s ? s.note : "")}</textarea>
        ${ideas.length ? `<select id="rm-toidea"><option value="">pin to an idea…</option>${ideas.map((i) => `<option value="${i.id}"${i.refs.includes(w.id) ? " disabled" : ""}>${esc(i.title || "untitled idea")}${i.refs.includes(w.id) ? " (pinned)" : ""}</option>`).join("")}</select>` : ""}
        <div class="rm-row">
          <button type="button" class="rm-btn" id="rm-keep">${s ? "update" : "save to collection"}</button>
          ${s ? `<button type="button" class="rm-btn quiet" id="rm-drop">remove</button>` : ""}
          <span class="rm-status" id="rm-saved"></span>
        </div>
      </div>`;
    p.hidden = false;
    requestAnimationFrame(() => p.classList.add("open"));

    p.querySelectorAll(".rm-qtags button").forEach((b) => b.addEventListener("click", () => b.classList.toggle("on")));
    $("rm-x").addEventListener("click", closePanel);
    $("rm-keep").addEventListener("click", () => {
      const chosen = [...p.querySelectorAll(".rm-qtags button.on")].map((b) => b.dataset.t)
        .concat($("rm-tags").value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean));
      const entry = { ...w, tags: [...new Set(chosen)], note: $("rm-noteb").value.trim(), saved: (s && s.saved) || today() };
      collection = collection.filter((x) => x.id !== w.id).concat(entry);
      const idea = $("rm-toidea") && $("rm-toidea").value;
      if (idea) { const i = ideas.find((x) => x.id === idea); if (i && !i.refs.includes(w.id)) i.refs.push(w.id); }
      saveAll(); markTile(w.id, true);
      $("rm-saved").textContent = idea ? "saved + pinned" : "saved";
      setTimeout(() => openPanel(entry), 500);
    });
    if (s) $("rm-drop").addEventListener("click", () => {
      collection = collection.filter((x) => x.id !== w.id);
      ideas.forEach((i) => { i.refs = i.refs.filter((r) => r !== w.id); });
      saveAll(); markTile(w.id, false); closePanel();
      if (location.hash === "#images") showImages();
    });
  }

  function markTile(id, on) {
    document.querySelectorAll(`.rm-tile[data-id="${CSS.escape(id)}"]`).forEach((t) => t.classList.toggle("saved", on));
  }
  function closePanel() {
    const p = $("rm-panel");
    if (!p) return;
    p.classList.remove("open"); p.hidden = true;
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (location.hash === "#web") select(null); else closePanel();
  });

  // first click arms the button, second click within 3s does it (no pop-up dialogs)
  function confirmTwice(btn, msg) {
    if (btn.dataset.armed) return true;
    const label = btn.textContent;
    btn.dataset.armed = "1"; btn.textContent = msg || "click again to delete";
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = label; }, 3000);
    return false;
  }

  /* ============================================================
     COLLECTION
     ============================================================ */

  function showCompare(pair) {
    const c = $("rm-compare");
    c.innerHTML = `<button class="rm-x" type="button" aria-label="close">×</button>
      <div class="rm-pair">${pair.map((w) => `<figure>${w.img || w.thumb ? `<img src="${esc(w.img || w.thumb)}" alt="" referrerpolicy="no-referrer">` : `<span class="rm-pencil big"><i>${esc(w.title)}</i></span>`}
        <figcaption><b>${esc(w.title)}</b>, ${esc(w.year || "")}<br>${esc(w.artist)}${w.note ? `<br><span class="rm-why">${esc(w.note)}</span>` : ""}</figcaption></figure>`).join("")}</div>`;
    c.hidden = false;
    c.querySelector(".rm-x").addEventListener("click", () => { c.hidden = true; });
  }

  function exportData() {
    return { room: 4, exported: new Date().toISOString(), mine, dismissed, lineAdds, collection, ideas, commissions, palace, legend, natureTags, colors, combos, lists, share, goals, notes, books };
  }

  function exportAll() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" }));
    a.download = `mind-palace-backup-${today()}.json`;
    a.click();
  }

  // bring a backup (or a room saved under a code) into this browser.
  // merge: anything already here stays, the backup adds what's missing.
  // fresh = this browser has nothing of its own yet, so the room's name, "now" and settings come along too
  function importData(d, fresh) {
    if (!d || !d.room) throw new Error("not a room backup");
    const merge = (here, there, key) => here.concat((there || []).filter((t) => !here.some((m) => m[key] === t[key])));
    mine = mine.concat((d.mine || []).filter((t) => !isMine(t.name)));
    collection = merge(collection, d.collection, "id");
    ideas = merge(ideas, d.ideas, "id");
    commissions = merge(commissions, d.commissions, "id");
    (d.palace ? d.palace.words : []).forEach((w) => { if (!palace.words.some((x) => plain(x.label) === plain(w.label))) palace.words.push(w); });
    (d.palace ? d.palace.links : []).forEach((l) => { if (palace.words.some((w) => w.id === l.a) && palace.words.some((w) => w.id === l.b) && !palace.links.some((x) => x.id === l.id)) palace.links.push(l); });
    dismissed = [...new Set(dismissed.concat(d.dismissed || []))];
    colors = merge(colors, d.colors, "id");
    combos = merge(combos, d.combos, "id");
    books = merge(books, d.books, "id");
    lists = fresh && d.lists ? d.lists : merge(lists, d.lists, "id");
    goals = merge(goals, d.goals, "id");
    notes = fresh && d.notes ? d.notes : merge(notes, d.notes, "id");
    if (d.share) {
      share.posts = merge(share.posts, d.share.posts, "id");
      if (!share.instagram) share.instagram = d.share.instagram || "";
      if (fresh) { share.roomName = d.share.roomName || share.roomName; share.now = d.share.now || share.now; share.artist = d.share.artist !== false; }
      if (d.share.code && !share.code) share.code = d.share.code;
    }
    natureTags = natureTags.concat((d.natureTags || []).filter((t) => !natureTags.some((n) => plain(n.t) === plain(t.t))));
    Object.entries(d.lineAdds || {}).forEach(([k, list]) => { lineAdds[k] = [...new Set((lineAdds[k] || []).concat(list))]; });
    saveAll();
  }

  function importAll(e) {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then((txt) => { importData(JSON.parse(txt)); store.set("setup", true); showShare(); })
      .catch(() => alertLine("that file isn't a room backup"));
  }

  /* ---------- SAVE CODE: your room, saved online under a code ----------
     After the intro you get a code like trinity-k3x9qa. Everything you do is
     saved under it (a few seconds after each change). On another browser,
     type the code on the intro page and your room comes back.
     Keep the code private: it's the key to your room.                  */

  let cloudTimer = null, cloudState = "";
  const makeCode = (name) => (plain(name).replace(/[^a-z0-9]+/g, "").slice(0, 16) || "room") + "-" +
    Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => "abcdefghjkmnpqrstuvwxyz23456789"[n % 31]).join("");

  function cloudSoon() {
    if (!share.code || !gardenReady) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(cloudSave, 4000);
  }
  async function cloudSave() {
    if (!share.code) return false;
    try {
      const r = await fetch("/api/room/" + encodeURIComponent(share.code), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(exportData()) });
      cloudState = r.ok ? "saved " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase() : r.status === 503 ? "online saving isn't switched on yet" : "couldn't save (" + r.status + ")";
      store.set("cloudAt", r.ok ? Date.now() : store.get("cloudAt", 0));
    } catch (e) { cloudState = "couldn't reach the site (saved in this browser)"; }
    const el = $("rm-cloudst"); if (el) el.textContent = cloudState;
    return cloudState.startsWith("saved");
  }
  async function cloudLoad(code) {
    const r = await fetch("/api/room/" + encodeURIComponent(code.trim().toLowerCase()), { cache: "no-store" });
    if (r.status === 404) throw new Error("no room with that code");
    if (!r.ok) throw new Error(r.status === 503 ? "online saving isn't switched on yet" : "couldn't reach the site");
    const d = await r.json();
    importData(d, !store.get("setup"));
    share.code = code.trim().toLowerCase(); store.set("setup", true); saveAll();
  }

  function alertLine(msg) {
    const p = document.createElement("p");
    p.className = "rm-status"; p.textContent = msg;
    $("rm-view").prepend(p);
    setTimeout(() => p.remove(), 3000);
  }

  /* ============================================================
     COMMISSIONS
     ============================================================ */

  const COMM_STATES = ["not started", "in progress", "waiting", "done", "delivered"];

  function dueLine(due) {
    if (!due) return "";
    const days = Math.round((new Date(due + "T12:00") - new Date().setHours(12, 0, 0, 0)) / 864e5);
    if (days < 0) return `<span class="rm-late">${-days} day${days === -1 ? "" : "s"} late</span>`;
    if (days === 0) return `<span class="rm-late">due today</span>`;
    return `in ${days} day${days === 1 ? "" : "s"}`;
  }

  function showCommissions() {
    const v = $("rm-view");
    const finished = (c) => c.status === "done" || c.status === "delivered";
    const sorted = commissions.slice().sort((a, b) => (finished(a) - finished(b)) || (a.due || "9999").localeCompare(b.due || "9999"));
    v.innerHTML = `
      <p class="rm-intro">commissions + things you owe people. soonest first; finished ones sink to the bottom.</p>
      <form class="rm-add rm-cform" id="rm-cform">
        <input name="what" placeholder="what (e.g. 12 x 12 grid drawing)" required>
        <input name="who" placeholder="for whom">
        <input name="due" type="date">
        <button type="submit" class="rm-btn">add</button>
      </form>
      <div class="rm-comms">${sorted.map((c) => {
        const doneSteps = c.steps.filter((s) => s.done).length;
        return `<div class="rm-comm${finished(c) ? " finished" : ""}" data-id="${c.id}">
          <div class="rm-crow">
            <b>${esc(c.what)}</b>${c.who ? ` <span class="rm-years">for ${esc(c.who)}</span>` : ""}
            <span class="rm-due">${c.due ? esc(c.due) + " · " : ""}${finished(c) ? "" : dueLine(c.due)}</span>
            <select class="rm-cstate">${COMM_STATES.map((s) => `<option${c.status === s ? " selected" : ""}>${s}</option>`).join("")}</select>
          </div>
          <ul class="rm-steps">${c.steps.map((s, k) => `<li><label><input type="checkbox" data-k="${k}"${s.done ? " checked" : ""}> <span>${esc(s.t)}</span></label> <button type="button" class="rm-del" data-k="${k}">×</button></li>`).join("")}
            <li><input class="rm-newstep" placeholder="+ add a step, press enter"></li></ul>
          ${c.steps.length ? `<span class="rm-why">${doneSteps} of ${c.steps.length} steps</span>` : ""}
          <textarea class="rm-cnotes" rows="2" placeholder="notes: size, price, contact, details…">${esc(c.notes)}</textarea>
          <button type="button" class="rm-del rm-cdel">delete</button>
        </div>`;
      }).join("") || `<p class="rm-empty">nothing on the list.</p>`}</div>`;

    const form = $("rm-cform");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      commissions.push({ id: uid(), what: form.what.value.trim(), who: form.who.value.trim(), due: form.due.value, status: "not started", notes: "",
        steps: ["sketch / plan", "make it", "photograph", "deliver + invoice"].map((t) => ({ t, done: false })) });
      saveAll(); showCommissions();
    });
    v.querySelectorAll(".rm-comm").forEach((card) => {
      const c = commissions.find((x) => x.id === card.dataset.id);
      card.querySelector(".rm-cstate").addEventListener("change", (e) => { c.status = e.target.value; saveAll(); showCommissions(); });
      card.querySelectorAll('.rm-steps input[type="checkbox"]').forEach((b) => b.addEventListener("change", () => { c.steps[+b.dataset.k].done = b.checked; saveAll(); showCommissions(); }));
      card.querySelectorAll(".rm-steps .rm-del").forEach((b) => b.addEventListener("click", () => { c.steps.splice(+b.dataset.k, 1); saveAll(); showCommissions(); }));
      card.querySelector(".rm-newstep").addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || !e.target.value.trim()) return;
        c.steps.push({ t: e.target.value.trim(), done: false }); saveAll(); showCommissions();
      });
      card.querySelector(".rm-cnotes").addEventListener("input", (e) => { c.notes = e.target.value; saveAll(); });
      const del = card.querySelector(".rm-cdel");
      del.addEventListener("click", () => { if (confirmTwice(del)) { commissions = commissions.filter((x) => x.id !== c.id); saveAll(); showCommissions(); } });
    });
  }

  /* ============================================================
     HELPERS FOR THE NEW PAGES
     ============================================================ */

  // hover a word: a small picture of it (from wikipedia) appears by the mouse
  function hoverPictures(box) {
    let tip = $("rm-tip");
    if (!tip) { tip = document.createElement("div"); tip.id = "rm-tip"; tip.className = "rm-tip"; tip.hidden = true; document.body.appendChild(tip); }
    let timer = null, current = "";
    const place = (e) => { tip.style.left = Math.min(e.clientX + 18, window.innerWidth - 230) + "px"; tip.style.top = Math.min(e.clientY + 18, window.innerHeight - 260) + "px"; };
    box.querySelectorAll("[data-word]").forEach((a) => {
      a.addEventListener("mouseenter", (e) => {
        const word = a.dataset.word; current = word; place(e);
        clearTimeout(timer);
        timer = setTimeout(async () => {
          let s = cacheGet("wk:" + plain(word), 30);
          if (!s) { s = (await wikiSummary(word)) || { none: true }; cacheSet("wk:" + plain(word), s); }
          if (current !== word) return;
          tip.innerHTML = s.none ? `<span class="rm-why">nothing on wikipedia yet</span>`
            : `${s.thumb ? `<img src="${esc(s.thumb)}" alt="" referrerpolicy="no-referrer">` : ""}<b>${esc(s.title)}</b><br><span class="rm-why">${esc(s.description || s.extract.slice(0, 90) + "…")}</span>`;
          tip.hidden = false;
        }, 220);
      });
      a.addEventListener("mousemove", place);
      a.addEventListener("mouseleave", () => { current = ""; clearTimeout(timer); tip.hidden = true; });
    });
  }

  // "need a start?" words to fill the inspiration list to the brim
  function drawPrompts(after) {
    const box = $("rm-prompts");
    if (!box) return;
    const have = new Set(palace.words.map((w) => plain(w.label)));
    const left = shuffle((R.INSPIRATION_PROMPTS || []).filter((t) => !have.has(plain(t)))).slice(0, 40);
    if (!left.length) { box.innerHTML = ""; return; }
    box.innerHTML = `<h4>need a start? click to add</h4><p class="rm-chips">${left.map((t) => `<button type="button" data-add="${esc(t)}">+ ${esc(t)}</button>`).join("")}</p>`;
    box.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => { addWords(b.dataset.add); saveAll(); after(); }));
  }

  // shrink a picture you upload so it fits in the browser's storage
  function resizeImage(file, max = 900) {
    return new Promise((ok, no) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        ok(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = no;
      img.src = URL.createObjectURL(file);
    });
  }

  function sideOf(w) { return w.kind === "nature" ? "nature" : w.kind === "mine" ? "mine" : "art"; }

  /* ============================================================
     HOME: the opening page. It fills up as you use the room:
     words, saved pictures, colors, ideas, lists. Until then,
     real photographs of rocks hold the places.
     ============================================================ */

  function showHome() {
    if (!store.get("setup")) return showQuiz();
    const v = $("rm-view");
    v.innerHTML = `<h2 class="rm-roomname">${esc(share.roomName || "my room")}</h2><div class="rm-cloud" id="rm-cloud" aria-hidden="true"></div>`;
    startCloud($("rm-cloud"));
  }

  /* THE CLOUD: everything you've gathered (words, colors, pictures, artists,
     ideas, what you're into right now) floating in a slow oval, drifting to
     the front and back again. Just to look at. */
  async function startCloud(box) {
    const items = [
      ...shuffle(palace.words).slice(0, 26).map((w) => ({ t: "word", text: w.label })),
      ...shuffle(collection.filter((w) => w.thumb)).slice(0, 18).map((w) => ({ t: "pic", src: w.thumb })),
      ...shuffle(colors).slice(0, 14).map((c) => ({ t: "color", hex: c.hex })),
      ...mine.slice(0, 8).map((m) => ({ t: "word", text: m.name, big: true })),
      ...ideas.filter((i) => i.title).slice(0, 6).map((i) => ({ t: "word", text: i.title, italic: true })),
      ...share.now.filter((n) => n.title).map((n) => ({ t: "word", text: n.title, small: n.label })),
      ...share.posts.filter((p) => p.img).slice(0, 6).map((p) => ({ t: "pic", src: p.img }))
    ];
    if (items.filter((x) => x.t === "pic").length < 8) {      // not many pictures yet: real photographs of rocks hold the places
      const rocks = shuffle(await natureFor("rocks").catch(() => [])).slice(0, 10);
      rocks.forEach((w) => items.push({ t: "pic", src: w.thumb, rock: true }));
    }
    if (!box.isConnected) return;
    const list = shuffle(items);
    const n = list.length;
    box.innerHTML = list.map((x) => x.t === "pic" ? `<span class="rm-cl pic${x.rock ? " rock" : ""}"><img src="${esc(x.src)}" alt="" referrerpolicy="no-referrer"></span>`
      : x.t === "color" ? `<span class="rm-cl color" style="background:${esc(x.hex)}"></span>`
      : `<span class="rm-cl word${x.big ? " big" : ""}${x.italic ? " it" : ""}">${esc(x.text)}${x.small ? `<i>${esc(x.small)}</i>` : ""}</span>`).join("");
    const els = [...box.children];
    // each thing gets a place on an egg-shaped cloud (spread evenly, like seeds in a sunflower)
    const pts = els.map((el, k) => {
      const y = 1 - (k + 0.5) / n * 2, r = Math.sqrt(1 - y * y), th = k * 2.39996;
      return { el, y, r, th, bob: Math.random() * 6.28, sp: 0.6 + Math.random() * 0.8 };
    });
    let t0 = performance.now();
    const frame = (now) => {
      if (!box.isConnected) return;                            // left the home page: stop
      const W = box.clientWidth, H = box.clientHeight, t = (now - t0) / 1000, spin = t * 0.07;
      pts.forEach((p) => {
        const a = p.th + spin, z = p.r * Math.sin(a);           // z: -1 at the back, 1 at the front
        const x = W / 2 + p.r * Math.cos(a) * W * 0.42;
        const y = H / 2 + p.y * H * 0.36 + Math.sin(t * p.sp + p.bob) * 8;
        const k = (z + 1) / 2;                                  // 0 back … 1 front
        p.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(0.45 + 0.7 * k).toFixed(3)})`;
        p.el.style.opacity = (0.18 + 0.82 * k).toFixed(3);
        p.el.style.zIndex = Math.round(k * 100);
        p.el.style.filter = k < 0.4 ? `blur(${((0.4 - k) * 4).toFixed(1)}px)` : "none";
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /* THE INTRO: three quick questions the first time someone opens the site.
     The answers start their room. Question 3 can be anything: change it here. */
  const QUIZ = [
    { key: "name", q: "what's your name?", ph: "your name" },
    { key: "artist", q: "who is your favorite artist?", ph: "an artist you love" },
    { key: "word", q: "what do you want to see?", ph: "one word is enough: moss, the grid, the ocean…" }
  ];

  function showQuiz(step = 0, ans = {}) {
    const v = $("rm-view");
    if (step === "code") {
      v.innerHTML = `<div class="rm-quiz">
        <p class="rm-why">your room is ready.</p>
        <h2>${esc(share.roomName)}</h2>
        <p>your save code:</p>
        <p class="rm-code">${esc(share.code)}</p>
        <p class="rm-why">everything you do here is saved under this code. write it down: type it on any browser to open your room there. keep it to yourself, it's the key.</p>
        <p class="rm-why" id="rm-cloudst">saving…</p>
        <button type="button" class="rm-btn" id="rm-enter">go in →</button></div>`;
      cloudSave();
      $("rm-enter").addEventListener("click", () => { location.hash = "#home"; showHome(); });
      return;
    }
    if (step === "load") {
      v.innerHTML = `<div class="rm-quiz"><p class="rm-why">open your room</p><h2>what's your save code?</h2>
        <form id="rm-qform"><input name="a" placeholder="name-abc123" autocomplete="off" required><button type="submit" class="rm-btn">open</button></form>
        <p class="rm-why" id="rm-qst"></p><button type="button" class="rm-why" id="rm-qback">← start a new room instead</button></div>`;
      $("rm-qform").a.focus();
      $("rm-qback").addEventListener("click", () => showQuiz(0));
      $("rm-qform").addEventListener("submit", async (e) => {
        e.preventDefault(); $("rm-qst").textContent = "looking…";
        try { await cloudLoad(e.target.a.value); showHome(); } catch (err) { $("rm-qst").textContent = err.message; }
      });
      return;
    }
    const Q = QUIZ[step];
    v.innerHTML = `<div class="rm-quiz">
      <p class="rm-why">${step + 1} / ${QUIZ.length}</p>
      <h2>${Q.q}</h2>
      <form id="rm-qform"><input name="a" placeholder="${esc(Q.ph)}" value="${esc(ans[Q.key] || "")}" autocomplete="off" required><button type="submit" class="rm-btn">${step < QUIZ.length - 1 ? "next" : "start"}</button></form>
      ${step === 0 ? `<p class="rm-why"><button type="button" class="rm-why" id="rm-qload">already have a room? enter your save code</button></p>` : `<button type="button" class="rm-why" id="rm-qback">← back</button>`}
    </div>`;
    const f = $("rm-qform");
    f.a.focus();
    if (step === 0) $("rm-qload").addEventListener("click", () => showQuiz("load"));
    else $("rm-qback").addEventListener("click", () => showQuiz(step - 1, ans));
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      ans[Q.key] = f.a.value.trim();
      if (step < QUIZ.length - 1) return showQuiz(step + 1, ans);
      share.roomName = ans.name.replace(/'s room$/i, "") + "'s room";
      addArtist(ans.artist);
      addWords(ans.word);
      share.code = share.code || makeCode(ans.name);
      store.set("setup", true);
      saveAll();
      showQuiz("code");
    });
  }

  /* ============================================================
     1 · PURE ART: a feed of real work by your favorite artists
     (and a few recommended ones), plus the way out: official
     websites, foundations, wikipedia, galleries. Go explore.
     ============================================================ */

  async function officialLinks(name) {
    const key = "ol:" + plain(name);
    const c = cacheGet(key, 30);
    if (c) return c;
    const out = { site: "", wiki: "" };
    try {
      const hits = await wdSearch(name);
      const hit = hits.find((h) => ARTISTY.test(h.desc) && plain(h.label) === plain(name)) || hits.find((h) => ARTISTY.test(h.desc));
      if (hit) {
        const rows = await sparql(`SELECT ?site ?article WHERE {
          OPTIONAL { wd:${hit.id} wdt:P856 ?site . }
          OPTIONAL { ?article schema:about wd:${hit.id} ; schema:isPartOf <https://en.wikipedia.org/> . } } LIMIT 3`);
        rows.forEach((r) => { if (r.site && !out.site) out.site = r.site.value; if (r.article && !out.wiki) out.wiki = r.article.value; });
      }
    } catch (e) { return out; }
    cacheSet(key, out);
    return out;
  }

  async function pureFeedFor(name) {
    const cached = (cacheGet("works:" + plain(name), CACHE_DAYS) || {}).items || cacheGet("pf:" + plain(name), CACHE_DAYS);
    if (cached) return cached;
    try {
      const list = (await fromChicago(name, 60)).filter((w) => byArtist(name, w) && inRange(w));
      cacheSet("pf:" + plain(name), list);
      return list;
    } catch (e) { return []; }
  }

  /* ---------- PURE ART: your artists + their work, on one page ----------
     Type an artist at the top: they join your list, the feed fills with their
     real work, and the "you might love" names change to follow your list. */

  // suggestions from your whole list: hand-made links first, Wikidata after
  async function suggestionsFor(list, n) {
    const score = new Map();
    const bump = (name, pts, because) => {
      if (!name || isMine(name) || dismissed.some((d) => plain(d) === plain(name))) return;
      const k = plain(name), c = score.get(k) || { name, pts: 0, because: new Set() };
      c.pts += pts; c.because.add(because); score.set(k, c);
    };
    list.forEach((m) => curatedNear(m.name).forEach((x) => bump(x, 1.5, m.name)));
    const abouts = await Promise.all(list.map((m) => aboutArtist(m.name).catch(() => ({ by: [], on: [], peers: [] }))));
    list.forEach((m, i) => {
      abouts[i].by.forEach((x) => bump(x, 1, m.name));
      abouts[i].on.forEach((x) => bump(x, 1, m.name));
      (abouts[i].peers || []).forEach((x) => bump(x, 0.4, m.name));
    });
    // the more of your artists someone is near, the higher they go; a little shuffle keeps it fresh
    return shuffle([...score.values()]).sort((x, y) => (y.because.size + y.pts / 4) - (x.because.size + x.pts / 4)).slice(0, n);
  }

  /* ============================================================
     1 · IMAGES: real art and real photographs, all in one feed,
     from the words on your inspiration list. Type anything in the
     bar (an artist from any time, a place, a thing: agnes martin,
     alaska, tarot cards): it joins the list and the feed.
       artists  → their work in museum collections (made CUTOFF_YEAR or earlier)
       anything else → old museum objects of it + the best-rated real
                       photographs of it on Wikimedia Commons
     ============================================================ */

  let imgOff = new Set(store.get("imgOff", []));     // words you switched off in the feed
  let imgView = "feed", imgFirst = "";

  async function picturesFor(w) {
    const word = w.label;
    const tag = (list) => list.filter((x) => x.thumb).map((x) => ({ ...x, word }));
    if (w.type === "artists" || isMine(word)) {
      const art = await pureFeedFor(word);
      if (art.some((x) => x.thumb)) return tag(art);
    }
    const key = "kw:" + plain(word);
    let museum = cacheGet(key, CACHE_DAYS);
    if (!museum) {
      const [a, c] = await Promise.all([fromChicago(word, 40).catch(() => []), fromCleveland(word).catch(() => [])]);
      museum = a.concat(c).filter((x) => x.thumb && inRange(x)).slice(0, 40);
      if (museum.length) cacheSet(key, museum);
    }
    const photos = await natureFor(word).catch(() => []);
    return tag(museum).concat(tag(photos));
  }

  async function showImages() {
    const v = $("rm-view");
    const words = palace.words.slice().reverse();
    const saved = collection.filter((w) => w.img || w.thumb).slice().reverse();
    v.innerHTML = `
      <div class="rm-center">
        <div id="rm-imgbar"></div>
        <p class="rm-why">an artist from any time, a place, a thing. it joins your <a href="#bin">inspiration list</a>, and the feed fills with real art and real photographs of it: museum collections (made ${CUT} or earlier) and credited photographs, never AI.</p>
      </div>
      <div class="rm-imgwords" id="rm-imgwords">${words.map((w) => `<button type="button" data-w="${esc(w.id)}" class="${imgOff.has(w.id) ? "" : "on"}${w.type === "artists" ? " artist" : ""}">${esc(w.label)}</button>`).join("") || `<span class="rm-why">your inspiration list is empty: type a word above.</span>`}</div>
      <div class="rm-filters">
        <span class="rm-states"><button type="button" data-view="feed" class="${imgView === "feed" ? "on" : ""}">feed</button><button type="button" data-view="saved" class="${imgView === "saved" ? "on" : ""}">saved${saved.length ? ` (${saved.length})` : ""}</button></span>
        ${imgView === "feed" ? `<button type="button" id="rm-ishuffle">shuffle</button><button type="button" class="rm-why" id="rm-iall">all on</button><button type="button" class="rm-why" id="rm-inone">all off</button><span class="rm-status" id="rm-ist">looking…</span>`
          : `<form id="rm-realadd" class="rm-row"><input name="src" placeholder="found a real one somewhere else? paste its image link" size="38" required><input name="title" placeholder="what is it" size="14"><button type="submit">+ save</button></form>`}
      </div>
      <div class="rm-grid four" id="rm-igrid">${imgView === "saved" ? (saved.map(tileHTML).join("") || `<p class="rm-empty">nothing saved yet: press + on any picture in the feed.</p>`) : `<div class="rm-loading">${"<i></i>".repeat(8)}</div>`}</div>`;

    const input = typingBar($("rm-imgbar"), { placeholder: "search: agnes martin, alaska, tarot cards…", onPick: (name, item) => {
      let w = palace.words.find((x) => plain(x.label) === plain(name));
      if (!w) [w] = addWords(name);
      if (w && item && ARTISTY.test(item.desc)) { w.type = "artists"; placeWord(palace, w); addArtist(name); }
      if (w) { imgOff.delete(w.id); store.set("imgOff", [...imgOff]); imgFirst = w.id; }
      imgView = "feed"; saveAll(); showImages();
    } });
    input.focus();
    v.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { imgView = b.dataset.view; showImages(); }));
    v.querySelectorAll("[data-w]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.w;
      imgOff.has(id) ? imgOff.delete(id) : imgOff.add(id); store.set("imgOff", [...imgOff]);
      if (!imgOff.has(id)) imgFirst = id;
      imgView = "feed"; showImages();
    }));
    if (imgView === "saved") {
      wireTiles($("rm-igrid"), saved);
      $("rm-realadd").addEventListener("submit", (e) => {
        e.preventDefault();
        const f = e.target, src = f.src.value.trim();
        let host = ""; try { host = new URL(src).hostname.replace(/^www\./, ""); } catch (err) { return; }
        collection.push({ id: "ln-" + uid(), kind: "nature", museum: host, title: f.title.value.trim() || "photo from " + host, artist: "found on " + host, thumb: src, img: src, url: src, tags: [], note: "", saved: today() });
        saveAll(); showImages();
      });
      return;
    }
    $("rm-ishuffle").addEventListener("click", () => { palace.words.forEach((w) => store.set("c:nat:" + plain(w.label), null)); imgFirst = ""; showImages(); });
    $("rm-iall").addEventListener("click", () => { imgOff.clear(); store.set("imgOff", []); showImages(); });
    $("rm-inone").addEventListener("click", () => { palace.words.forEach((w) => imgOff.add(w.id)); store.set("imgOff", [...imgOff]); showImages(); });

    // up to 14 words at a time (shuffle for others); the word you just added goes first
    let on = shuffle(palace.words.filter((w) => !imgOff.has(w.id)));
    const first = on.find((w) => w.id === imgFirst);
    if (first) on = [first].concat(on.filter((w) => w !== first));
    on = on.slice(0, 14);
    const grid = $("rm-igrid");
    if (!on.length) { grid.innerHTML = `<p class="rm-empty">switch on a word above, or type a new one.</p>`; $("rm-ist").textContent = ""; return; }
    const lists = await Promise.all(on.map((w) => picturesFor(w).catch(() => [])));
    if (!$("rm-igrid") || root.dataset.page !== "images") return;
    // the new word's pictures come first, then everything mixed, a few of each at a time
    const mixed = first ? shuffle(lists[0]).slice(0, 12) : [];
    const pools = lists.slice(first ? 1 : 0).map((l) => shuffle(l)).concat(first ? [shuffle(lists[0]).slice(12)] : []);
    while (pools.some((p) => p.length) && mixed.length < 96) pools.forEach((p) => { if (p.length) mixed.push(p.pop()); });
    grid.innerHTML = mixed.length ? mixed.map(tileHTML).join("") : `<p class="rm-empty">nothing came back for these words. try another, or check your connection.</p>`;
    wireTiles(grid, mixed);
    $("rm-ist").textContent = `${mixed.length} pictures from ${on.length} word${on.length === 1 ? "" : "s"}` + (on.length < palace.words.filter((w) => !imgOff.has(w.id)).length ? " (shuffle for others)" : "");
  }

  /* ============================================================
     1 · LIBRARY: your PDFs, read two pages at a time.
     The PDFs are kept in this browser (IndexedDB, which holds big
     files), and online under your save code if you have one, so
     they follow your room to other computers. They are never on
     the public site.
     ============================================================ */

  let pdfjsLoading = null;
  function pdfjs() {
    return pdfjsLoading || (pdfjsLoading = import(new URL("vendor/pdfjs/pdf.min.mjs", location.href).href).then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL("vendor/pdfjs/pdf.worker.min.mjs", location.href).href;
      return m;
    }));
  }
  const openPdf = (bytes) => pdfjs().then((m) => m.getDocument({ data: bytes, standardFontDataUrl: new URL("vendor/pdfjs/standard_fonts/", location.href).href }).promise);

  // the shelf in this browser
  let shelfDb = null;
  function shelf() {
    return shelfDb || (shelfDb = new Promise((res, rej) => {
      const r = indexedDB.open("mind-palace-library", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  }
  async function shelfDo(mode, fn) {
    const db = await shelf();
    return new Promise((res, rej) => { const q = fn(db.transaction("files", mode).objectStore("files")); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  }
  const shelfGet = (id) => shelfDo("readonly", (s) => s.get(id));
  const shelfPut = (id, blob) => shelfDo("readwrite", (s) => s.put(blob, id));
  const shelfDel = (id) => shelfDo("readwrite", (s) => s.delete(id));

  const fileUrl = (id) => "/api/file/" + encodeURIComponent(share.code) + "/" + encodeURIComponent(id);
  async function cloudPutBook(b) {
    if (!share.code) return false;
    try {
      const blob = await shelfGet(b.id);
      if (!blob) return false;
      const r = await fetch(fileUrl(b.id), { method: "PUT", headers: { "content-type": "application/pdf" }, body: blob });
      if (r.ok) { b.cloud = true; saveAll(); }
      return r.ok;
    } catch (e) { return false; }
  }

  // the PDF's bytes: from this browser, or from your room online
  async function bookBlob(b) {
    let blob = await shelfGet(b.id).catch(() => null);
    if (!blob && share.code) {
      try {
        const r = await fetch(fileUrl(b.id), { cache: "no-store" });
        if (r.ok) { blob = await r.blob(); shelfPut(b.id, blob).catch(() => {}); }
      } catch (e) { /* offline */ }
    }
    return blob;
  }

  async function addBooks(files, status) {
    for (const f of files) {
      if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { status(`${f.name} isn't a PDF`); continue; }
      status(`adding ${f.name}…`);
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const doc = await openPdf(bytes.slice());
        const meta = await doc.getMetadata().catch(() => ({ info: {} }));
        const info = meta.info || {};
        // a small picture of the first page for the shelf
        const pg = await doc.getPage(1);
        const vp0 = pg.getViewport({ scale: 1 });
        const vp = pg.getViewport({ scale: 260 / vp0.width });
        const cv = document.createElement("canvas");
        cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
        const b = {
          id: uid(), title: String(info.Title || "").trim() || f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "),
          author: String(info.Author || "").trim(), pages: doc.numPages, size: f.size, added: today(), page: 1,
          thumb: cv.toDataURL("image/jpeg", 0.72), cloud: false
        };
        await shelfPut(b.id, new Blob([bytes], { type: "application/pdf" }));
        books.push(b); saveAll();
        doc.destroy();
        if (share.code) { status(`putting ${b.title} in your room online…`); await cloudPutBook(b); }
        status(`added ${b.title}`);
      } catch (e) {
        status(`couldn't open ${f.name}` + (e && e.name === "QuotaExceededError" ? ": this browser is out of room" : ""));
      }
    }
  }

  function showLibrary() {
    const v = $("rm-view");
    v.innerHTML = `
      <p class="rm-wide">your library. add a PDF and it stays with your room${share.code ? " (in this browser, and online under your save code)" : " (in this browser; make a save code on your profile and it follows you to other computers)"}. open one to read it two pages at a time.</p>
      <label class="rm-libdrop" id="rm-libdrop">
        <input type="file" id="rm-libfile" accept="application/pdf,.pdf" multiple hidden>
        <b>+ add a PDF</b> <span class="rm-why">or drop one here</span>
      </label>
      <p class="rm-status" id="rm-libst"></p>
      <div class="rm-books">${books.slice().reverse().map((b) => `
        <div class="rm-book" data-id="${b.id}">
          <a href="#read/${b.id}" class="rm-cover">${b.thumb ? `<img src="${b.thumb}" alt="">` : `<span class="rm-pencil"><i>${esc(b.title)}</i></span>`}</a>
          <a href="#read/${b.id}"><b>${esc(b.title)}</b></a>
          <span class="rm-why">${b.author ? esc(b.author) + " · " : ""}${b.pages} pages${b.page > 1 ? ` · on page ${b.page}` : ""}</span>
          <span class="rm-row"><button type="button" class="rm-del" data-ren="${b.id}">rename</button><button type="button" class="rm-del" data-del="${b.id}">delete</button></span>
        </div>`).join("") || `<p class="rm-empty">nothing on the shelf yet.</p>`}</div>`;

    const status = (t) => { const el = $("rm-libst"); if (el) el.textContent = t; };
    const add = async (files) => { await addBooks([...files], status); if (root.dataset.page === "library" && !location.hash.startsWith("#read/")) { const keep = $("rm-libst") && $("rm-libst").textContent; showLibrary(); status(keep); } };
    $("rm-libfile").addEventListener("change", (e) => add(e.target.files));
    const drop = $("rm-libdrop");
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
    drop.addEventListener("drop", (e) => { e.preventDefault(); add(e.dataTransfer.files); });

    v.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", async () => {
      if (!confirmTwice(btn)) return;
      const id = btn.dataset.del;
      books = books.filter((b) => b.id !== id); saveAll();
      await shelfDel(id).catch(() => {});
      if (share.code) fetch(fileUrl(id), { method: "DELETE" }).catch(() => {});
      showLibrary();
    }));
    v.querySelectorAll("[data-ren]").forEach((btn) => btn.addEventListener("click", () => {
      const b = books.find((x) => x.id === btn.dataset.ren);
      const card = btn.closest(".rm-book"), title = card.querySelector("b");
      title.outerHTML = `<input class="rm-rename" value="${esc(b.title)}">`;
      const inp = card.querySelector(".rm-rename"); inp.focus(); inp.select();
      const done = () => { b.title = inp.value.trim() || b.title; saveAll(); showLibrary(); };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") done(); if (e.key === "Escape") showLibrary(); });
      inp.addEventListener("blur", done);
    }));

    // books added before you had a save code: put them online now, quietly
    if (share.code) books.filter((b) => !b.cloud).forEach((b) => cloudPutBook(b));
  }

  /* ---------- the reader: two pages side by side ---------- */

  const openDocs = new Map();       // books already opened this visit
  let readerKeys = null;

  async function showBook(id) {
    const v = $("rm-view");
    const b = books.find((x) => x.id === id);
    if (!b) { v.innerHTML = `<p class="rm-empty">that book isn't on your shelf. <a href="#library">back to the library</a></p>`; return; }
    const opts = store.get("readOpts", { cover: true, single: false, zoom: 1 });
    v.innerHTML = `
      <div class="rm-reader">
        <div class="rm-rtop">
          <a href="#library">library</a>
          <span class="rm-rtitle"><b>${esc(b.title)}</b>${b.author ? ` <span class="rm-why">${esc(b.author)}</span>` : ""}</span>
          <span class="rm-rctl">
            <button type="button" id="rm-rprev" aria-label="back">‹</button>
            <span class="rm-why">page <input id="rm-rpage" value="${b.page || 1}" size="3" inputmode="numeric"> of ${b.pages}</span>
            <button type="button" id="rm-rnext" aria-label="forward">›</button>
            <button type="button" id="rm-rsingle" class="${opts.single ? "on" : ""}">one page</button>
            <button type="button" id="rm-rcover" class="${opts.cover ? "on" : ""}" title="the first page sits alone, like a cover, so pages pair up the way the book was printed">cover alone</button>
            <button type="button" data-z="-1">−</button><button type="button" data-z="1">+</button>
          </span>
        </div>
        <div class="rm-spread" id="rm-spread"><p class="rm-status">opening…</p></div>
        <input type="range" class="rm-rbar" id="rm-rbar" min="1" max="${b.pages}" value="${b.page || 1}" aria-label="where you are in the book">
      </div>`;

    let doc = openDocs.get(id);
    if (!doc) {
      const blob = await bookBlob(b);
      if (!$("rm-spread")) return;
      if (!blob) { $("rm-spread").innerHTML = `<p class="rm-empty">this PDF isn't in this browser${share.code ? " or in your room online" : ""}. add it again on the <a href="#library">library</a> page.</p>`; return; }
      try { doc = await openPdf(new Uint8Array(await blob.arrayBuffer())); openDocs.set(id, doc); }
      catch (e) { $("rm-spread").innerHTML = `<p class="rm-empty">couldn't open this PDF.</p>`; return; }
    }
    if (location.hash !== "#read/" + id) return;

    const N = doc.numPages;
    const narrow = () => window.innerWidth < 760;
    // which pages sit together: [1], [2, 3], [4, 5] … (cover alone) or [1, 2], [3, 4] …
    const spreadOf = (p) => {
      if (opts.single || narrow()) return [p];
      const first = opts.cover ? (p === 1 ? 1 : p % 2 === 0 ? p : p - 1) : (p % 2 === 1 ? p : p - 1);
      return opts.cover && first === 1 ? [1] : [first, first + 1].filter((x) => x <= N);
    };
    let cur = Math.min(Math.max(1, b.page || 1), N);
    let tasks = [];
    const draw = async () => {
      const box = $("rm-spread");
      if (!box) return;
      const pages = spreadOf(cur);
      cur = pages[0];
      tasks.forEach((t) => { try { t.cancel(); } catch (e) {} });
      tasks = [];
      box.className = "rm-spread n" + pages.length + (opts.cover && pages[0] === 1 && pages.length === 1 && !opts.single && !narrow() ? " cover" : "");
      box.innerHTML = pages.map((n) => `<figure class="rm-pg" data-n="${n}"><canvas></canvas><figcaption>${n}</figcaption></figure>`).join("");
      const availH = Math.max(320, window.innerHeight - box.getBoundingClientRect().top - 70);
      const availW = (box.clientWidth - 2 * (pages.length - 1)) / (opts.cover && pages.length === 1 && !opts.single && !narrow() ? 2 : pages.length);
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      await Promise.all(pages.map(async (n, i) => {
        const page = await doc.getPage(n);
        const vp1 = page.getViewport({ scale: 1 });
        const scale = Math.min(availH / vp1.height, availW / vp1.width) * opts.zoom;
        const vp = page.getViewport({ scale: scale * dpr });
        const cv = box.querySelectorAll("canvas")[i];
        if (!cv) return;
        cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        cv.style.width = Math.round(vp.width / dpr) + "px"; cv.style.height = Math.round(vp.height / dpr) + "px";
        const t = page.render({ canvasContext: cv.getContext("2d"), viewport: vp });
        tasks.push(t);
        try { await t.promise; } catch (e) { /* turned the page before it finished */ }
      }));
      $("rm-rpage").value = cur;
      $("rm-rbar").value = cur;
      if (b.page !== cur) { b.page = cur; saveAll(); }
      // read ahead: get the next pages ready
      spreadOf(Math.min(N, pages[pages.length - 1] + 1)).forEach((n) => doc.getPage(n).catch(() => {}));
    };
    const go = (p) => { p = Math.min(Math.max(1, p | 0), N); if (spreadOf(p)[0] === spreadOf(cur)[0] && p === cur) return; cur = p; draw(); };
    const next = () => { const s = spreadOf(cur); if (s[s.length - 1] < N) go(s[s.length - 1] + 1); };
    const prev = () => { const s = spreadOf(cur); if (s[0] > 1) go(spreadOf(s[0] - 1)[0]); };

    $("rm-rnext").addEventListener("click", next);
    $("rm-rprev").addEventListener("click", prev);
    $("rm-rpage").addEventListener("change", (e) => go(+e.target.value));
    $("rm-rbar").addEventListener("input", (e) => { $("rm-rpage").value = e.target.value; });
    $("rm-rbar").addEventListener("change", (e) => go(+e.target.value));
    $("rm-rsingle").addEventListener("click", (e) => { opts.single = !opts.single; e.target.classList.toggle("on", opts.single); store.set("readOpts", opts); draw(); });
    $("rm-rcover").addEventListener("click", (e) => { opts.cover = !opts.cover; e.target.classList.toggle("on", opts.cover); store.set("readOpts", opts); draw(); });
    v.querySelectorAll(".rm-rctl [data-z]").forEach((btn) => btn.addEventListener("click", () => {
      opts.zoom = Math.min(3, Math.max(0.5, opts.zoom * (+btn.dataset.z > 0 ? 1.2 : 1 / 1.2))); store.set("readOpts", opts); draw();
    }));
    // click the left page to go back, the right page to go forward
    $("rm-spread").addEventListener("click", (e) => {
      const fig = e.target.closest(".rm-pg");
      if (!fig) return;
      const r = fig.getBoundingClientRect();
      const pages = spreadOf(cur);
      if (pages.length === 2) (+fig.dataset.n === pages[0] ? prev : next)();
      else (e.clientX < r.left + r.width / 2 ? prev : next)();
    });
    if (readerKeys) document.removeEventListener("keydown", readerKeys);
    readerKeys = (e) => {
      if (!location.hash.startsWith("#read/")) { document.removeEventListener("keydown", readerKeys); readerKeys = null; return; }
      if (e.target.closest("input, textarea")) return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    document.addEventListener("keydown", readerKeys);
    let rt;
    const onResize = () => { if (!location.hash.startsWith("#read/" + id)) return window.removeEventListener("resize", onResize); clearTimeout(rt); rt = setTimeout(draw, 150); };
    window.addEventListener("resize", onResize);
    draw();
  }

  /* ============================================================
     2 · COLOR PICKER: any picture you saved (or your own work).
     Click on it to pick a color; every color goes to the bank.
     ============================================================ */

  function showPicker() {
    const v = $("rm-view");
    const all = collection.filter((w) => w.img || w.thumb).slice().reverse().concat(share.artist ? myWorkAsItems() : []);
    v.innerHTML = `
      <p class="rm-intro">pick colors from anything you saved. click on the picture to pick; every color goes to the <a href="#bank">color bank</a>.</p>
      <div class="rm-filters"><input id="rm-pfind" placeholder="search for something specific (moss, blue, munch…)" size="40"><span class="rm-why" id="rm-pcount"></span></div>
      <div class="rm-pickwrap">
        <div class="rm-stage" id="rm-pstage"></div>
        <div class="rm-minis open" id="rm-pminis"></div>
      </div>
      <div class="rm-picked"><h4>picked <a href="#bank" class="rm-why">the color bank →</a></h4><div class="rm-swatches" id="rm-recent"></div></div>
      <div class="rm-loupe" id="rm-loupe" hidden></div>`;
    const stage = $("rm-pstage"), minis = $("rm-pminis");
    const draw = (q) => {
      const list = all.filter((w) => !q || plain([w.title, w.artist, (w.tags || []).join(" "), w.tag].join(" ")).includes(plain(q)));
      $("rm-pcount").textContent = `${list.length} pictures`;
      minis.innerHTML = list.map((w, i) => `<button type="button" data-i="${i}" title="${esc(w.title || "")}"><img src="${esc(w.thumb || w.img)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join("");
      minis.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        minis.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        loadStage(stage, list[+b.dataset.i], sideOf(list[+b.dataset.i]));
      }));
      if (list.length) minis.querySelector("button").click();
      else stage.innerHTML = `<p class="rm-empty">${all.length ? "nothing matches." : "nothing saved yet: press + on pictures in step 1."}</p>`;
    };
    $("rm-pfind").addEventListener("input", (e) => draw(e.target.value));
    draw("");
    drawRecent();
  }

  /* ============================================================
     3 · COLOR BANK: every color you picked, filling the whole
     page, no gaps. Click one for its pop-up.
     ============================================================ */

  function showBank() {
    const v = $("rm-view");
    const sorted = shuffle(colors);   // no rainbow order: colors land next to colors they wouldn't otherwise meet
    v.innerHTML = `
      <div class="rm-banktop"><span class="rm-why">${colors.length} colors</span><button type="button" id="rm-roll" class="rm-dice" title="roll: move every color somewhere new">⚄ roll</button><button type="button" id="rm-move">move the colors around →</button></div>
      ${sorted.length
        ? `<div class="rm-bank" id="rm-bank">${sorted.map((c) => `<button type="button" data-id="${c.id}" data-hex="${esc(c.hex)}" style="background:${esc(c.hex)}" aria-label="${esc(c.hex)}"></button>`).join("")}</div>`
        : `<p class="rm-empty">the bank is empty. pick colors in the <a href="#picker">color picker</a> or <a href="#split">splitscreen</a>.</p>`}
      <div class="rm-hexchip" id="rm-hexchip" hidden></div>
      <div class="rm-pop" id="rm-pop" hidden></div>`;
    $("rm-move").addEventListener("click", openMachine);
    $("rm-roll").addEventListener("click", rollBank);
    placeBank();
    const chip = $("rm-hexchip"), pop = $("rm-pop");
    v.querySelectorAll("#rm-bank button").forEach((b) => {
      b.addEventListener("mouseenter", () => { const r = b.getBoundingClientRect(); chip.textContent = b.dataset.hex; chip.style.left = r.left + r.width / 2 + "px"; chip.style.top = r.top - 4 + "px"; chip.hidden = false; });
      b.addEventListener("mouseleave", () => { chip.hidden = true; });
      b.addEventListener("click", () => {
        const c = colors.find((x) => x.id === b.dataset.id);
        const onTable = table.includes(c.hex);
        pop.innerHTML = `<button class="rm-x" type="button" aria-label="close">×</button>
          <div class="rm-popsw" style="background:${esc(c.hex)}"></div>
          <p><b>${esc(c.hex)}</b>${c.from && c.from.title ? `<br><span class="rm-why">from ${esc(c.from.title)}${c.from.artist ? ", " + esc(c.from.artist) : ""}</span>` : ""}</p>
          ${c.from && c.from.thumb ? `<img src="${esc(c.from.thumb)}" alt="" referrerpolicy="no-referrer">` : ""}
          <div class="rm-mbtns"><button type="button" data-a="copy">copy hex</button><button type="button" data-a="table">${onTable ? "on the table ✓" : "put on the table"}</button><button type="button" data-a="move">move the colors around →</button><button type="button" class="rm-del" data-a="del">delete</button></div>`;
        pop.hidden = false;
        pop.querySelector(".rm-x").addEventListener("click", () => { pop.hidden = true; });
        pop.querySelector('[data-a="copy"]').addEventListener("click", (e) => { if (navigator.clipboard) navigator.clipboard.writeText(c.hex); e.target.textContent = "copied"; });
        pop.querySelector('[data-a="table"]').addEventListener("click", (e) => { if (!table.includes(c.hex)) { table.push(c.hex); store.set("table", table); } e.target.textContent = "on the table ✓"; });
        pop.querySelector('[data-a="move"]').addEventListener("click", () => { pop.hidden = true; openMachine(); });
        const del = pop.querySelector('[data-a="del"]');
        del.addEventListener("click", () => { if (!confirmTwice(del)) return; colors = colors.filter((x) => x.id !== c.id); saveAll(); showBank(); });
      });
    });
  }

  // the bank sits right on the page's grid: one color per grid square. It stays where it
  // was (under the count + roll, right of the menu), nudged onto the nearest grid lines,
  // and holds still while the grid holds still. More colors than squares: it scrolls a whole row at a time.
  function placeBank() {
    const box = $("rm-bank"), top = document.querySelector(".rm-banktop"), view = $("rm-view");
    if (!box || !top || !view) return;
    const G = typeof GRID_SIZE === "number" ? GRID_SIZE : 28;
    window.scrollTo(0, 0);
    const x = Math.round(view.getBoundingClientRect().left / G) * G;
    const y = Math.ceil((top.getBoundingClientRect().bottom + 4) / G) * G;
    const cols = Math.max(1, Math.floor((window.innerWidth - x - G) / G));
    box.classList.add("on-grid");
    box.style.setProperty("--g", G + "px");
    box.style.setProperty("--x", x + "px");
    box.style.setProperty("--y", y + "px");
    box.style.setProperty("--cols", cols);
    // the colors fill in, one square at a time, like collecting them (only when the page opens)
    if (!box.dataset.filled) {
      box.dataset.filled = "1";
      [...box.children].forEach((c, i) => c.style.setProperty("--d", Math.min(i * 6, 900) + "ms"));
      setTimeout(() => box.classList.add("filled"), 1400);
    }
    // after scrolling, settle back onto the grid lines
    if (!box.dataset.snaps) {
      box.dataset.snaps = "1";
      let t;
      box.addEventListener("scroll", () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const want = Math.round(box.scrollTop / G) * G;
          if (Math.abs(want - box.scrollTop) > 0.5) box.scrollTo({ top: want, behavior: "smooth" });
        }, 120);
      });
    }
  }
  window.addEventListener("resize", () => { if (root.dataset.page === "bank") placeBank(); });

  // the dice: every box slides to a new random place
  function rollBank() {
    const box = $("rm-bank");
    if (!box) return;
    const kids = [...box.children];
    const before = new Map(kids.map((k) => [k, k.getBoundingClientRect()]));
    shuffle(kids).forEach((k) => box.appendChild(k));
    kids.forEach((k) => {
      const a = before.get(k), b = k.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) return;
      k.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 450 + Math.random() * 300, easing: "cubic-bezier(.2,.7,.2,1)" });
    });
    const d = $("rm-roll");
    if (d) { const faces = "⚀⚁⚂⚃⚄⚅"; d.textContent = faces[Math.floor(Math.random() * 6)] + " roll"; }
  }

  // the color machine, in a pop-up over the page (like a picture opening big)
  function openMachine() {
    let pop = $("rm-cpop");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "rm-cpop"; pop.className = "rm-cpop";
      pop.innerHTML = `<button type="button" class="rm-cpopx">close</button><div class="room rm-cpopbody" id="rm-cpopbody"></div>`;
      document.body.appendChild(pop);
      pop.querySelector(".rm-cpopx").addEventListener("click", closeMachine);
      pop.addEventListener("click", (e) => { if (e.target === pop) closeMachine(); });
    }
    pop.classList.add("show");
    document.body.classList.add("rm-noscroll");
    showColors();
  }
  function closeMachine() {
    const pop = $("rm-cpop");
    if (!pop || !pop.classList.contains("show")) return;
    pop.classList.remove("show");
    document.body.classList.remove("rm-noscroll");
    if (root.dataset.page === "bank") showBank();
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMachine(); });

  /* ============================================================
     3 · ORDER OF OPERATIONS: lists. Everything that has to
     happen before something is done, wishlists, anything.
     ============================================================ */

  function showOrder() {
    const v = $("rm-view");
    v.innerHTML = `
      <p class="rm-intro">lists: what has to happen, in order, before something is done. wishlists. anything. connect one to an idea on the <a href="#ideas">idea board</a>.</p>
      <button type="button" class="rm-btn" id="rm-newlist">+ new list</button>
      <div class="rm-lists">${lists.map((l) => {
        const done = l.items.filter((x) => x.done).length;
        return `<div class="rm-list" data-id="${l.id}">
          <input class="rm-ltitle" value="${esc(l.name)}" placeholder="name this list">
          <span class="rm-why">${l.items.length ? `${done} of ${l.items.length} done` : "empty"}${ideas.filter((i) => i.list === l.id).map((i) => ` · waters <a href="#ideas">${esc(i.title || "an idea")}</a>`).join("")}</span>
          <ol>${l.items.map((it, k) => `<li class="${it.done ? "done" : ""}"><input type="checkbox" data-k="${k}"${it.done ? " checked" : ""}><input class="rm-ltext" data-k="${k}" value="${esc(it.t)}"><span class="rm-lbtns"><button type="button" data-up="${k}" title="move up">↑</button><button type="button" data-dn="${k}" title="move down">↓</button><button type="button" class="rm-del" data-x="${k}">×</button></span></li>`).join("")}</ol>
          <input class="rm-lnew" placeholder="+ add, press enter">
          <button type="button" class="rm-del rm-ldel">delete list</button>
        </div>`;
      }).join("")}</div>`;
    $("rm-newlist").addEventListener("click", () => { lists.unshift({ id: uid(), name: "", items: [] }); saveAll(); showOrder(); v.querySelector(".rm-ltitle").focus(); });
    v.querySelectorAll(".rm-list").forEach((card) => {
      const l = lists.find((x) => x.id === card.dataset.id);
      card.querySelector(".rm-ltitle").addEventListener("input", (e) => { l.name = e.target.value; saveAll(); });
      card.querySelectorAll('input[type="checkbox"]').forEach((b) => b.addEventListener("change", () => {
        l.items[+b.dataset.k].done = b.checked;
        if (b.checked) ideas.forEach((i) => { if (i.list === l.id) i.watered = Date.now(); });
        saveAll(); showOrder();
      }));
      card.querySelectorAll(".rm-ltext").forEach((b) => b.addEventListener("input", () => { l.items[+b.dataset.k].t = b.value; saveAll(); }));
      const swap = (a, b) => { if (b < 0 || b >= l.items.length) return; [l.items[a], l.items[b]] = [l.items[b], l.items[a]]; saveAll(); showOrder(); };
      card.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => swap(+b.dataset.up, +b.dataset.up - 1)));
      card.querySelectorAll("[data-dn]").forEach((b) => b.addEventListener("click", () => swap(+b.dataset.dn, +b.dataset.dn + 1)));
      card.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", () => { l.items.splice(+b.dataset.x, 1); saveAll(); showOrder(); }));
      card.querySelector(".rm-lnew").addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || !e.target.value.trim()) return;
        l.items.push({ id: uid(), t: e.target.value.trim(), done: false }); saveAll(); showOrder();
        const again = v.querySelector(`.rm-list[data-id="${l.id}"] .rm-lnew`); if (again) again.focus();
      });
      const del = card.querySelector(".rm-ldel");
      del.addEventListener("click", () => { if (!confirmTwice(del)) return; lists = lists.filter((x) => x.id !== l.id); ideas.forEach((i) => { if (i.list === l.id) i.list = ""; }); saveAll(); showOrder(); });
    });
  }

  // on an idea card: its connected list + colors
  function ideaLinks(i) {
    const l = i.list && lists.find((x) => x.id === i.list);
    const c = i.combo && combos.find((x) => x.id === i.combo);
    if (!l && !c) return "";
    return `<div class="rm-ilinked">${c ? `<span class="rm-istrip">${c.hexes.map((h) => `<i style="background:${esc(h)}"></i>`).join("")}</span>` : ""}
      ${l ? `<a href="#order">${esc(l.name || "list")}: ${l.items.filter((x) => x.done).length} of ${l.items.length} done →</a>` : ""}</div>`;
  }

  /* ============================================================
     4 · WHAT DID YOU MAKE: your room's name, what's inspiring
     you right now, and progress posts.
     ============================================================ */

  /* ============================================================
     THE BLOG: the heart of the site. Share what you're working on:
     pictures, words, what you're listening to / watching / reading,
     colors you've been collecting, and how an idea is growing.

     Pictures are kept like the library's PDFs: in this browser
     (IndexedDB holds a lot) and online under your save code, so
     they don't fill up the browser's small storage.
     ============================================================ */

  const NOW_KINDS = [["listening", "♪"], ["watching", "▶"], ["reading", "❏"], ["loving", "♥"], ["making", "✎"]];
  const picUrls = new Map();          // picture id → a URL the page can show

  async function savePic(file) {
    const blob = await new Promise((ok, no) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        c.toBlob((b) => b ? ok(b) : no(new Error("no picture")), "image/jpeg", 0.86);
      };
      img.onerror = no;
      img.src = URL.createObjectURL(file);
    });
    const id = "p" + uid();
    await shelfPut(id, blob);
    picUrls.set(id, URL.createObjectURL(blob));
    if (share.code) fetch(fileUrl(id), { method: "PUT", headers: { "content-type": "image/jpeg" }, body: blob }).catch(() => {});
    return "pic:" + id;
  }
  // put the real pictures into every <img data-pic> on the page
  function showPics(box) {
    box.querySelectorAll("img[data-pic]").forEach(async (im) => {
      const id = im.dataset.pic;
      if (!picUrls.has(id)) {
        let blob = await shelfGet(id).catch(() => null);
        if (!blob && share.code) {
          try { const r = await fetch(fileUrl(id)); if (r.ok) { blob = await r.blob(); shelfPut(id, blob).catch(() => {}); } } catch (e) {}
        }
        if (!blob) { im.replaceWith(Object.assign(document.createElement("span"), { className: "rm-vblank" })); return; }
        picUrls.set(id, URL.createObjectURL(blob));
      }
      im.src = picUrls.get(id);
    });
  }
  const picsOf = (p) => p.images || (p.img ? [p.img] : []);
  const picTag = (src, i) => /^pic:/.test(src) ? `<img data-pic="${esc(src.slice(4))}" data-i="${i}" alt="">` : `<img src="${esc(src)}" data-i="${i}" alt="" referrerpolicy="no-referrer">`;
  const niceDate = (d) => { const t = new Date((d || "") + "T12:00"); return isNaN(t) ? esc(d || "") : t.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).toLowerCase(); };

  // one post, the same on the blog and in the visitor's view
  function postHTML(p, editable) {
    const pics = picsOf(p);
    const idea = p.idea;
    return `<article class="rm-bpost" data-id="${esc(p.id)}">
      <header><span class="rm-why">${niceDate(p.date)}</span>${p.title ? `<h3>${esc(p.title)}</h3>` : ""}</header>
      ${pics.length ? `<div class="rm-bpics n${Math.min(pics.length, 4)}">${pics.map(picTag).join("")}</div>` : ""}
      ${p.text ? `<div class="rm-btext">${esc(p.text).split(/\n{2,}/).map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`).join("")}</div>` : ""}
      ${(p.now || []).filter((n) => n.title).length ? `<ul class="rm-bnow">${p.now.filter((n) => n.title).map((n) => { const k = NOW_KINDS.find((x) => x[0] === n.kind) || ["", "·"]; return `<li><span class="rm-nowicon">${k[1]}</span> <span class="rm-why">now ${esc(n.kind)}</span> ${esc(n.title)}</li>`; }).join("")}</ul>` : ""}
      ${(p.colors || []).length ? `<div class="rm-bcolors">${p.colors.map((h) => `<i style="background:${esc(h)}" title="${esc(h)}"></i>`).join("")}</div>` : ""}
      ${idea ? `<div class="rm-bidea"><pre class="rm-plant">${idea.art || ""}</pre><div><span class="rm-why">working on</span><br><b>${esc(idea.title || "an idea")}</b><br><span class="rm-why">${esc(idea.line || "")}</span></div></div>` : ""}
      ${editable ? `<footer><button type="button" class="rm-del" data-edit="${esc(p.id)}">edit</button><button type="button" class="rm-del" data-pdel="${esc(p.id)}">delete</button></footer>` : ""}
    </article>`;
  }
  function wirePosts(box, list) {
    showPics(box);
    // click a picture: see it big (arrows go through that post's pictures)
    box.querySelectorAll(".rm-bpics").forEach((g) => g.addEventListener("click", (e) => {
      const im = e.target.closest("img"); if (!im || typeof openLightbox !== "function") return;
      const p = list.find((x) => x.id === g.closest(".rm-bpost").dataset.id);
      const imgs = [...g.querySelectorAll("img")];
      openLightbox(imgs.map((x) => ({ file: x.src, title: p.title || niceDate(p.date), tagList: [] })), +im.dataset.i);
    }));
  }

  // what you're writing right now (kept if you leave the page)
  let draft = store.get("blogDraft", null);
  const newDraft = () => ({ id: "", title: "", text: "", images: [], now: [], colors: [], ideaId: "" });

  function showBlog() {
    const v = $("rm-view");
    const fromIdea = store.get("postDraft", null);
    if (!draft) draft = newDraft();
    if (fromIdea) { draft.title = draft.title || fromIdea.title; draft.text = draft.text || fromIdea.text; draft.ideaId = fromIdea.ideaId || draft.ideaId; store.set("postDraft", null); }
    const posts = share.posts.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || share.posts.indexOf(b) - share.posts.indexOf(a));
    const lastNow = Object.fromEntries((share.now || []).map((n) => [String(n.label || "").replace(/^now\s+/, ""), n.title]));
    const bank = [...new Set(colors.slice().reverse().map((c) => c.hex))].slice(0, 40);
    v.innerHTML = `
      <div class="rm-blog">
        <div class="rm-bhead"><h1>${esc(share.roomName || "my room")}</h1><span class="rm-why">studio blog · ${posts.length} post${posts.length === 1 ? "" : "s"} · <a href="#visit">as a visitor sees it →</a></span></div>

        <form class="rm-compose" id="rm-compose" autocomplete="off">
          <input name="title" placeholder="title (or don't)" value="${esc(draft.title)}">
          <textarea name="text" rows="4" placeholder="what's happening in the studio?">${esc(draft.text)}</textarea>
          <div class="rm-cpics" id="rm-cpics">${draft.images.map((src, i) => `<span class="rm-cpic">${picTag(src, i)}<button type="button" data-unpic="${i}" aria-label="take out">×</button></span>`).join("")}
            <label class="rm-cadd" title="add pictures (or drop them here, or paste)">+<input type="file" id="rm-cfile" accept="image/*" multiple hidden></label></div>
          <div class="rm-cnow">${draft.now.map((n, i) => { const k = NOW_KINDS.find((x) => x[0] === n.kind); return `<label class="rm-cnowrow"><span class="rm-nowicon">${k ? k[1] : "·"}</span> now ${esc(n.kind)} <input data-now="${i}" value="${esc(n.title)}" placeholder="${esc(lastNow[n.kind] || "")}"><button type="button" class="rm-del" data-unnow="${i}">×</button></label>`; }).join("")}</div>
          ${draft.showColors ? `<div class="rm-cbank">${bank.length ? bank.map((h) => `<button type="button" data-hex="${esc(h)}" style="--c:${esc(h)}" class="${draft.colors.includes(h) ? "on" : ""}" title="${esc(h)}"></button>`).join("") : `<span class="rm-why">no colors yet: pick some in the <a href="#picker">color picker</a>.</span>`}</div>` : ""}
          ${draft.colors.length ? `<div class="rm-bcolors small">${draft.colors.map((h) => `<i style="background:${esc(h)}"></i>`).join("")}</div>` : ""}
          ${draft.showIdea || draft.ideaId ? `<select id="rm-cidea"><option value="">no idea attached</option>${ideas.filter((i) => !i.harvested || true).map((i) => `<option value="${i.id}"${draft.ideaId === i.id ? " selected" : ""}>${esc(i.title || "untitled idea")} · ${PLANT_NAMES[plantOf(i).stage]}</option>`).join("")}</select>` : ""}
          <div class="rm-cbar">
            <span class="rm-cadds">${NOW_KINDS.map(([k, icon]) => `<button type="button" data-addnow="${k}">${icon} ${k}</button>`).join("")}<button type="button" id="rm-ccolors" class="${draft.showColors ? "on" : ""}">■ colors</button><button type="button" id="rm-cideabtn" class="${draft.showIdea || draft.ideaId ? "on" : ""}">✿ an idea</button></span>
            <span class="rm-status" id="rm-cst"></span>
            ${draft.id ? `<button type="button" class="rm-del" id="rm-cancel">cancel edit</button>` : ""}
            <button type="submit" class="rm-btn">${draft.id ? "update" : "post"}</button>
          </div>
        </form>

        <div class="rm-bfeed" id="rm-bfeed">${posts.map((p) => postHTML(p, true)).join("") || `<p class="rm-empty">your first post goes here. a picture of the wall, what you're listening to, half a thought: it all counts.</p>`}</div>
      </div>`;

    const form = $("rm-compose"), st = $("rm-cst");
    const keep = () => store.set("blogDraft", draft);
    form.title.addEventListener("input", (e) => { draft.title = e.target.value; keep(); });
    form.text.addEventListener("input", (e) => { draft.text = e.target.value; keep(); e.target.style.height = "auto"; e.target.style.height = Math.max(96, e.target.scrollHeight + 2) + "px"; });
    showPics($("rm-cpics"));

    // pictures: the + button, dropping files anywhere on the box, or pasting
    const addFiles = async (files) => {
      const imgs = [...files].filter((f) => /^image\//.test(f.type));
      if (!imgs.length) return;
      st.textContent = `adding ${imgs.length} picture${imgs.length === 1 ? "" : "s"}…`;
      for (const f of imgs) { try { draft.images.push(await savePic(f)); } catch (e) { st.textContent = "a picture didn't open"; } }
      keep(); st.textContent = ""; showBlog();
    };
    $("rm-cfile").addEventListener("change", (e) => addFiles(e.target.files));
    ["dragenter", "dragover"].forEach((t) => form.addEventListener(t, (e) => { e.preventDefault(); form.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => form.addEventListener(t, () => form.classList.remove("over")));
    form.addEventListener("drop", (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });
    form.addEventListener("paste", (e) => { const f = [...(e.clipboardData || {}).files || []]; if (f.length) { e.preventDefault(); addFiles(f); } });
    v.querySelectorAll("[data-unpic]").forEach((b) => b.addEventListener("click", () => { draft.images.splice(+b.dataset.unpic, 1); keep(); showBlog(); }));

    // now listening / watching / reading / loving / making
    v.querySelectorAll("[data-addnow]").forEach((b) => b.addEventListener("click", () => { draft.now.push({ kind: b.dataset.addnow, title: "" }); keep(); showBlog(); const all = v.querySelectorAll("[data-now]"); const last = $("rm-view").querySelectorAll("[data-now]"); if (last.length) last[last.length - 1].focus(); }));
    v.querySelectorAll("[data-now]").forEach((inp) => inp.addEventListener("input", () => { draft.now[+inp.dataset.now].title = inp.value; keep(); }));
    v.querySelectorAll("[data-unnow]").forEach((b) => b.addEventListener("click", () => { draft.now.splice(+b.dataset.unnow, 1); keep(); showBlog(); }));

    // colors from the bank, and an idea from the idea board
    $("rm-ccolors").addEventListener("click", () => { draft.showColors = !draft.showColors; keep(); showBlog(); });
    v.querySelectorAll(".rm-cbank [data-hex]").forEach((b) => b.addEventListener("click", () => {
      const h = b.dataset.hex; draft.colors = draft.colors.includes(h) ? draft.colors.filter((x) => x !== h) : draft.colors.concat(h); keep(); showBlog();
    }));
    $("rm-cideabtn").addEventListener("click", () => { draft.showIdea = !(draft.showIdea || draft.ideaId); if (!draft.showIdea) draft.ideaId = ""; keep(); showBlog(); });
    if ($("rm-cidea")) $("rm-cidea").addEventListener("change", (e) => { draft.ideaId = e.target.value; keep(); });
    if ($("rm-cancel")) $("rm-cancel").addEventListener("click", () => { draft = newDraft(); keep(); showBlog(); });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = draft.text.trim(), title = draft.title.trim();
      const now = draft.now.map((n) => ({ kind: n.kind, title: n.title.trim() })).filter((n) => n.title);
      if (!text && !title && !draft.images.length && !now.length) { st.textContent = "write something or add a picture first"; return; }
      // an idea is saved as it looks today, so the post shows how far along it was
      const i = draft.ideaId && ideas.find((x) => x.id === draft.ideaId);
      const idea = i ? { id: i.id, title: i.title, art: plantHTML(i).replace(/^<pre[^>]*>|<\/pre>$/g, ""), line: (() => { const pl = plantOf(i); return PLANT_NAMES[pl.stage] + (pl.total ? ` · ${pl.done} of ${pl.total} steps` : ""); })() } : null;
      const old = draft.id && share.posts.find((p) => p.id === draft.id);
      const post = { id: draft.id || uid(), date: old ? old.date : today(), title, text, images: draft.images.slice(), now, colors: draft.colors.slice(), idea: idea || (old ? old.idea : null) };
      if (old) share.posts[share.posts.indexOf(old)] = post; else share.posts.push(post);
      // the newest "now" becomes your room's current now listening / watching…
      now.forEach((n) => { const k = "now " + n.kind, row = share.now.find((x) => x.label === k); if (row) row.title = n.title; else share.now.push({ label: k, title: n.title }); });
      if (i) i.watered = Date.now();
      saveAll();
      draft = newDraft(); keep(); showBlog();
    });

    const feed = $("rm-bfeed");
    wirePosts(feed, posts);
    feed.querySelectorAll("[data-pdel]").forEach((b) => b.addEventListener("click", () => {
      if (!confirmTwice(b)) return;
      const p = share.posts.find((x) => x.id === b.dataset.pdel);
      share.posts = share.posts.filter((x) => x !== p); saveAll();
      picsOf(p).filter((s) => /^pic:/.test(s)).forEach((s) => { shelfDel(s.slice(4)).catch(() => {}); if (share.code) fetch(fileUrl(s.slice(4)), { method: "DELETE" }).catch(() => {}); });
      showBlog();
    }));
    feed.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
      const p = share.posts.find((x) => x.id === b.dataset.edit);
      draft = { id: p.id, title: p.title || "", text: p.text || "", images: picsOf(p).slice(), now: (p.now || []).map((n) => ({ ...n })), colors: (p.colors || []).slice(), ideaId: p.idea ? p.idea.id : "" };
      keep(); showBlog(); window.scrollTo(0, 0);
    }));
  }

  function showShare() {
    const v = $("rm-view");
    v.innerHTML = `
      <div class="rm-profile">
        <input id="rm-rname" class="rm-roomtitle" value="${esc(share.roomName)}" placeholder="name your room" aria-label="your room's name">
        <div class="rm-savebox">
          ${share.code
            ? `<span class="rm-why">save code</span> <span class="rm-code small" title="type it on any browser to open your room there. keep it private.">${esc(share.code)}</span> <button type="button" id="rm-savenow">save now</button>`
            : `<button type="button" class="rm-btn" id="rm-makecode">make my save code</button> <span class="rm-why">so your room opens on any computer</span>`}
          <span class="rm-why" id="rm-cloudst">${esc(cloudState || (store.get("cloudAt", 0) ? "last saved " + new Date(store.get("cloudAt")).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).toLowerCase() : ""))}</span>
          <p class="rm-row rm-backrow rm-why"><button type="button" id="rm-dlback">download a backup</button> · <label class="rm-file">restore a backup<input type="file" id="rm-import" accept=".json" hidden></label> · <a href="#visit">see your room as a visitor →</a></p>
        </div>
        <p class="rm-why">write posts on your <a href="#blog">blog</a>.</p>
      </div>`;
    if ($("rm-savenow")) $("rm-savenow").addEventListener("click", () => { $("rm-cloudst").textContent = "saving…"; cloudSave(); });
    if ($("rm-makecode")) $("rm-makecode").addEventListener("click", () => { share.code = makeCode(share.roomName.replace(/'s room$/i, "")); store.set("setup", true); saveAll(); cloudSave(); showShare(); });
    $("rm-dlback").addEventListener("click", exportAll);
    $("rm-import").addEventListener("change", importAll);
    $("rm-rname").addEventListener("input", (e) => { share.roomName = e.target.value; saveAll(); });
    // the secret moved here: click your room's name three times for the instagram follower counts
    $("rm-rname").addEventListener("click", (e) => { if (e.detail === 3) openFollowers(); });
  }

  /* ---------- a visitor's view of a room (a preview: nobody else can see rooms yet) ----------
     The idea: a room is an archive of a studio practice. Posts in order, month by month,
     with the colors the person has been collecting. Their lists, plants and research stay private. */
  function showVisit() {
    const v = $("rm-view");
    const posts = share.posts.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const months = [];
    posts.forEach((p) => { const m = (p.date || "").slice(0, 7); let g = months.find((x) => x.m === m); if (!g) months.push(g = { m, posts: [] }); g.posts.push(p); });
    const monthName = (m) => { const d = new Date(m + "-15T12:00"); return isNaN(d) ? "undated" : d.toLocaleString("en-US", { month: "long", year: "numeric" }).toLowerCase(); };
    const strip = colors.slice(-60).map((c) => c.hex);
    v.innerHTML = `
      <p class="rm-visitnote rm-why">a preview of your room the way a visitor would see it. nobody else can see it yet. <a href="#blog">← back to your blog</a></p>
      <div class="rm-visit">
        <h1 class="rm-vname">${esc(share.roomName || "my room")}</h1>
        <p class="rm-why">${posts.length} post${posts.length === 1 ? "" : "s"}${posts.length ? ` · since ${esc(monthName(posts[posts.length - 1].date.slice(0, 7)))}` : ""}</p>
        ${(share.now || []).filter((n) => n.title).length ? `<ul class="rm-bnow">${share.now.filter((n) => n.title).map((n) => { const kind = String(n.label || "").replace(/^now\s+/, ""); const k = NOW_KINDS.find((x) => x[0] === kind) || ["", "·"]; return `<li><span class="rm-nowicon">${k[1]}</span> <span class="rm-why">now ${esc(kind)}</span> ${esc(n.title)}</li>`; }).join("")}</ul>` : ""}
        ${strip.length ? `<div class="rm-vcolors" title="colors collected">${strip.map((h) => `<i style="background:${esc(h)}"></i>`).join("")}</div>` : ""}
        <div class="rm-archive" id="rm-archive">${months.map((g) => `
          <section><h4>${esc(monthName(g.m))}</h4>${g.posts.map((p) => postHTML(p, false)).join("")}</section>`).join("") || `<p class="rm-empty">no posts yet: a visitor would see an empty room. write one on your <a href="#blog">blog</a>.</p>`}</div>
      </div>`;
    if ($("rm-archive")) wirePosts($("rm-archive"), posts);
  }

  /* ============================================================
     THE GARDEN: every idea is a plant.
     A new idea is a seed. Connect it to a list on order of
     operations and every step you check off waters it and it
     grows: sprout, seedling, bud, flower, a big flower ready to
     harvest. Forget about it and it gets thirsty, then shrinks.
     ============================================================ */

  const PLANT_ART = [["           ", "           ", "           ", "           ", "           ", "     .     ", "~~~~~o~~~~~", ":.:.:.:.:.:"],
    ["           ", "           ", "           ", "           ", "     ,_    ", "     |     ", "~~~~~|~~~~~", ":.:.:.:.:.:"],
    ["           ", "           ", "           ", "   _\\ /_   ", "     |     ", "   \\_|     ", "~~~~~|~~~~~", ":.:.:.:.:.:"],
    ["           ", "     _     ", "    (o)    ", "   \\_|_/   ", "     |     ", "   \\_|_/   ", "~~~~~|~~~~~", ":.:.:.:.:.:"],
    ["           ", "   \\ ' /   ", "  -.(@).-  ", "   / | \\   ", "   \\_|_/   ", "     |     ", "~~~~~|~~~~~", ":.:.:.:.:.:"],
    ["  .-'-'-.  ", " ( (\\@/) ) ", "  '-.|.-'  ", "  \\\\_|_//  ", "   \\_|_/   ", "     |     ", "~~~~~|~~~~~", ":.:.:.:.:.:"],
    ["           ", "  @ @ @ @  ", "   \\\\|//   ", " ___\\|/___ ", " \\       / ", "  \\_____/  ", "           ", "           "]];
  // the rows that are flower (petals) at each stage
  const BLOOM_ROWS = [[], [], [], [1, 2], [1, 2], [0, 1, 2], []];
  // every flower gets its own colors (picked from the idea, so they stay the same)
  const PETALS = ["#e86fa0", "#f49ac1", "#f2c230", "#ef8a5a", "#b98ee6", "#ff6f91", "#f6d55c", "#e85d75"];
  const PLANT_COLORS = { g: "#6aa84f", s: "#4e8f3a", d: "#8b5e3c", e: "#5a3a1e", v: "#b5714a" };
  const PLANT_NAMES = ["seed", "sprout", "seedling", "bud", "flower", "ready to harvest", "harvested"];

  function plantOf(i) {
    const l = i.list && lists.find((x) => x.id === i.list);
    const total = l ? l.items.length : 0, done = l ? l.items.filter((x) => x.done).length : 0;
    const p = total ? done / total : 0;
    if (i.harvested) return { stage: 6, grown: 6, p: 1, done, total, days: 0, thirsty: false, wilting: false };
    const grown = !l ? 0 : p >= 1 ? 5 : p >= 0.75 ? 4 : p >= 0.5 ? 3 : p >= 0.2 ? 2 : 1;
    const last = i.watered || (i.planted ? new Date(i.planted + "T12:00").getTime() : Date.now());
    const days = Math.floor((Date.now() - last) / 864e5);
    // a plant you haven't worked on gets thirsty after 4 days, then shrinks a stage every week
    const shrink = grown === 5 || grown < 2 ? 0 : Math.max(0, Math.floor((days - 4) / 7) + (days >= 11 ? 1 : 0));
    const stage = Math.max(1, grown - shrink);
    return { stage: grown === 0 ? 0 : stage, grown, p, done, total, days, thirsty: grown > 0 && grown < 5 && days >= 4, wilting: stage < grown };
  }

  // the petal color: the one picked on the idea card, or one of the PETALS by default
  function petalOf(i) {
    if (i.color) return i.color;
    let h = 0; for (const ch of String(i.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PETALS[h % PETALS.length];
  }
  function centerFor(hex) {      // a center that shows up against the petals
    const { h, l } = hexToHsl(hex);
    return (h > 35 && h < 70 && l > 0.45) ? "#c0587e" : "#f2c230";
  }

  function plantHTML(i, size = "") {
    const pl = plantOf(i), st = pl.stage;
    const petal = petalOf(i), center = centerFor(petal);
    let h = 0; for (const ch of String(i.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    let flowerN = 0;
    const kind = (li, ch) => {
      if (ch === " ") return "";
      if (st === 6) return ch === "@" ? (flowerN++ % 2 ? petal : PETALS[(h + flowerN * 3) % PETALS.length]) : li <= 2 ? PLANT_COLORS.s : PLANT_COLORS.v;
      if (li === 7) return ch === "o" ? PLANT_COLORS.e : PLANT_COLORS.d;
      if (li === 6) return ch === "~" ? PLANT_COLORS.g : ch === "o" ? PLANT_COLORS.e : PLANT_COLORS.s;
      if (BLOOM_ROWS[st].includes(li)) return ch === "@" ? center : ch === "|" ? PLANT_COLORS.s : petal;
      return PLANT_COLORS.s;
    };
    const art = PLANT_ART[st].map((line, li) => [...line].map((ch) => { const c = kind(li, ch); return c ? `<b style="color:${c}">${esc(ch)}</b>` : " "; }).join("")).join("\n");
    return `<pre class="rm-plant s${st}${pl.thirsty ? " thirsty" : ""} ${size}" aria-label="${PLANT_NAMES[st]}">${art}</pre>`;
  }

  function plantLine(i) {
    const pl = plantOf(i);
    if (pl.stage === 6) return `harvested ${esc(i.harvested)}`;
    if (!i.list) return `a seed. connect a list from <a href="#order">order of operations</a> and every step you check off waters it.`;
    const bar = "[" + "#".repeat(Math.round(pl.p * 10)) + "-".repeat(10 - Math.round(pl.p * 10)) + "]";
    return `${PLANT_NAMES[pl.stage]} <span class="rm-bar">${bar}</span> ${pl.done} of ${pl.total}`
      + (pl.thirsty ? ` · <span class="rm-late">thirsty: ${pl.days} days since you worked on it${pl.wilting ? ", it's shrinking" : ""}</span>` : "");
  }

  // the garden: in the left column under the menu, every flower exactly 2 x 2 grid squares,
  // lined up on the page's grid. Click a flower to go to its idea.
  function drawGarden() {
    let g = $("rm-garden");
    const live = ideas.filter((i) => !i.harvested || i.harvested >= new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
    if (!live.length) { if (g) g.remove(); return; }
    if (!g) { g = document.createElement("div"); g.id = "rm-garden"; g.className = "rm-garden"; g.setAttribute("aria-label", "your garden"); document.body.appendChild(g); }
    g.innerHTML = live.map((i) => `<a href="#ideas" data-idea="${esc(i.id)}" class="rm-gplant" title="${esc(i.title || "untitled idea")} · ${PLANT_NAMES[plantOf(i).stage]}">${plantHTML(i, "plot")}</a>`).join("");
    g.querySelectorAll("[data-idea]").forEach((a) => a.addEventListener("click", () => { showIdea = a.dataset.idea; if (location.hash === "#ideas") showIdeas(); }));
    placeGarden();
  }
  let showIdea = "";
  function placeGarden() {
    const g = $("rm-garden"), nav = document.querySelector("#site-header nav");
    if (!g) return;
    const G = typeof GRID_SIZE === "number" ? GRID_SIZE : 28;
    if (window.innerWidth < 760 || !nav) { g.classList.remove("side"); return; }
    const r = nav.getBoundingClientRect();
    const top = Math.ceil((r.bottom + G / 2) / G) * G;
    const cols = Math.max(1, Math.floor((Math.min(r.right, window.innerWidth) - G) / (2 * G)));
    g.classList.add("side");
    g.style.setProperty("--g", G + "px");
    g.style.setProperty("--top", top + "px");
    g.style.setProperty("--cols", cols);
  }
  window.addEventListener("resize", placeGarden);

  /* ============================================================
     IDEAS (the idea board)
     ============================================================ */

  const IDEA_STATES = ["seed", "sketching", "making", "done"];

  // flower colors to choose from: the usual petals, plus the newest colors in your bank
  function flowerChoices() {
    const fromBank = [...new Set(colors.slice().reverse().map((c) => c.hex))].slice(0, 8);
    return [...new Set(PETALS.concat(fromBank))];
  }

  function showIdeas() {
    const v = $("rm-view");
    v.innerHTML = `
      <p class="rm-intro">one card per idea: a drawing, a website, anything. every idea starts as a seed. connect it to a list from <a href="#order">order of operations</a>: each step you check off waters it until it flowers. pin reference pictures from any picture's panel, and colors from the color bank.</p>
      <button type="button" class="rm-btn" id="rm-newidea">+ plant a new idea</button>
      <div class="rm-ideas">${ideas.slice().reverse().map((i) => {
        const pl = plantOf(i);
        return `
        <div class="rm-idea${pl.stage === 6 ? " harvested" : ""}" data-id="${i.id}">
          <div class="rm-ihead">${plantHTML(i)}<div>
            <input class="rm-ititle" value="${esc(i.title)}" placeholder="working title">
            <p class="rm-why rm-iline">${plantLine(i)}</p>
            ${pl.stage === 5 ? `<button type="button" class="rm-btn" data-harvest="1">harvest it</button>` : ""}
            ${pl.stage === 6 ? `<a href="#blog" data-postit="1">post it on your blog →</a>` : ""}
          </div></div>
          <div class="rm-states">${IDEA_STATES.map((s) => `<button type="button" data-s="${s}" class="${i.status === s ? "on" : ""}">${s}</button>`).join("")}</div>
          <div class="rm-icolors"><span class="rm-why">flower</span>${flowerChoices().map((h) => `<button type="button" data-petal="${esc(h)}" style="--c:${esc(h)}" class="${petalOf(i) === h ? "on" : ""}" title="${esc(h)}"></button>`).join("")}</div>
          <textarea class="rm-inotes" rows="4" placeholder="size, materials, colors, the feeling, what it's in conversation with…">${esc(i.notes)}</textarea>
          <div class="rm-ilinks">
            <select class="rm-ilist" aria-label="order of operations list"><option value="">connect a list…</option>${lists.map((l) => `<option value="${l.id}"${i.list === l.id ? " selected" : ""}>${esc(l.name || "untitled list")}</option>`).join("")}<option value="new">+ a new list for this idea</option></select>
            <select class="rm-icombo" aria-label="color combination"><option value="">connect colors…</option>${combos.map((c) => `<option value="${c.id}"${i.combo === c.id ? " selected" : ""}>${esc(c.name || "untitled colors")}</option>`).join("")}</select>
          </div>
          ${ideaLinks(i)}
          <div class="rm-refs">${i.refs.map((id) => { const w = savedWork(id); return w ? `<button type="button" class="rm-ref" data-ref="${esc(id)}" title="${esc(w.title)}, ${esc(w.artist)}">${w.thumb ? `<img src="${esc(w.thumb)}" alt="" referrerpolicy="no-referrer">` : `<span class="rm-pencil"></span>`}</button>` : ""; }).join("") || `<span class="rm-why">no references pinned yet</span>`}</div>
          <button type="button" class="rm-del" data-del="${i.id}">delete idea</button>
        </div>`; }).join("")}</div>`;

    $("rm-newidea").addEventListener("click", () => {
      ideas.push({ id: uid(), title: "", notes: "", status: "seed", refs: [], planted: today(), watered: Date.now() }); saveAll(); showIdeas();
      const first = v.querySelector(".rm-ititle"); if (first) first.focus();
    });
    v.querySelectorAll(".rm-idea").forEach((card) => {
      const i = ideas.find((x) => x.id === card.dataset.id);
      card.querySelector(".rm-ititle").addEventListener("input", (e) => { i.title = e.target.value; saveAll(); });
      card.querySelector(".rm-inotes").addEventListener("input", (e) => { i.notes = e.target.value; saveAll(); });
      card.querySelector(".rm-ilist").addEventListener("change", (e) => {
        if (e.target.value === "new") {
          const l = { id: uid(), name: i.title || "new idea", items: [] };
          lists.unshift(l); i.list = l.id; i.watered = Date.now(); saveAll(); location.hash = "#order"; return;
        }
        i.list = e.target.value; i.watered = Date.now(); saveAll(); showIdeas();
      });
      card.querySelector(".rm-icombo").addEventListener("change", (e) => { i.combo = e.target.value; saveAll(); showIdeas(); });
      card.querySelectorAll(".rm-states button").forEach((b) => b.addEventListener("click", () => {
        i.status = b.dataset.s; saveAll();
        card.querySelectorAll(".rm-states button").forEach((x) => x.classList.toggle("on", x === b));
      }));
      card.querySelectorAll("[data-petal]").forEach((b) => b.addEventListener("click", () => { i.color = b.dataset.petal; saveAll(); showIdeas(); }));
      const pi = card.querySelector("[data-postit]");
      if (pi) pi.addEventListener("click", () => { store.set("postDraft", { title: i.title || "", text: i.notes || "", ideaId: i.id }); });
      const hv = card.querySelector("[data-harvest]");
      if (hv) hv.addEventListener("click", () => { i.harvested = today(); i.status = "done"; saveAll(); showIdeas(); });
      card.querySelectorAll(".rm-ref").forEach((b) => b.addEventListener("click", () => openPanel(savedWork(b.dataset.ref))));
      const del = card.querySelector(".rm-del");
      del.addEventListener("click", () => {
        if (!confirmTwice(del)) return;
        ideas = ideas.filter((x) => x.id !== i.id); saveAll(); showIdeas();
      });
    });
    // came from a flower in the garden: go to its card
    if (showIdea) {
      const card = v.querySelector(`.rm-idea[data-id="${CSS.escape(showIdea)}"]`);
      showIdea = "";
      if (card) { card.scrollIntoView({ block: "center" }); card.classList.add("lit"); setTimeout(() => card.classList.remove("lit"), 1600); }
    }
  }

  /* (the progress tracker and notes pages are put away for now: their saved data
     (goals, notes) is still kept and still goes in backups.) */

  const IG_HANDLES = ["projectgallery", "triiinity.lester"];

  async function openFollowers() {
    let pop = $("rm-igpop");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "rm-igpop"; pop.className = "rm-igpop";
      document.body.appendChild(pop);
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") pop.hidden = true; });
    }
    const draw = (rows, note) => {
      pop.innerHTML = `<button type="button" class="rm-x" aria-label="close">×</button>
        ${rows.map((a) => `<div class="rm-igrow"><a href="https://instagram.com/${esc(a.handle)}" target="_blank" rel="noopener">@${esc(a.handle)}</a>
          <b>${a.followers != null ? Number(a.followers).toLocaleString("en-US") : a.loading ? "…" : "–"}</b>${a.followers != null ? `<span class="rm-why">followers</span>` : a.error ? `<span class="rm-why">${esc(a.error)}</span>` : ""}</div>`).join("")}
        <p class="rm-why">${note}</p>
        <button type="button" class="rm-why" id="rm-igagain">refresh</button>`;
      pop.hidden = false;
      pop.querySelector(".rm-x").addEventListener("click", () => { pop.hidden = true; });
      pop.querySelector("#rm-igagain").addEventListener("click", openFollowers);
    };
    draw(IG_HANDLES.map((h) => ({ handle: h, loading: true })), "checking…");
    try {
      const r = await fetch("/api/followers", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      const t = new Date(j.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
      draw(j.accounts, j.accounts.some((a) => a.error) ? `as of ${t} · see INSTAGRAM-SETUP.md for the one-time setup` : `live, as of ${t}`);
    } catch (e) {
      draw(IG_HANDLES.map((h) => ({ handle: h, error: "not set up yet" })), "the follower counter works once the site is on Cloudflare with your instagram keys (INSTAGRAM-SETUP.md).");
    }
  }

  gardenReady = true;
  route();
})();
