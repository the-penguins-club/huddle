#!/bin/sh
# Stop hook (agents only; people working without one aren't affected). When the agent stops:
#  1. rebuild index.html and the generated parts of docs/map.md, in case edits came from the shell;
#  2. if the code changed since the last commit and none of the hand-written docs did, ask the agent,
#     once per set of changes, to check whether docs/design.md, docs/lessons.md or AGENTS.md need an
#     update. A fingerprint of the change in .git/ remembers what was already reviewed.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
input=$(cat)
node build.js >/dev/null 2>&1
node scripts/harness-sync.js >/dev/null 2>&1
case "$input" in *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;; esac

changed=$(git status --porcelain 2>/dev/null | cut -c4-)
code=$(printf '%s\n' "$changed" | grep -E '^(src/|server\.js|build\.js|dev/)' || true)
docs=$(printf '%s\n' "$changed" | grep -E '^(docs/design\.md|docs/lessons\.md|AGENTS\.md)' || true)
[ -z "$code" ] && exit 0
[ -n "$docs" ] && exit 0

mark="$(git rev-parse --git-dir 2>/dev/null)/harness-reviewed"
fp=$(git diff HEAD -- src server.js build.js dev 2>/dev/null | git hash-object --stdin)
[ -f "$mark" ] && [ "$(cat "$mark")" = "$fp" ] && exit 0
echo "$fp" > "$mark"

files=$(printf '%s' "$code" | tr '\n' ' ')
cat <<JSON
{"decision": "block", "reason": "Code changed ($files) but the hand-written docs didn't. If this change alters behaviour or a UI decision, update docs/design.md; if it taught something the hard way, add a line to docs/lessons.md; if it changes how to work here, update AGENTS.md. docs/map.md's generated sections are already refreshed; update its prose if files moved. If none applies, say so briefly and stop."}
JSON
