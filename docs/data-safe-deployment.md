# Data-Safe Deployment Notes

This app stores real household data in Supabase. Current production data includes recipes, ingredients, planning rows, potjes, shopping data, and vleesjes.
Recipe photos are stored in the Supabase Storage bucket `recipe-images`; recipe rows store only the object path.

## Local Development

Local development never touches production data. `.env.local` points at a local
Supabase stack run by the Supabase CLI (Docker); production credentials live in
`.env.prod.local` and are read only by the admin scripts below.

```bash
corepack pnpm db:start          # start local Supabase + apply supabase/migrations
corepack pnpm db:pull-recipes   # copy recipes, ingredients, tags and photos from production (read-only)
corepack pnpm dev --port 3001
```

- `corepack pnpm db:reset` rebuilds the local database from the migrations and pulls the recipes again.
- Planning, shopping, potjes, vleesjes and groenten start empty locally.
- Local Studio: http://127.0.0.1:54323. `corepack pnpm db:stop` stops the stack.
- New migrations: add them to `supabase/migrations/`, test with `db:reset`, then apply to production with `scripts/apply-sql.ts`.

## Before Deploying App Changes

1. Check the worktree:
   ```bash
   git status --short
   ```
2. Export a read-only backup of production data (uses `.env.prod.local`):
   ```bash
   corepack pnpm data:backup
   ```
   Database-row backups are written to `.backups/`, which is gitignored. Storage files should be exported from the `recipe-images` bucket before any storage-affecting work.
3. Build locally:
   ```bash
   corepack pnpm build
   ```
4. Review any SQL changes before applying them. Prefer additive migrations:
   - `create table if not exists`
   - `add column if not exists`
   - `insert ... on conflict do nothing`

## Do Not Run Against Production

- `scripts/seed.ts` deletes real data before inserting demo data. It now refuses to run unless `ALLOW_DESTRUCTIVE_SEED` is set to the target Supabase project ref for that single command.
- `scripts/apply-sql.ts` can execute arbitrary SQL via the Supabase Management API. Treat every SQL file passed to it as production-impacting.
- Avoid `drop`, `truncate`, broad `delete`, and table rebuild migrations unless there is a verified backup and a restore plan.

## Deployment Shape

- The app is deployed on Vercel and this checkout is linked to the `menu-planner` project.
- `package.json` build scripts do not automatically run seeds or migrations.
- Git pushes to `main` may auto-deploy through the Vercel Git integration.
