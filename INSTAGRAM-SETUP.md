# follower counts: one-time setup

Instagram doesn't let websites read follower counts anonymously anymore (those requests get refused,
and scraping is against its rules). The official way works for **professional** accounts (business or
creator) and needs one sign-in per account to make a key. After that the pop-up just works.

Secret pop-up: **profile → click "right now" three times.**

## 1. make sure both accounts are professional
Instagram app → profile → ☰ → **Account type and tools** → switch to professional (creator or business).
Do this for @projectgallery and @triiinity.lester. It's free and nothing about your posts changes.

## 2. make a Meta developer app (once)
1. Go to **developers.facebook.com** → log in → **My Apps** → **Create app**.
2. Pick the use case for managing messaging and content on Instagram (the Instagram API one).
3. In the app, open **Instagram → API setup with Instagram business login**.

## 3. make a key for each account
1. Under **Generate access tokens**, click **Add account** and log in to @projectgallery.
2. Click **Generate token** next to it. Copy the long token.
3. Do the same for @triiinity.lester.

These keys last 60 days (step 5 makes them renew themselves).

## 4. give the keys to Cloudflare
Cloudflare → **Workers & Pages** → **mind-palace** → **Settings** → **Variables and Secrets** → **Add**:
- type **Secret**, name `IG_TOKEN_PROJECTGALLERY`, value = the @projectgallery key
- type **Secret**, name `IG_TOKEN_TRIIINITY`, value = the @triiinity.lester key

Save. Then triple-click "right now" on your profile: the counts appear.

## 5. (optional) make the keys renew themselves
Without this, make new keys every ~2 months (step 3 + 4 again; the pop-up says when one runs out).
1. Cloudflare → **Storage & Databases → KV** → **Create** → name it `ig-keys`. Copy its **ID**.
2. Tell Claude the ID. It adds it to `wrangler.jsonc` and every Monday the site renews both keys.
