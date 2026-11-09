# Live app (devbox): app changes from the chat in seconds

Amber's app runs on the devbox as a persistent `next dev` (Turbopack, hot reload) on the same
production Supabase and Clerk as the Vercel app. A change she asks for in the chat is made by a
local coding worker and shows in her app in about 20-35 s; undo takes about 2 s. Every accepted change
is also pushed to `main` with the repo's deploy key, so the Vercel app catches up as a fallback.
No GitHub token is involved (agents may not hold a founder's login, CC-11). The Vercel app keeps the
old GitHub Actions flow (no `LIVE_WORKER_URL` there).

## Flow

1. Chat: Amber asks, the assistant calls `request_change` at once (no "Zal ik ...?"; the card's "Ongedaan maken" is the safety net).
2. `lib/change/runs.ts` (live mode, `LIVE_WORKER_URL` set) stores the `change_runs` row and posts the
   request (plus any chat photos) to the worker on `127.0.0.1:3411`.
3. `scripts/live/worker.ts`, one change at a time:
   - resets the work checkout to the live checkout's HEAD;
   - runs opencode in a Docker sandbox (`scripts/live/run-agent.sh`): only the work checkout is
     writable, no shell tool, no web fetch, repo config ignored, one model only
     (`deepseek/deepseek-v4.1-flash-1017`, also used for the session title);
   - commits, then runs the trusted guardrail (`scripts/guardrail-check.ts`, loaded from the live
     checkout, which the agent can never change) plus a secret-value scan; blocked = nothing applied;
   - `tsc --noEmit` and ESLint on the touched files; one fix round by the agent if they fail;
   - fast-forwards the live checkout (hot reload), loads the main pages signed in and checks they
     answer 200, else resets the live checkout to the previous commit;
   - in the background pushes that commit to `main` over SSH with the write deploy key
     `~/.ssh/menu_planner_deploy` (`LIVE_PUSH_REMOTE` overrides the remote), so Vercel builds it.
4. Undo: `git revert` on the live checkout (hot reload), then push the revert commit to `main` the
   same way. A change that never reached `main` has nothing to undo there.
5. Every minute, when idle and none of its pushes is still on its way, the worker moves the live
   checkout to `origin/main` (and reinstalls dependencies and restarts the app if they changed).

The card in the chat shows the real state: "Bezig: code aanpassen…", "Bezig: controleren…",
"Staat erin in 23 s", "Ongedaan maken", "Ongedaan gemaakt in 2 s".

## Devbox layout

| What | Where |
| --- | --- |
| live checkout (the running app) | `/home/robin/menu-live/live`, branch `live`, `.env.local` with prod keys (no Supabase secret key, no bypass) |
| work checkout (agent edits here) | `/home/robin/menu-live/work`, no env file |
| worker state, attachments | `/home/robin/menu-live/state` |
| agent sandbox image | `menu-agent:1`, built from `scripts/live/agent.Dockerfile` |
| app job | `hub-job start menu-live-app --cwd /home/robin/menu-live/live -- scripts/live/app.sh 3400` |
| worker job | `hub-job start menu-live-worker --cwd /home/robin/menu-live -- ./worker-run.sh` (secrets from `worker.env` and `.openrouter-key`, mode 600) |
| compression proxy | `hub-job start menu-live-proxy --cwd /home/robin/menu-live/proxy -- docker run --rm --name menu-live-proxy --network host -v $PWD/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2` (`scripts/live/Caddyfile`: gzip/zstd, 5x less JS than raw `next dev`) |
| public URL | Tailscale Funnel `https://caspian-devbox.tail9383e8.ts.net:10000/` -> Caddy `127.0.0.1:3402` -> `127.0.0.1:3400` |

Both jobs restart their process in a loop; the worker also restarts the app after three failed
health checks. After a devbox reboot start both jobs again.

## Guardrail proof

`docs/live-app/guardrail-fake-agent.sh` acts like a hijacked agent (migration with `drop table`,
`.delete(`, raw `DELETE FROM`, secret env access). Run against a throwaway clone with
`LIVE_AGENT_SCRIPT` set, every case ends `blocked` and the live checkout HEAD is unchanged.
