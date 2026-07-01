# Data-Safe Deployment Notes

This app stores real household data in Supabase. Current production data includes recipes, ingredients, planning rows, potjes, shopping data, and vleesjes.

## Before Deploying App Changes

1. Check the worktree:
   ```bash
   git status --short
   ```
2. Export a local read-only data backup:
   ```bash
   corepack pnpm data:backup
   ```
   Backups are written to `.backups/`, which is gitignored.
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
