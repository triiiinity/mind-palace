/* ============================================================
   WORKER.JS — the little bit of the site that runs on Cloudflare.
   Everything else is plain files; this only answers one address:

     /api/followers   the follower counts of your Instagram accounts,
                      read with Instagram's official API

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
    return env.ASSETS.fetch(request);           // every other address: the site's files
  },

  // once a week: renew each token so it doesn't run out after 60 days
  // (only kept if a KV storage space called IG_KV is connected; see INSTAGRAM-SETUP.md)
  async scheduled(event, env) {
    if (!env.IG_KV) return;
    for (const a of ACCOUNTS) {
      const token = await tokenFor(a, env);
      if (!token) continue;
      try {
        const r = await fetch(`${API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
        const j = await r.json();
        if (j.access_token) await env.IG_KV.put(a.secret, j.access_token);
      } catch (e) { /* try again next week */ }
    }
  }
};

async function tokenFor(a, env) {
  return (env.IG_KV && await env.IG_KV.get(a.secret)) || env[a.secret] || "";
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
