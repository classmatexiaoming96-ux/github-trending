#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

: "${OPENTAG_CONFIG_PATH:?Set OPENTAG_CONFIG_PATH to your local runner config JSON}"
: "${SLACK_SIGNING_SECRET:?Set SLACK_SIGNING_SECRET from your Slack App}"
: "${OPENTAG_SLACK_BOT_TOKEN:?Set OPENTAG_SLACK_BOT_TOKEN to the xoxb token}"
: "${OPENTAG_PAIRING_TOKEN:=dev_pairing_token}"
: "${OPENTAG_DISPATCHER_PORT:=3031}"
: "${OPENTAG_SLACK_PORT:=3040}"

cd "$ROOT_DIR"

echo "Starting dispatcher on :$OPENTAG_DISPATCHER_PORT"
(
  export PORT="$OPENTAG_DISPATCHER_PORT"
  export OPENTAG_DATABASE_PATH="${OPENTAG_DATABASE_PATH:-opentag.slack-test.db}"
  export OPENTAG_PAIRING_TOKEN
  export OPENTAG_SLACK_BOT_TOKEN
  export OPENTAG_GITHUB_TOKEN="${OPENTAG_GITHUB_TOKEN:-}"
  apps/dispatcher/node_modules/.bin/tsx apps/dispatcher/src/index.ts
) &
DISPATCHER_PID=$!

trap 'kill $DISPATCHER_PID $DAEMON_PID $SLACK_PID 2>/dev/null || true' EXIT

sleep 2

echo "Registering runner, binding repository, and binding Slack channels"
export OPENTAG_CONFIG_PATH
apps/opentagd/node_modules/.bin/tsx apps/opentagd/src/index.ts register-runner
apps/opentagd/node_modules/.bin/tsx apps/opentagd/src/index.ts bind-repos
apps/opentagd/node_modules/.bin/tsx apps/opentagd/src/index.ts bind-slack-channels

echo "Starting local daemon"
(
  export OPENTAG_CONFIG_PATH
  apps/opentagd/node_modules/.bin/tsx apps/opentagd/src/index.ts serve
) &
DAEMON_PID=$!

echo "Starting Slack Events ingress on :$OPENTAG_SLACK_PORT"
(
  export SLACK_SIGNING_SECRET
  export OPENTAG_DISPATCHER_URL="http://localhost:$OPENTAG_DISPATCHER_PORT"
  export OPENTAG_DISPATCHER_TOKEN="$OPENTAG_PAIRING_TOKEN"
  export PORT="$OPENTAG_SLACK_PORT"
  apps/slack-events/node_modules/.bin/tsx apps/slack-events/src/index.ts
) &
SLACK_PID=$!

echo
echo "Slack smoke-test stack is running."
echo "- Dispatcher: http://localhost:$OPENTAG_DISPATCHER_PORT"
echo "- Slack Events ingress: http://localhost:$OPENTAG_SLACK_PORT"
echo "- Expose port $OPENTAG_SLACK_PORT with ngrok and use /slack/events as the Slack Request URL"
echo "- Disable Socket Mode when using Event Subscriptions over a public tunnel"
echo
wait
