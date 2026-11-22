# Changelog

Versions follow [semver](https://semver.org/): fixes → patch, new features → minor,
changes that break things for users → major. Each release is a git tag `vX.Y.Z` on `main`.

## Planned (not started)

- **Payments via Stripe**: the data model is ready (v1.6.0); steps are in CLAUDE.md → "Подключение Stripe".

## v2.0.0 — 2026-11-22

- **My language:** English, Русский or Español, chosen at sign-up. It is the language of the interface and of your records; an English copy of every record is filled in the background. Spanish is new (whole interface, help, AI, default categories).
- **Show English next to it** (Settings → Language): edit both your language and English, as the old "Russian + English" mode did. Existing accounts keep how they worked: Russian + English stays on, English stays English.
- **Changing the language** only in Settings → Language, with a warning and an offer to translate your records with the cost in AI requests ("11 records ≈ 1 request"). Records not in your language are shown in English until translated; "Not in your language: N" with Translate.
- Search (typed, smart, voice) finds by your language and English; accents do not matter (`camara` finds `cámara`).
- AI answers in your language + English; you can speak in your language or in English. Books: the title as printed, plus the English title when known.
- Before sign-in: the browser's language if supported, else English; a small EN / RU / ES switch on the sign-in screens and in the help.
- Plan names and emails in the user's language.
- Database: record language and own-language text next to English (old columns kept in sync for now; removed later by a separate migration).
- Help updated (RU, EN, ES): "Languages" rewritten, "Getting started" and "Items and search" updated.

## v1.11.0 — 2026-11-21

- **"?" on every screen:** a small help icon in the header (and on the sign-in and "awaiting approval" screens) opens the help over the current screen, right on the matching section: Add → "Add an item", Items and Search → "Items and search", selection mode → "Many items at once", "Several items", a book → "Books", Places → "Places and I'm here", Settings → "Account", with their own "?" for data languages and plan.
- Nothing on the screen is lost: a half-filled item, a selection, filters and scroll stay. Close with the arrow, Android Back, the back gesture or Escape.
- Header: a long "I'm here" name is cut with "…" so the icons always fit.
- Help updated: "Getting started" says the help opens with "?" on any screen.

## v1.10.2 — 2026-11-21

- **Help updated:** /help rewritten for the current version, by what you want to do — getting started, adding items, several items, voice, places and "I'm here", items and search, books, many items at once, data languages, plan and AI requests, account. Added what was missing (main photo and "Recognize again", photo privacy, creating places by voice, item actions, offline, what uses AI requests, data language modes, sign out, deleting the account). Sections open and close; "Expand all".
- Release rule: every change users can see updates /help in the same branch.

## v1.10.1 — 2026-11-21

- **Fix:** when Google Books had no cover, its "image not available" placeholder was offered as the book cover (and preselected as the main photo after a barcode). Google covers are JPEG; the placeholder (a PNG) is now refused, and a real Open Library cover is used instead when there is one.
- Covers: Google's cover is also looked up directly by ISBN, which often gives a much bigger picture.

## v1.10.0 — 2026-11-21

- **Book covers:** when a book is found by its ISBN, the biggest cover from Google Books or Open Library is offered — "Make it the main photo" (preselected after a barcode or when the item has no photos), "Add as the second photo" or "Not needed" (preselected when you photographed the cover yourself). "Find cover" for saved books. No AI request; the cover is saved only with the item, like any photo.
- **Scan ISBN** in the Book block: photograph the back cover or the copyright page — the barcode is read on the phone, without one the AI reads the printed number (one request); several numbers — you choose. The photo is not saved.
- A typed ISBN is checked as soon as you leave the field.

## v1.9.0 — 2026-11-21

- **Bulk edit:** select items in Items (gallery or table) or in Search results — "Select" or a long press. "Select all found" takes every item of the current filters (not only those loaded on screen), up to 500; in Search, all results.
- Actions at the bottom: **Category** (with "Create"), **Move** ("I'm here" first, the place tree or voice), **Delete** (with photos, after confirmation) and **Categorize**: the AI reads only the items' texts (no photos, 50 items per request), shows "was → will be" with new categories to create, and applies only what you confirm.
- For 10 seconds after a change, **Undo** gives every item its previous value back (deleting cannot be undone).
- Database: AI usage kind `categorize`.

## v1.8.1 — 2026-11-21

- **Russian books by ISBN:** for Russian-language ISBN groups (978-5, 978-985, 978-966, 978-601) Google Books now answers first and Open Library only fills missing fields — Open Library often had wrong authors or transliterated titles for them. Other books keep Open Library first.
- The server log of a failed catalogue lookup shows the HTTP status (no address, no key).

## v1.8.0 — 2026-11-21

- **Books:** a photo of a cover fills in the title (as printed, not translated), author, and the year and ISBN if visible. A shelf of books in "Several items in one photo" gives a card per book, read from the spines.
- **ISBN barcode:** a photo of the back cover is read on the phone; the book is looked up in Open Library, missing fields from Google Books. No AI request is spent; "Recognize from photo" stays available.
- Books go to a "Books" category; if there is none, the app offers to create it.
- Author, year and ISBN on items (one value, any data language mode): shown as "Author · year" in the item card, gallery and table; search finds authors and ISBNs (with or without hyphens).
- Database: new nullable book columns, a new search column and search_items_v2 (the old search stays for rollback).

## v1.7.0 — 2026-11-20

- **Admin in sections:** /admin opens two cards — Users (count, red badge of accounts awaiting approval) and Plans (count). "Back" goes from a section to /admin, from /admin to Settings.
- **Users** (/admin/users): search by email while typing, filters by status and plan, sorting (newest, oldest, email, most items, most AI in 24 h, recently signed in; pending always on top), pages of 50 picked in the database. Compact rows on phones open into the full card with the actions; wide screens show more columns.
- **Plans** (/admin/plans): names, limits, order by arrows, how many users are on each plan; add a plan; delete a plan only when nobody is linked to it (never "free").
- The admin email about a new registration links straight to the accounts awaiting approval.
- Database: new admin functions only (admin_list_users_v3, admin_overview, admin_plan_stats, admin_create_plan, admin_delete_plan, admin_reorder_plans).

## v1.6.1 — 2026-11-20

- **Faster Items list:** a loading skeleton appears at once on every screen; the list loads more items by itself while scrolling (instead of "Show more" re-sending the whole list: 102 KB instead of 400 KB for 186 items); thumbnails come from the phone's cache on the next visit (signed photo URLs are reused); off-screen cards are not drawn. "Back" from an item far down restores the whole list and the position.
- Vercel functions pinned to the same region as the database (iad1 / us-east-1).

## v1.6.0 — 2026-11-20

- **Plans:** free (200 items, 20 AI requests a day), plus (500/100), pro (1000/300), unlimited (no item limit, 1000 AI). Names and limits are edited in /admin → Plans and apply at once.
- The administrator assigns a plan per user, optionally until a date (then back to free). The data model is ready for paid subscriptions (Stripe) with the admin's plan taking priority; the payment itself is not connected yet.
- At the item limit new items and every AI feature are off (with a clear message); browsing, editing, plain search and deleting work. "Several items" saves what fits and says how many did not. A lower plan deletes nothing.
- Settings show the plan: items of the limit, AI requests in 24 hours, a warning from 90%.
- Database: plans table, plan fields in profiles, effective_plan(); the item limit is enforced by the database itself (deferred step applied after deploy).

## v1.5.0 — 2026-11-20

- **Back button:** a "←" arrow in the header of inner screens (item, edit, place, admin) and on Help. It steps back to the previous app screen with the same filters, gallery/table view and scroll position; opened by a link (or as the first screen of the installed app) it goes to the logical parent: item → Items, edit → item, place → the place above or Places, admin/help → Settings. On the Add screen it returns to the two cards ("several items": asks first, like Cancel). iOS swipe-back keeps working.

## v1.4.1 — 2026-11-19

- **One "I'm here" everywhere:** the place filter on the Items tab is "I'm here" too — choosing a place there (or opening "all items in this place") sets it, "All places" and "Reset" clear it, and changing it in the header rebuilds the list at once. Choosing a place for an item or a place ("Move", parent of a new place) still does not change it.

## v1.4.0 — 2026-11-19

- **"I'm here" is one place everywhere:** the place chosen while adding an item (list, voice or reset) is "I'm here" itself — the header, every tab and the next add form show it. Editing an item's place or "Move" do not change it.
- **Items tab opens on "I'm here"** (with nested places); another place or "All places" can be chosen in the filter.
- **Fix:** "I'm here" was wiped when switching accounts on one device or right after creating a place. It is now stored per user and never erased automatically (only by you, or when that place is deleted).
- **Fix (iPhone):** the bottom bar and the header no longer move with the page on rubber-band scrolling.

## v1.3.0 — 2026-11-19

- **Voice in text fields:** a mic next to item names and descriptions, place names and category names (new and edit forms). The recording becomes text in the field's language (the EN field always gets English), with obvious recognition mistakes fixed and punctuation, never retold. It is offered under the field: Insert / Replace / Append to the end / Cancel — nothing changes without a tap. One recording = one AI request.
- With both data languages: "Update translation" of the other language after a change; translation now also works for descriptions.
- Database (safe migration): AI usage kind `transcribe`.

## v1.2.0 — 2026-11-19

- **Same photo again:** the device remembers a fingerprint (SHA-256) of each photo file. Adding the same file again — as one item or as several — shows "This photo has already been added: N items" with links, before any AI request (no AI limit used). "Recognize anyway" continues.
- **Similar items:** on the "Several items" list, items whose names match ones you already have show "Probably already there: …" and start unticked; re-checked when the place changes.
- Database (safe migration): `item_photos.source_hash`, function `similar_items()`.

## v1.1.0 — 2026-11-19

- **Several items in one photo:** a photo of a shelf, a tool board or a drawer → the AI finds up to 30 items (one AI request), each is cut out of the photo. Review list with checkboxes, names, categories, one place for all (by voice too), "Save N items". Each item gets its cut-out as the main photo and the whole photo as the second one. Zero or one item found → the usual form, already filled in.
- **Add screen:** two equal cards — "Several items in one photo" and "One item", each with "Take photo" / "From gallery".
- **Fix:** endless redirect (`ERR_TOO_MANY_REDIRECTS`) after signing out on another device; "Sign out" now signs out of this device only.
- Help: section "A whole shelf or tool board".

## v1.0.1 — 2026-11-19

Release process only, no change to the app.

- Release rules in `CLAUDE.md`: work in `feature/…` branches with Vercel Preview, `main` only on the owner's command, safe vs deferred migrations for the single shared database, separate test account, release and rollback steps.
- `supabase/deferred/` for breaking migrations applied only after deploy.
- This changelog; `package.json` version.

## v1.0.0 — 2026-11-19

First tagged state of the production site (commit `d5e42c8`).

- Email + password accounts with admin approval (pending / active / disabled), `/admin` page, emails to the admin and (once `MAIL_FROM` is set) to users.
- Location tree of any depth, categories, items with up to 10 photos (compressed on the device, thumbnails, EXIF/GPS removed).
- "I'm here" mode: default place for new items.
- Gemini: recognize an item from a photo, place it by voice or text, edit suggestions from the same phrase, smart search by voice or text; shared daily AI limit per user.
- Text search without AI, filters by place (with nested places) and category, gallery and table views.
- Interface in English and Russian; data languages per user: English only, Russian with automatic English, or both; batch translation.
- PWA: installable, offline screen, static-only cache; onboarding, `/help`, account deletion, daily database keepalive.
