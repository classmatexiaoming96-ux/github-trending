#!/usr/bin/env bash
# .cron-launch.sh — daily entrypoint for the GitHub-Trending analysis run.
#
# Triggered by cron once a day. Starts a REAL Claude Code CLI session inside
# tmux (so the run goes through the Claude API instead of the built-in model
# fallback), feeds it the full clone -> analyze -> push prompt, then exits.
# The per-minute .watchdog.sh approves permission dialogs and finalizes.
#
#     7 4 * * *  /root/repos/github-trending/.cron-launch.sh >> /tmp/gh-trending-cron/launch.log 2>&1

set -uo pipefail

SESSION="gh-trending-cc"
REPO="/root/repos/github-trending"
BRANCH="main"
STATE_DIR="/tmp/gh-trending-cron"
START_FILE="$STATE_DIR/started_at"
DONE_FILE="$STATE_DIR/DONE"
PROMPT_FILE="$STATE_DIR/prompt.txt"
RUNNER="$STATE_DIR/run-cc.sh"

log() { printf '%s [launch] %s\n' "$(date '+%F %T')" "$*"; }

mkdir -p "$STATE_DIR"

# Don't start a second run if one is still in flight.
if tmux has-session -t "$SESSION" 2>/dev/null; then
  log "session '$SESSION' already running — skipping this trigger."
  exit 0
fi

# Fresh tree: pin to main, hard-sync to origin so we never build on stale work.
cd "$REPO" || { log "cannot cd $REPO"; exit 1; }
git checkout "$BRANCH" >/dev/null 2>&1 || true
if git fetch -q origin "$BRANCH" 2>/dev/null; then
  git reset --hard "origin/$BRANCH" >/dev/null 2>&1 || true
fi
log "repo synced to origin/$BRANCH @ $(git rev-parse --short HEAD 2>/dev/null)."

# Reset run state.
rm -f "$DONE_FILE"
date +%s > "$START_FILE"

# ---------------------------------------------------------------------------
# The end-to-end prompt CC executes. Stored in a file and passed to claude as a
# single positional arg (multi-line is fine — it's one argv element, NOT typed
# into the TUI line-by-line, so newlines don't submit early).
# ---------------------------------------------------------------------------
cat > "$PROMPT_FILE" <<'PROMPT_EOF'
You are the daily GitHub-Trending analysis agent, running in /root/repos/github-trending (a git clone on branch main, already synced to origin). Do the FULL run end-to-end and autonomously — never ask me anything, just proceed through every permission prompt.

1. Look at today's GitHub Trending (https://github.com/trending) and pick the single hottest repo that does NOT already have a tab in index.html. Existing tab IDs: cg, ua, cp, oh, kc, oc, od. Do not duplicate any of these.
2. Shallow-clone the chosen repo into sources/<name>/ and read its real source (README plus the key modules) — produce a genuine deep teardown at the same depth as the existing kimi-code and odysseus tabs (positioning + competitor comparison, architecture diagram, source-level module breakdown, key techniques, failure modes, significance).
3. Generate a standalone <name>.html AND add a matching tab button + tab-panel to index.html. Reuse the existing dark-theme CSS. Do NOT remove, rename, or restructure any existing tab or page.
4. Verify the new page is valid (e.g. curl -s -o /dev/null -w '%{http_code}' file://$PWD/<name>.html) and that index.html still parses. If anything is empty or truncated, fix it before committing — never commit or push an empty analysis.
5. Commit:  git add -A && git commit -m "feat: add <name> tab — <one-line summary> (<stars>★)"
6. Push:    git push origin main
7. As your VERY LAST action, run exactly this so the watchdog knows you are finished:
       touch /tmp/gh-trending-cron/DONE && echo "-- TASK DONE --"
PROMPT_EOF

# Tiny runner so tmux execs one clean command (no quoting gymnastics in tmux).
cat > "$RUNNER" <<RUNNER_EOF
#!/usr/bin/env bash
cd "$REPO" || exit 1
# Interactive TUI (no --print) => real API usage; permission prompts surface in
# the pane for the watchdog to approve. Default permission mode keeps prompts on.
exec claude --permission-mode default "\$(cat "$PROMPT_FILE")"
RUNNER_EOF
chmod +x "$RUNNER"

# Launch detached. Wide pane so dialog text isn't wrapped/truncated off-screen.
tmux new-session -d -s "$SESSION" -x 220 -y 50 "bash '$RUNNER'"
log "launched CC in tmux session '$SESSION'. Per-minute watchdog will approve prompts and finalize."
