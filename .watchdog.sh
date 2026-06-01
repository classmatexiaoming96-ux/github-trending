#!/usr/bin/env bash
# .watchdog.sh — per-minute watchdog for the daily GitHub-Trending CC run.
#
# Invoked by cron once a minute, e.g.:
#     * * * * * /root/repos/github-trending/.watchdog.sh gh-trending-cc >> /tmp/gh-trending-cron/watchdog.log 2>&1
#
# Each invocation does ONE bounded pass (polls for ~55s, then exits so the next
# cron tick takes over). Responsibilities:
#   1. If the CC tmux session isn't running  -> nothing to do, exit 0.
#   2. Enforce a 45-min hard timeout (finalize + kill if exceeded).
#   3. If CC shows a "Do you want to proceed?" permission dialog, approve it:
#        - 3-option dialog (has "don't ask again")  -> send "2"  (batch-authorize)
#        - 2-option dialog                          -> send "1"  (plain Yes; "2"=No here!)
#   4. When CC signals completion (DONE sentinel / "-- TASK DONE --"), push the
#      result (if valid) and tear the session down.
#
# Why a sentinel instead of "claude:~$" prompt detection: an interactive
# `claude` TUI does NOT drop back to a shell prompt when its turn ends — it sits
# idle. So the launch prompt instructs CC to `touch $DONE_FILE` as its very last
# action; that is the reliable "done" edge. The 45-min timeout is the backstop.

set -uo pipefail

SESSION="${1:-gh-trending-cc}"
REPO="/root/repos/github-trending"
BRANCH="main"
STATE_DIR="/tmp/gh-trending-cron"
START_FILE="$STATE_DIR/started_at"
DONE_FILE="$STATE_DIR/DONE"
TIMEOUT_SECS=$((45 * 60))   # hard kill ceiling
PASS_SECS=55                # how long one cron invocation stays resident
POLL_SECS=5                 # screen re-check interval inside a pass

log() { printf '%s [watchdog] %s\n' "$(date '+%F %T')" "$*"; }

# ---------------------------------------------------------------------------
# 1. Session present?
# ---------------------------------------------------------------------------
if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  log "session '$SESSION' not running — nothing to do."
  exit 0
fi
mkdir -p "$STATE_DIR"

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
cleanup() {
  tmux kill-session -t "$SESSION" 2>/dev/null && log "killed session '$SESSION'."
  rm -f "$START_FILE" "$DONE_FILE"
}

# Validate content, commit any leftovers, and push. Never pushes an empty page.
finalize_push() {
  cd "$REPO" || { log "cannot cd $REPO"; return 1; }
  git rev-parse --git-dir >/dev/null 2>&1 || { log "not a git repo"; return 1; }

  # Stage anything CC left uncommitted (it is supposed to commit itself).
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git add -A
    git commit -q -m "chore(cron): auto-commit trending analysis $(date '+%F')" \
      && log "committed leftover working-tree changes."
  fi

  # Validity guard — refuse to publish an empty / truncated analysis.
  if [ ! -s "$REPO/index.html" ] || [ "$(stat -c%s "$REPO/index.html" 2>/dev/null || echo 0)" -lt 1024 ]; then
    log "ABORT push: index.html missing or < 1KB — refusing to push empty analysis."
    return 1
  fi

  # Anything new to push?
  git fetch -q origin "$BRANCH" 2>/dev/null || true
  local ahead
  ahead="$(git rev-list --count "origin/$BRANCH..$BRANCH" 2>/dev/null || echo 0)"
  if [ "${ahead:-0}" -eq 0 ]; then
    log "nothing to push (CC already pushed / up to date)."
    return 0
  fi
  if git push origin "$BRANCH" >/dev/null 2>&1; then
    log "pushed $ahead commit(s) to origin/$BRANCH."
  else
    log "git push FAILED."
    return 1
  fi
}

# Detect the permission dialog and approve with the correct key.
approve_if_prompted() {
  local pane key
  pane="$(tmux capture-pane -t "$SESSION" -p -S -200 2>/dev/null)"

  printf '%s' "$pane" | grep -qiE 'Do you want to proceed\?|Do you want to make this edit\?|❯[[:space:]]*1\.[[:space:]]*Yes' || return 1

  if printf '%s' "$pane" | grep -qi "don't ask again"; then
    key="2"   # 3-option dialog: 2 = "Yes, and don't ask again for ..."
  else
    key="1"   # 2-option dialog: 1 = "Yes"  (2 would mean "No" here)
  fi
  log "permission dialog detected — sending '$key'."
  tmux send-keys -t "$SESSION" "$key"
  sleep 0.4
  tmux send-keys -t "$SESSION" Enter
  return 0
}

# Has CC signalled completion?
is_done() {
  [ -f "$DONE_FILE" ] && return 0
  tmux capture-pane -t "$SESSION" -p -S -200 2>/dev/null \
    | grep -qE -- '--[[:space:]]*TASK[[:space:]]+DONE[[:space:]]*--' && return 0
  return 1
}

# ---------------------------------------------------------------------------
# 2. start stamp / hard timeout
# ---------------------------------------------------------------------------
now="$(date +%s)"
if [ -f "$START_FILE" ]; then
  start="$(cat "$START_FILE" 2>/dev/null || echo "$now")"
else
  echo "$now" > "$START_FILE"   # session exists but no stamp -> adopt now
  start="$now"
fi
if [ $(( now - start )) -ge "$TIMEOUT_SECS" ]; then
  log "TIMEOUT after $(( now - start ))s (>= ${TIMEOUT_SECS}s). Forcing finalize + kill."
  finalize_push || log "finalize-on-timeout did not push."
  cleanup
  exit 0
fi

# ---------------------------------------------------------------------------
# 3 + 4. bounded poll loop for this minute
# ---------------------------------------------------------------------------
deadline=$(( now + PASS_SECS ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    log "session vanished mid-pass."
    exit 0
  fi
  if is_done; then
    log "completion detected — finalizing."
    finalize_push
    cleanup
    exit 0
  fi
  approve_if_prompted || true
  # Re-check the hard timeout inside the loop too.
  if [ $(( $(date +%s) - start )) -ge "$TIMEOUT_SECS" ]; then
    log "TIMEOUT reached mid-pass — forcing finalize + kill."
    finalize_push || log "finalize-on-timeout did not push."
    cleanup
    exit 0
  fi
  sleep "$POLL_SECS"
done

log "pass complete — session still running, elapsed=$(( $(date +%s) - start ))s."
exit 0
