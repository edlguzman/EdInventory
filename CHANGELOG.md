# Changelog

Versions follow [semver](https://semver.org/): fixes → patch, new features → minor,
changes that break things for users → major. Each release is a git tag `vX.Y.Z` on `main`.

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
