# Live app: decision log (2026-11-08)

- Proposed: Tailscale Funnel on port 10000, path `/`, for the public URL. Why: the Cloudflare token only
  has DNS edit (no tunnels), the devbox firewall blocks public ports, Funnel 443 carries tailnet-only
  Caspian callbacks and 8443 is taken. Port 10000 already funnels three bot paths; `/` is added beside them.
- Proposed: `next dev` with Turbopack as the live server. Why: a change shows by hot reload in about 1 s;
  `next build` takes 23 s here. Warm page loads are as fast as Vercel (see verification); the cost is a
  bigger first download (about 2.2 MB of JS against 0.9 MB) on a cold cache.
- Proposed: two checkouts (work and live). Why: the agent's half-done edits never show in the app; only
  guarded, type-checked commits are fast-forwarded into the live checkout.
- Proposed: opencode in Docker with no shell tool and no project config. Why: on the devbox the agent
  would otherwise run commands as Robin; the sandbox sees only the work checkout.
- Proposed: background PR with auto-merge instead of a direct push to main. Why: the bot cannot bypass
  the `pr-checks` ruleset and the PR keeps the `guardrail` and `build` checks; it never blocks Amber.
- Proposed: model `deepseek/deepseek-v4.1-flash-1017` for the coding agent. Why: 3/3 correct in 14-16 s
  against GLM 5.3 flash 3/3 correct in 15-60 s, at a third of the cost.

| model | runs | correct | wall time (s) | cost per run (USD) |
| --- | --- | --- | --- | --- |
| deepseek/deepseek-v4.1-flash-1017 | 3 | 3 | 15.6, 15.1, 14.4 | 0.0011, 0.0012, 0.0008 |
| z-ai/glm-5.3-flash | 3 | 3 | 60.0, 30.6, 15.3 | 0.0035, 0.0036, 0.0026 |

Task: "Maak de verzendknop in de chat rood", same prompt, fresh checkout each run, opencode 1.19.5 in
the sandbox. Every run changed only `components/chat/chat-panel.tsx`, with the send button's class.
