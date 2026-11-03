/* ============================================================
   WORKER.JS — the little bit of the site that runs on Cloudflare.
   Everything else is plain files; this only answers one address:

     /api/followers   the follower counts of your Instagram accounts,
                      read with Instagram's official API
     /api/room/CODE   a room saved online under its save code
                      (GET opens it, PUT saves it)

   The keys (access tokens) live in Cloudflare as secrets, never in
   these files. Setup steps: INSTAGRAM-SETUP.md.
   ============================================================ */

// your accounts: the handle, and the name of the Cloudflare secret holding its token
const ACCOUNTS = [
  { handle: "projectgallery", secret: "IG_TOKEN_PROJECTGALLERY" },
  { handle: "triiinity.lester", secret: "IG_TOKEN_TRIIINITY" }
];

const API = "https://graph.instagram.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/followers") return followers(env);
    if (url.pathname.startsWith("/api/room/")) return room(request, env, decodeURIComponent(url.pathname.slice(10)));
    return env.ASSETS.fetch(request);           // every other address: the site's files
  },

  // once a week: renew each token so it doesn't run out after 60 days
  // (kept in the site's storage space, KV)
  async scheduled(event, env) {
    if (!env.KV) return;
    for (const a of ACCOUNTS) {
      const token = await tokenFor(a, env);
      if (!token) continue;
      try {
        const r = await fetch(`${API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
        const j = await r.json();
        if (j.access_token) await env.KV.put("ig:" + a.secret, j.access_token);
      } catch (e) { /* try again next week */ }
    }
  }
};

async function tokenFor(a, env) {
  return (env.KV && await env.KV.get("ig:" + a.secret)) || env[a.secret] || "";
}

async function followers(env) {
  const out = await Promise.all(ACCOUNTS.map(async (a) => {
    const token = await tokenFor(a, env);
    if (!token) return { handle: a.handle, error: "not connected yet" };
    try {
      const r = await fetch(`${API}/me?fields=username,followers_count&access_token=${encodeURIComponent(token)}`);
      const j = await r.json();
      if (j.error) return { handle: a.handle, error: j.error.code === 190 ? "the key ran out: make a new one" : "instagram said no" };
      return { handle: j.username || a.handle, followers: j.followers_count };
    } catch (e) {
      return { handle: a.handle, error: "couldn't reach instagram" };
    }
  }));
  return new Response(JSON.stringify({ at: new Date().toISOString(), accounts: out }), {
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" }
  });
}

/* ---------- rooms saved under a code ----------
   The code (like trinity-k3x9qa) is the only key, so it has a random part
   nobody could guess. Rooms are kept in the site's storage space (KV),
   which Cloudflare creates by itself the first time the site deploys. */

const CODE = /^[a-z0-9]{1,16}-[a-z0-9]{6,12}$/;
const MAX = 20 * 1024 * 1024;     // 20 MB per room (pictures you upload make it bigger)

async function room(request, env, code) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" } });
  if (!CODE.test(code)) return json({ error: "that isn't a save code" }, 400);
  if (!env.KV) return json({ error: "online saving isn't switched on" }, 503);
  const key = "room:" + code;
  if (request.method === "GET") {
    const data = await env.KV.get(key);
    return data ? new Response(data, { headers: { "content-type": "application/json", "cache-control": "no-store" } }) : json({ error: "no room with that code" }, 404);
  }
  if (request.method === "PUT") {
    const text = await request.text();
    if (text.length > MAX) return json({ error: "too big" }, 413);
    try { if (!JSON.parse(text).room) throw 0; } catch (e) { return json({ error: "not a room" }, 400); }
    await env.KV.put(key, text);
    return json({ saved: new Date().toISOString() });
  }
  return json({ error: "no" }, 405);
}
