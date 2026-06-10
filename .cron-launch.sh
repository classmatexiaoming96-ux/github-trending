#!/usr/bin/env bash
# .cron-launch.sh — daily entrypoint for the GitHub-Trending analysis run.
#
# Triggered by cron once a day. Starts a REAL Claude Code CLI session inside
# tmux (so the run goes through the Claude API instead of the built-in model
# fallback), feeds it the full clone -> analyze -> push prompt, then exits.
# The per-minute .watchdog.sh approves permission dialogs and finalizes.
#
#     7 4 * * *  /root/repos/github-trending/.cron-launch.sh >> /tmp/gh-trending-cron/launch.log 2>&1
#
# v2 hardening:
#   - dependency preflight (tmux / claude / git) with explicit errors
#   - flock guard against double-launch races (tmux check alone has a TOCTOU gap)
#   - git sync: fetch (3 retries) -> pull --rebase --autostash, fallback to
#     reset --hard origin/main; never builds on a stale or dirty tree silently
#   - machine-readable status file ($STATE_DIR/status) at every phase
#   - post-launch verification that the tmux session actually came up

set -uo pipefail

SESSION="gh-trending-cc"
REPO="/root/repos/github-trending"
BRANCH="main"
STATE_DIR="/tmp/gh-trending-cron"
START_FILE="$STATE_DIR/started_at"
DONE_FILE="$STATE_DIR/DONE"
PROMPT_FILE="$STATE_DIR/prompt.txt"
RUNNER="$STATE_DIR/run-cc.sh"
LOCK_FILE="$STATE_DIR/launch.lock"
STATUS_FILE="$STATE_DIR/status"

log() { printf '%s [launch] %s\n' "$(date '+%F %T')" "$*"; }

# status <phase> [detail]  — one-line machine-readable run state for humans
# and for the watchdog ("phase=... ts=... detail=...").
status() {
  printf 'phase=%s ts=%s detail=%s\n' "$1" "$(date +%s)" "${2:-}" > "$STATUS_FILE" 2>/dev/null || true
}

fail() { log "FATAL: $*"; status "launch-failed" "$*"; exit 1; }

mkdir -p "$STATE_DIR" || { log "FATAL: cannot create $STATE_DIR"; exit 1; }

# ---------------------------------------------------------------------------
# 0. Preflight: required binaries.
# ---------------------------------------------------------------------------
for bin in tmux git claude; do
  command -v "$bin" >/dev/null 2>&1 || fail "required binary '$bin' not found in PATH"
done

# ---------------------------------------------------------------------------
# 1. Single-instance guard: flock first (atomic), then tmux session check.
# ---------------------------------------------------------------------------
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "another launch is already in progress (lock held) — skipping."
  exit 0
fi
if tmux has-session -t "$SESSION" 2>/dev/null; then
  log "session '$SESSION' already running — skipping this trigger."
  exit 0
fi

status "syncing" "git sync to origin/$BRANCH"

# ---------------------------------------------------------------------------
# 2. Fresh tree: fetch (with retries) -> pull --rebase; fall back to a hard
#    reset if the rebase cannot apply. Never proceed on a fetch we know failed.
# ---------------------------------------------------------------------------
cd "$REPO" || fail "cannot cd $REPO"
git rev-parse --git-dir >/dev/null 2>&1 || fail "$REPO is not a git repository"

# Abort any half-finished rebase/merge from a previous crashed run.
if [ -d "$(git rev-parse --git-path rebase-merge 2>/dev/null)" ] || \
   [ -d "$(git rev-parse --git-path rebase-apply 2>/dev/null)" ]; then
  log "stale rebase state detected — aborting it."
  git rebase --abort >/dev/null 2>&1 || true
fi
git merge --abort >/dev/null 2>&1 || true

git checkout "$BRANCH" >/dev/null 2>&1 || fail "cannot checkout branch $BRANCH"

fetched=0
for attempt in 1 2 3; do
  if git fetch -q origin "$BRANCH" 2>/dev/null; then fetched=1; break; fi
  log "git fetch attempt $attempt/3 failed — retrying in $((attempt * 5))s."
  sleep $((attempt * 5))
done

if [ "$fetched" -eq 1 ]; then
  if ! git pull --rebase --autostash -q origin "$BRANCH" >/dev/null 2>&1; then
    log "pull --rebase failed — falling back to hard reset onto origin/$BRANCH."
    git rebase --abort >/dev/null 2>&1 || true
    git reset --hard "origin/$BRANCH" >/dev/null 2>&1 \
      || fail "both rebase and hard reset failed — repo state unusable"
  fi
  log "repo synced to origin/$BRANCH @ $(git rev-parse --short HEAD 2>/dev/null)."
else
  log "WARNING: all fetches failed — running against local HEAD @ $(git rev-parse --short HEAD 2>/dev/null) (offline mode)."
fi

# Reset run state.
rm -f "$DONE_FILE"
date +%s > "$START_FILE"

# ---------------------------------------------------------------------------
# 3. The end-to-end prompt CC executes. Stored in a file and passed to claude
#    as a single positional arg (multi-line is fine — it's one argv element,
#    NOT typed into the TUI line-by-line, so newlines don't submit early).
# ---------------------------------------------------------------------------
cat > "$PROMPT_FILE" <<'PROMPT_EOF'
You are the daily GitHub-Trending analysis agent, running in /root/repos/github-trending (a git clone on branch main, already synced to origin). Do the FULL run end-to-end and autonomously — never ask me anything, just proceed through every permission prompt.

1. Look at today's GitHub Trending (https://github.com/trending) and pick the single hottest repo that does NOT already have a tab in index.html. Existing tab IDs: cg, ua, cp, oh, kc, oc, od, og, mc, mo, sa, gu, al, pi. Do not duplicate any of these.
2. Shallow-clone the chosen repo into sources/<name>/ and read its real source (README plus the key modules) — produce a genuine deep teardown at the same depth as the existing kimi-code and odysseus tabs (positioning + competitor comparison, architecture diagram, source-level module breakdown, key techniques, failure modes, significance).
3. Generate a standalone <name>.html AND add a matching tab button + tab-panel to index.html. Reuse the existing dark-theme CSS. Register the new tab ID in BOTH the VALID array and the TITLES map in assets/main.js — the page will not render without this. Do NOT remove, rename, or restructure any existing tab or page.
4. Verify the new page is valid (e.g. curl -s -o /dev/null -w '%{http_code}' file://$PWD/<name>.html) and that index.html still parses. If anything is empty or truncated, fix it before committing — never commit or push an empty analysis.
5. Commit:  git add -A && git commit -m "feat: add <name> tab — <one-line summary> (<stars>★)"
6. Push:    git fetch origin main && git pull --rebase origin main && git push origin main
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

# ---------------------------------------------------------------------------
# 4. Launch detached + verify the session actually exists afterwards.
#    Wide pane so dialog text isn't wrapped/truncated off-screen.
# ---------------------------------------------------------------------------
if ! tmux new-session -d -s "$SESSION" -x 220 -y 50 "bash '$RUNNER'"; then
  fail "tmux new-session failed"
fi
sleep 2
if tmux has-session -t "$SESSION" 2>/dev/null; then
  status "running" "session=$SESSION head=$(git rev-parse --short HEAD 2>/dev/null)"
  log "launched CC in tmux session '$SESSION'. Per-minute watchdog will approve prompts and finalize."
else
  fail "tmux session '$SESSION' died immediately after launch — check claude CLI auth/installation"
fi
