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
#
# v2 hardening:
#   - finalize_push: stale-rebase cleanup, fetch with retries, pull --rebase
#     (conflict => clean abort + explicit failure), push with 3 retries
#   - machine-readable status file ($STATE_DIR/status) updated at every
#     transition: running / finalizing / pushed / push-failed / timeout / idle
#   - validity guard checks index.html AND assets/main.js before publishing

set -uo pipefail

SESSION="${1:-gh-trending-cc}"
REPO="/root/repos/github-trending"
BRANCH="main"
STATE_DIR="/tmp/gh-trending-cron"
START_FILE="$STATE_DIR/started_at"
DONE_FILE="$STATE_DIR/DONE"
STATUS_FILE="$STATE_DIR/status"
TIMEOUT_SECS=$((45 * 60))   # hard kill ceiling
PASS_SECS=55                # how long one cron invocation stays resident
POLL_SECS=5                 # screen re-check interval inside a pass

log() { printf '%s [watchdog] %s\n' "$(date '+%F %T')" "$*"; }

status() {
  printf 'phase=%s ts=%s detail=%s\n' "$1" "$(date +%s)" "${2:-}" > "$STATUS_FILE" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# 1. Session present?
# ---------------------------------------------------------------------------
if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  # Quiet exit — logging every minute of idle would drown the log file.
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

# Drop any half-finished rebase/merge so git commands below start clean.
clear_stale_git_state() {
  if [ -d "$(git rev-parse --git-path rebase-merge 2>/dev/null)" ] || \
     [ -d "$(git rev-parse --git-path rebase-apply 2>/dev/null)" ]; then
    log "stale rebase state — aborting it."
    git rebase --abort >/dev/null 2>&1 || true
  fi
  git merge --abort >/dev/null 2>&1 || true
}

# Validate content, commit any leftovers, and push. Never pushes an empty page.
# Git flow: fetch (3 retries) -> pull --rebase (conflict => abort cleanly and
# fail loudly) -> push (3 retries).
finalize_push() {
  cd "$REPO" || { log "cannot cd $REPO"; status "push-failed" "cannot cd repo"; return 1; }
  git rev-parse --git-dir >/dev/null 2>&1 || { log "not a git repo"; status "push-failed" "not a git repo"; return 1; }
  status "finalizing" "validating and pushing"

  clear_stale_git_state

  # Stage anything CC left uncommitted (it is supposed to commit itself).
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git add -A
    if git commit -q -m "chore(cron): auto-commit trending analysis $(date '+%F')"; then
      log "committed leftover working-tree changes."
    else
      log "WARNING: leftover changes present but commit failed."
    fi
  fi

  # Validity guard — refuse to publish an empty / truncated analysis.
  if [ ! -s "$REPO/index.html" ] || [ "$(stat -c%s "$REPO/index.html" 2>/dev/null || echo 0)" -lt 1024 ]; then
    log "ABORT push: index.html missing or < 1KB — refusing to push empty analysis."
    status "push-failed" "index.html missing or truncated"
    return 1
  fi
  if [ ! -s "$REPO/assets/main.js" ]; then
    log "ABORT push: assets/main.js missing or empty — tabs would not render."
    status "push-failed" "assets/main.js missing"
    return 1
  fi

  # Sync with remote before pushing: fetch with retries, then rebase on top.
  local fetched=0 attempt
  for attempt in 1 2 3; do
    if git fetch -q origin "$BRANCH" 2>/dev/null; then fetched=1; break; fi
    log "git fetch attempt $attempt/3 failed — retrying in $((attempt * 5))s."
    sleep $((attempt * 5))
  done
  if [ "$fetched" -eq 0 ]; then
    log "git fetch failed 3x — will still attempt a direct push."
  elif ! git pull --rebase -q origin "$BRANCH" >/dev/null 2>&1; then
    log "pull --rebase hit a conflict — aborting rebase; manual intervention needed."
    git rebase --abort >/dev/null 2>&1 || true
    status "push-failed" "rebase conflict with origin/$BRANCH"
    return 1
  fi

  # Anything new to push?
  local ahead
  ahead="$(git rev-list --count "origin/$BRANCH..$BRANCH" 2>/dev/null || echo 0)"
  if [ "${ahead:-0}" -eq 0 ]; then
    log "nothing to push (CC already pushed / up to date)."
    status "pushed" "0 new commits (already up to date)"
    return 0
  fi

  for attempt in 1 2 3; do
    if git push origin "$BRANCH" >/dev/null 2>&1; then
      log "pushed $ahead commit(s) to origin/$BRANCH @ $(git rev-parse --short HEAD)."
      status "pushed" "$ahead commits @ $(git rev-parse --short HEAD)"
      return 0
    fi
    log "git push attempt $attempt/3 failed — retrying in $((attempt * 10))s."
    sleep $((attempt * 10))
    # Remote may have moved between attempts — re-sync then retry.
    git fetch -q origin "$BRANCH" 2>/dev/null && \
      git pull --rebase -q origin "$BRANCH" >/dev/null 2>&1 || true
  done
  log "git push FAILED after 3 attempts."
  status "push-failed" "push failed after 3 attempts"
  return 1
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
  status "timeout" "elapsed=$(( now - start ))s"
  finalize_push || log "finalize-on-timeout did not push."
  cleanup
  exit 0
fi

# ---------------------------------------------------------------------------
# 3 + 4. bounded poll loop for this minute
# ---------------------------------------------------------------------------
status "running" "elapsed=$(( now - start ))s"
deadline=$(( now + PASS_SECS ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    log "session vanished mid-pass — finalizing any leftover work."
    finalize_push || true
    rm -f "$START_FILE" "$DONE_FILE"
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
    status "timeout" "elapsed=$(( $(date +%s) - start ))s"
    finalize_push || log "finalize-on-timeout did not push."
    cleanup
    exit 0
  fi
  sleep "$POLL_SECS"
done

log "pass complete — session still running, elapsed=$(( $(date +%s) - start ))s."
exit 0
