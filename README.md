# mind palace

A research room for artists and curious people, in four steps of making something:

1. **remembering** — inspiration list, word web, other artists (explore, lineages), pure art, real image search
2. **engaging** — image feed, split screen, color picker, obliterate
3. **creating** — color bank, color machine, idea board, order of operations, commissions
4. **sharing** — what did you make (your room's name, now listening / watching / reading, progress posts)

It points people off the site toward real things: museum collections, official sites and foundations,
Wikipedia, and credited real photographs instead of AI-generated image search results.

## the files
- `index.html` — the page (the opening page is the wall of everything you've gathered)
- `room.js` — every page of the room
- `room-data.js` — starting lists in plain text: artists, lineages, nature words, your room's name, "now" list, starting lists, inspiration prompts
- `room.css` — the room's look; `style.css` — the base look (copied from the portfolio, change freely)
- `base.js` — the + at the top, the left menu, the picture viewer, and `PORTFOLIO` (where your own 2026 work is read from)
- `wrangler.jsonc` — tells Cloudflare to serve this folder

Everything added on the page is saved in the browser you used. "backup" / "restore" at the bottom of 2 · image feed moves it between computers.

## on Cloudflare
Workers & Pages → Create → Import a repository → `mind-palace` → Deploy. Every push to GitHub redeploys.
Live at https://mind-palace.trinityl-lester.workers.dev until it has its own domain.

See CHECKLIST.md for what's next.
