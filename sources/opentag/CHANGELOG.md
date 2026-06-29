# Changelog

## v0.1.0 - 2026-06-24

Initial public v0 release of OpenTag.

### Added

- Core OpenTag event and run schemas
- GitHub issue and pull request comment mention normalization
- Slack app mention normalization
- Embeddable dispatcher package
- SQLite-backed store package
- Local daemon for polling and running assigned work
- Echo executor for local smoke tests
- Codex executor adapter
- GitHub and Slack callback helpers
- Local GitHub-to-echo smoke-test example
- Public `@opentag/*` npm package family

### Packages

- `@opentag/core`
- `@opentag/client`
- `@opentag/dispatcher`
- `@opentag/github`
- `@opentag/slack`
- `@opentag/store`
- `@opentag/runner`

### Notes

OpenTag is still a young v0 project. This release is intended for local evaluation, integration experiments, and early SDK feedback. Production multi-tenant dispatcher deployments need additional hardening.
