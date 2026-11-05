# + (the plus platform, working name mind palace)

A research room for artists and curious people, in four steps of making something.
The menu runs down the left column:

1. **remembering** — inspiration list, images (one search bar: artists from any time, places, things; one feed of real art + real photographs, built from your inspiration list), library (your PDFs, read two pages at a time)
2. **collecting** — color picker, splitscreen (art next to the world; pick colors, or pixelate / blur / burn / smear / pour / scratch a photograph or your own work, never someone else's art)
3. **creating** — color bank (every color in its own grid square), idea board (white cards; pick each flower's color), order of operations
4. **posting** — profile: your save code and a box to post to your room. "see your room as a visitor" previews the archive other people would see.

A little line at the bottom of each page walks the whole way through, start to finish.
The garden lives in the left column under the menu: every idea is a flower exactly 2 x 2 grid squares.

Every idea on the idea board is an ascii plant: connect it to a list on order of operations and each
step checked off waters it (seed → sprout → seedling → bud → flower → ready to harvest). Forgotten
ideas get thirsty and shrink. The plants follow you along the bottom of every page.

The grid is the theme: click any empty white space and it shows through. The cursor drops gray plus signs.

It points people off the site toward real things: museum collections, official sites and foundations,
Wikipedia, and credited real photographs instead of AI-generated image search results.

## the files
- `index.html` — the page (the opening page is the wall of everything you've gathered)
- `room.js` — every page of the room
- `room-data.js` — starting lists in plain text: artists, lineages, nature words, your room's name, "now" list, starting lists, inspiration prompts
- `room.css` — the room's look; `style.css` — the base look (copied from the portfolio, change freely)
- `base.js` — the + at the top, the left menu (MENU), the grid on click (GRID_SIZE), the plus cursor (PLUS_CURSOR), the picture viewer, and `PORTFOLIO` (where your own work on the profile comes from)
- `vendor/pdfjs/` — the PDF reader (pdf.js 4.10, Mozilla, Apache license), kept here so the library doesn't depend on another site
- `wrangler.jsonc` — tells Cloudflare to serve this folder

Everything added on the page is saved in the browser you used. "backup" / "restore" at the bottom of the image feed moves it between computers.

## on Cloudflare
Workers & Pages → Create → Import a repository → `mind-palace` → Deploy. Every push to GitHub redeploys.
Live at https://mind-palace.trinityl-lester.workers.dev until it has its own domain.

See CHECKLIST.md for what's next.
