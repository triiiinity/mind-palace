/* ============================================================
   STAR.JS — the little star in the bottom-right square of the
   home page. Click it for today's horoscope.

   No AI and no horoscope website: it works out where the Sun,
   Moon and planets really are today (astronomy-engine, in
   vendor/astronomy/), compares them with where they were when
   you were born, and puts together a reading from the strongest
   connections (aspects). Your birth details stay in this browser
   only; they aren't in backups or online saving.

   The words for each sign, planet, aspect, moon phase and house
   are in the lists below: change them to sound more like you.
   ============================================================ */

(function () {
  const A = window.Astronomy;
  if (!A) return;

  /* ---------- the words ---------- */

  const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
  const GLYPH = ["♈︎", "♉︎", "♊︎", "♋︎", "♌︎", "♍︎", "♎︎", "♏︎", "♐︎", "♑︎", "♒︎", "♓︎"];
  // the moon passes through a sign every two or three days: the day's weather
  const MOON_IN = {
    aries: "quick starts. begin the thing instead of planning it.",
    taurus: "slow and physical. good for materials, texture, staying put.",
    gemini: "restless and curious. read, talk, make lots of small sketches.",
    cancer: "tender and homeward. work close to home and to memory.",
    leo: "warm and a little showy. make something you'd want people to see.",
    virgo: "precise. tidy the studio, fix the details, finish a list.",
    libra: "balance and pairs. good for arranging, color, other people.",
    scorpio: "deep and private. go further into one thing.",
    sagittarius: "wide open. look far, try the big idea.",
    capricorn: "structure. grids, schedules, the long patient work.",
    aquarius: "strange and new. break one of your own rules.",
    pisces: "dreamy and porous. let edges blur; rest counts as work."
  };
  const PHASES = [
    ["new moon", "plant something: a word, a sketch, an intention."],
    ["waxing crescent", "first small steps. don't judge it yet."],
    ["first quarter", "a decision point. pick a direction and push."],
    ["waxing gibbous", "refine. adjust what's almost there."],
    ["full moon", "things come to light. show the work."],
    ["waning gibbous", "share what you learned; teach it back."],
    ["last quarter", "let go of what isn't working."],
    ["waning crescent", "rest and clear the table for what's next."]
  ];
  const HOUSES = ["you: your body, your look, how you start things", "money, materials, what you value", "writing, errands, neighbors, small trips",
    "home and family", "play, romance, making things for joy", "routines, health, the work itself", "partners and collaborators",
    "the private, the shared, the deep", "learning, travel, big ideas", "career and your public work", "friends, community, the future",
    "solitude, rest, the hidden"];
  const BODIES = [
    { key: "Sun", name: "the sun", your: "your sun", theme: "sense of self", orb: 3 },
    { key: "Moon", name: "the moon", your: "your moon", theme: "feelings", orb: 5 },
    { key: "Mercury", name: "mercury", your: "your mercury", theme: "thinking and words", orb: 2.5 },
    { key: "Venus", name: "venus", your: "your venus", theme: "taste, beauty and love", orb: 2.5 },
    { key: "Mars", name: "mars", your: "your mars", theme: "drive and nerve", orb: 2.5 },
    { key: "Jupiter", name: "jupiter", your: "your jupiter", theme: "luck and growth", orb: 2 },
    { key: "Saturn", name: "saturn", your: "your saturn", theme: "discipline and limits", orb: 2 }
  ];
  const ASPECTS = [
    { deg: 0, name: "meets", word: "intense", tone: "runs straight into", advice: "it's loud today: use it." },
    { deg: 60, name: "sextile", word: "open", tone: "opens a small door for", advice: "say yes to the small chance." },
    { deg: 90, name: "squares", word: "push", tone: "puts pressure on", advice: "friction is useful: push through one hard part." },
    { deg: 120, name: "trines", word: "easy", tone: "flows easily into", advice: "an easy day for this. don't waste it." },
    { deg: 180, name: "opposes", word: "balance", tone: "pulls against", advice: "find the middle; someone may mirror it back to you." }
  ];

  /* ---------- the sky ---------- */

  const norm = (x) => ((x % 360) + 360) % 360;
  const lonOf = (key, d) => key === "Moon" ? A.EclipticGeoMoon(d).lon : key === "Sun" ? A.SunPosition(d).elon : A.Ecliptic(A.GeoVector(key, d, true)).elon;
  const signOf = (lon) => Math.floor(norm(lon) / 30);
  const degIn = (lon) => Math.floor(norm(lon) % 30);

  // the rising sign: needs the birth time and place
  function ascendant(d, lat, lonE) {
    const T = (d - Date.UTC(2000, 0, 1, 12)) / (36525 * 864e5);
    const eps = (23.439291 - 0.0130042 * T) * Math.PI / 180;
    const ramc = norm(A.SiderealTime(d) * 15 + lonE) * Math.PI / 180, phi = lat * Math.PI / 180;
    return norm(Math.atan2(-Math.cos(ramc), Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps)) * 180 / Math.PI + 180);
  }

  // a time at the birthplace, in its own time zone (summer time included), as a real moment
  function tzOffsetMin(date, tz) {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date);
    const g = (k) => +p.find((x) => x.type === k).value;
    return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - date.getTime()) / 60000;
  }
  function zonedToUtc(dateStr, timeStr, tz) {
    const [y, mo, d] = dateStr.split("-").map(Number), [h, mi] = (timeStr || "12:00").split(":").map(Number);
    const wall = Date.UTC(y, mo - 1, d, h, mi);
    if (!tz) return new Date(wall);
    let guess = wall;
    for (let k = 0; k < 3; k++) guess = wall - tzOffsetMin(new Date(guess), tz) * 60000;
    return new Date(guess);
  }

  function chartOf(b) {
    const when = zonedToUtc(b.date, b.time, b.place && b.place.tz);
    const pos = {};
    BODIES.forEach((x) => { pos[x.key] = lonOf(x.key, when); });
    if (b.time && b.place) pos.ASC = ascendant(when, b.place.lat, b.place.lon);
    return pos;
  }

  function reading(b, now = new Date()) {
    const natal = chartOf(b);
    const sky = {}; BODIES.forEach((x) => { sky[x.key] = lonOf(x.key, now); });
    const phaseAngle = A.MoonPhase(now);
    const phase = PHASES[Math.floor(norm(phaseAngle + 22.5) / 45) % 8];
    const moonSign = signOf(sky.Moon);
    const house = natal.ASC != null ? ((moonSign - signOf(natal.ASC) + 12) % 12) : null;   // whole-sign houses
    // every connection between today's sky and your chart, tightest first (slow planets matter more)
    const hits = [];
    BODIES.forEach((t) => {
      BODIES.concat(natal.ASC != null ? [{ key: "ASC", your: "your rising", theme: "how you come across" }] : []).forEach((n) => {
        if (natal[n.key] == null) return;
        let sep = Math.abs(norm(sky[t.key] - natal[n.key])); if (sep > 180) sep = 360 - sep;
        ASPECTS.forEach((a) => {
          const off = Math.abs(sep - a.deg);
          if (off <= t.orb) hits.push({ t, n, a, off, score: (t.orb - off) / t.orb + (t.key === "Moon" ? 0.2 : ["Jupiter", "Saturn", "Mars"].includes(t.key) ? 0.35 : 0) });
        });
      });
    });
    hits.sort((x, y) => y.score - x.score);
    const top = hits.slice(0, 4);
    return {
      you: `${SIGNS[signOf(natal.Sun)]} sun · ${SIGNS[signOf(natal.Moon)]} moon${natal.ASC != null ? ` · ${SIGNS[signOf(natal.ASC)]} rising` : ""}`,
      word: top[0] ? top[0].a.word : "quiet",
      moon: { sign: SIGNS[moonSign], glyph: GLYPH[moonSign], deg: degIn(sky.Moon), text: MOON_IN[SIGNS[moonSign]], house: house != null ? { n: house + 1, text: HOUSES[house] } : null },
      phase: { name: phase[0], text: phase[1] },
      lines: top.map((h) => ({
        head: `${h.t.name} ${h.a.name} ${h.n.your}`,
        text: `today's ${h.t.theme} ${h.a.tone} your ${h.n.theme}. ${h.a.advice}`,
        exact: h.off < 1
      })),
      sun: { sign: SIGNS[signOf(sky.Sun)], deg: degIn(sky.Sun) }
    };
  }
  window.STAR_READING = reading;     // (so it can be checked)

  /* ---------- the star and its pop-up ---------- */

  const KEY = "room:birth";            // only in this browser
  const get = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const set = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const star = document.createElement("button");
  star.type = "button"; star.className = "rm-star"; star.setAttribute("aria-label", "today's horoscope"); star.title = "today's horoscope";
  star.textContent = "*";
  const pop = document.createElement("div");
  pop.className = "rm-starpop"; pop.hidden = true;
  document.body.append(star, pop);

  // sits in one grid square, two squares in from the bottom-right corner
  function place() {
    const G = typeof GRID_SIZE === "number" ? GRID_SIZE : 28;
    const page = decodeURIComponent(location.hash.slice(1)) || "home";
    star.hidden = page !== "home";
    if (star.hidden) { pop.hidden = true; return; }
    star.style.left = (Math.floor(window.innerWidth / G) - 2) * G + 1 + "px";
    star.style.top = (Math.floor(window.innerHeight / G) - 2) * G + 1 + "px";
    star.style.width = star.style.height = G - 1 + "px";
  }
  window.addEventListener("resize", place);
  window.addEventListener("hashchange", place);
  place();

  star.addEventListener("click", () => { if (pop.hidden) { pop.hidden = false; draw(); } else pop.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") pop.hidden = true; });

  function draw() {
    const b = get();
    if (!b || !b.date) return drawForm(b || {});
    let r;
    try { r = reading(b); } catch (e) { return drawForm(b, "something in your birth details didn't work. check them?"); }
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toLowerCase();
    pop.innerHTML = `
      <button type="button" class="rm-x" aria-label="close">×</button>
      <p class="rm-why">${esc(today)}</p>
      <h3>today: ${esc(r.word)}</h3>
      <p class="rm-why">${esc(r.you)}</p>
      <div class="rm-sblock"><b>${r.moon.glyph} the moon is in ${esc(r.moon.sign)}</b>${r.moon.house ? ` <span class="rm-why">(your ${ordinal(r.moon.house.n)} house: ${esc(r.moon.house.text)})</span>` : ""}<br>${esc(r.moon.text)}</div>
      <div class="rm-sblock"><b>${esc(r.phase.name)}</b><br>${esc(r.phase.text)}</div>
      ${r.lines.length ? r.lines.map((l) => `<div class="rm-sblock"><b>${esc(l.head)}</b>${l.exact ? ` <span class="rm-why">very close</span>` : ""}<br>${esc(l.text)}</div>`).join("") : `<div class="rm-sblock">no strong connections today: a quiet sky. a good day to just work.</div>`}
      <p class="rm-why rm-sfoot">worked out from where the planets really are today and where they were when you were born. <button type="button" class="rm-why" id="rm-sedit">change birth details</button></p>`;
    pop.querySelector(".rm-x").addEventListener("click", () => { pop.hidden = true; });
    pop.querySelector("#rm-sedit").addEventListener("click", () => drawForm(b));
  }
  const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

  function drawForm(b, msg) {
    pop.innerHTML = `
      <button type="button" class="rm-x" aria-label="close">×</button>
      <h3>your birth chart</h3>
      <p class="rm-why">once, and only in this browser. the time and place are for your rising sign and houses; leave them out and you still get a reading.</p>
      <form id="rm-sform" autocomplete="off">
        <label>birthday <input type="date" name="date" value="${esc(b.date || "")}" required></label>
        <label>time <input type="time" name="time" value="${esc(b.time || "")}"></label>
        <label>place <input name="place" value="${esc(b.place ? b.place.label : "")}" placeholder="city"></label>
        <ul class="rm-splaces" id="rm-splaces"></ul>
        <p class="rm-row"><button type="submit" class="rm-btn">read the sky</button> <span class="rm-status" id="rm-sst">${esc(msg || "")}</span></p>
      </form>`;
    pop.querySelector(".rm-x").addEventListener("click", () => { pop.hidden = true; });
    const f = pop.querySelector("#rm-sform"), list = pop.querySelector("#rm-splaces"), st = pop.querySelector("#rm-sst");
    let place = b.place || null, timer;
    // find the city (its time zone too, for the right birth hour)
    f.place.addEventListener("input", () => {
      place = null; clearTimeout(timer);
      const q = f.place.value.trim();
      if (q.length < 2) { list.innerHTML = ""; return; }
      timer = setTimeout(async () => {
        try {
          const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`);
          const j = await r.json();
          const res = (j.results || []);
          list.innerHTML = res.map((p, i) => `<li><button type="button" data-i="${i}">${esc(p.name)}<span class="rm-why">${esc([p.admin1, p.country].filter(Boolean).join(", "))}</span></button></li>`).join("");
          list.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => {
            const p = res[+btn.dataset.i];
            place = { label: [p.name, p.admin1, p.country].filter(Boolean).join(", "), lat: p.latitude, lon: p.longitude, tz: p.timezone };
            f.place.value = place.label; list.innerHTML = "";
          }));
        } catch (e) { list.innerHTML = `<li class="rm-why">couldn't look up places right now</li>`; }
      }, 300);
    });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      if (f.place.value.trim() && !place) { st.textContent = "pick your city from the list"; return; }
      set({ date: f.date.value, time: f.time.value, place: f.place.value.trim() ? place : null });
      draw();
    });
  }
})();
