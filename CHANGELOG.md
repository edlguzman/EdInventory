# Changelog

Versions follow [semver](https://semver.org/): fixes → patch, new features → minor,
changes that break things for users → major. Each release is a git tag `vX.Y.Z` on `main`.

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
