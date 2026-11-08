#!/usr/bin/env bash
# Runs the coding agent (opencode) in a throwaway Docker sandbox on one checkout.
# Usage: run-agent.sh <workdir> <model> <prompt> [attachments-dir]
# Prints opencode JSON events on stdout. Only <workdir> is writable; attachments are read-only.
# No bash tool, no web fetch, no project config (the repo's opencode.json is ignored), and the
# title/summary "small model" is pinned to the same model so no other model is ever called.
set -euo pipefail
WORK="$1"; MODEL="$2"; PROMPT="$3"; ATT="${4:-}"
: "${OPENROUTER_API_KEY:?OPENROUTER_API_KEY missing}"
CFG=$(cat <<JSON
{"\$schema":"https://opencode.ai/config.json","instructions":["CODING_AGENT.md"],
 "model":"openrouter/$MODEL","small_model":"openrouter/$MODEL",
 "permission":{"edit":"allow","bash":"deny","webfetch":"deny","external_directory":"deny"},
 "autoupdate":false,"share":"disabled",
 "provider":{"openrouter":{"models":{"$MODEL":{}}}}}
JSON
)
FILES=(); MOUNT=()
if [ -n "$ATT" ] && [ -d "$ATT" ]; then
  MOUNT=(-v "$ATT":/attachments:ro)
  for f in "$ATT"/*; do [ -f "$f" ] && FILES+=(--file "/attachments/$(basename "$f")"); done
fi
exec docker run --rm --user "$(id -u):$(id -g)" \
  --memory 2g --cpus 2 --pids-limit 512 --read-only --tmpfs /tmp:exec,size=512m \
  --cap-drop ALL --security-opt no-new-privileges \
  -v "$WORK":/work -w /work "${MOUNT[@]}" \
  -e OPENROUTER_API_KEY -e OPENCODE_CONFIG_CONTENT="$CFG" -e OPENCODE_DISABLE_PROJECT_CONFIG=1 \
  -e OPENCODE_DISABLE_AUTOUPDATE=1 -e OPENCODE_DISABLE_LSP_DOWNLOAD=1 -e OPENCODE_DISABLE_CLAUDE_CODE=1 \
  -e OPENCODE_DISABLE_DEFAULT_PLUGINS=1 -e OPENCODE_DISABLE_MODELS_FETCH=1 \
  "${MENU_AGENT_IMAGE:-menu-agent:1}" opencode run --format json --title change --model "openrouter/$MODEL" "${FILES[@]}" -- "$PROMPT"
