---
name: opentag
description: Set up, run, and troubleshoot OpenTag with the published CLI across Slack, GitHub, Lark / Feishu, Codex, Claude Code, local config, platform credentials, and callback delivery.
---

# OpenTag

OpenTag connects collaboration platforms to a local coding agent. Use this skill when a user wants help with `opentag setup`, `opentag start`, Slack, GitHub, Lark / Feishu, Codex, Claude Code, local OpenTag config, or end-to-end setup verification.

## Default Path

Use the published CLI first. Do not start from repo-internal apps, old shell scripts, or private package binaries unless the user is explicitly doing core development.

Recommended user path:

```bash
npm install -g @opentag/cli
opentag setup
opentag start
```

No global install:

```bash
npx @opentag/cli setup
npx @opentag/cli start
```

## Route The Request

Read only the reference needed for the user's path:

- First setup or Echo test loop: `references/local-echo.md`
- Slack setup: `references/slack-setup.md`
- GitHub setup: `references/github-setup.md`
- Codex / Claude Code execution: `references/codex-runner.md`
- Broken setup, missing callbacks, rejected runs, or auth errors: `references/troubleshooting.md`

For platform credential steps, use the repository docs as the source of truth:

- Slack: `docs/platforms/slack.en.md`
- GitHub: `docs/platforms/github.en.md`
- Lark / Feishu: `docs/platforms/lark.en.md`

## Working Rules

- Keep setup user-led. Never invent tokens, app IDs, Slack team/channel IDs, GitHub owner/repo names, or local project paths.
- Prefer Slack, then GitHub, then Lark / Feishu when listing platforms.
- Ask the user which platform and coding agent they want if it is not already clear.
- Use Codex when `codex` is available, Claude Code when `claude` is available, and Echo only for dev/test verification.
- Treat `opentag start` as a foreground process. Tell the user to keep it running and stop it with Ctrl-C.
- Do not expose secrets in responses. Use `opentag config show` for redacted config.
- When credentials are needed, point the user to the matching platform guide and walk them through the official setup.

## Setup Workflow

1. Check prerequisites.
   Completion: Node.js 20+ is available and the user has a local project path.

2. Install or run the CLI.
   Completion: `opentag --help` or `npx @opentag/cli --help` works.

3. Run setup.
   Completion: `opentag setup` has collected platform, executor, project path, and credentials.

4. Start OpenTag.
   Completion: `opentag start` reports the dispatcher and selected platform listener.

5. Verify the setup.
   Completion: `opentag status` or `opentag doctor` explains the current state, and one platform mention creates a visible response or a specific actionable error.

6. Report next steps.
   Completion: tell the user what was configured, what still needs platform-side setup, and how to stop or uninstall.

## Local Paths

Default config:

```text
~/.config/opentag/config.json
```

Default state and isolated worktrees:

```text
~/.local/state/opentag
```

## Useful Commands

```bash
opentag setup
opentag start
opentag status
opentag doctor
opentag platforms
opentag executors
opentag config path
opentag config show
```

For local development inside the OpenTag repository:

```bash
corepack pnpm opentag-dev
opentag-dev setup
```
