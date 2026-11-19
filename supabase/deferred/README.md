# Deferred migrations

Breaking schema changes that must NOT reach the shared database before the new app
version is live: dropping or renaming columns/tables, `not null`, new `check` constraints,
stricter RLS, changed behaviour of existing functions, triggers or views.

`supabase db push` only reads `supabase/migrations/`, so files here are never applied by accident.

For each change keep two files:

- `<feature>_<what>.sql` — the change itself;
- `<feature>_<what>.down.sql` — the reverse, written in advance (used if the release is rolled back).

On release ("выкатывай"), after the new code is deployed and checked:

1. dump the affected data (`npx supabase db dump --data-only`) to the scratchpad, never to git;
2. move the `.sql` file to `supabase/migrations/` with a fresh timestamp in its name;
3. with the owner's explicit "yes": `npx supabase db push --remote`, then `npm run db:types`;
4. check the production site again.

See "Релизы" in `CLAUDE.md`.
