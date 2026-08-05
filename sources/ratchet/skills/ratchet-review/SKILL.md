---
name: ratchet-review
description: >
  Reviews a diff or a whole repository for over-engineering only, and returns
  a delete list rather than prose. Finds reinvented standard library calls,
  dependencies the platform already covers, abstractions with one
  implementation, wrappers that only forward, configuration nothing reads and
  dead flexibility. Use whenever the user says "review for over-engineering",
  "what can we delete", "is this over-engineered", "find the bloat", "audit
  this repo", or invokes /ratchet-review. Pair it with a normal correctness
  review, it deliberately does not look for bugs.
---

# Ratchet review

Return findings, not opinions. One line each. The best outcome for a diff is
getting shorter.

## Scope

Run `git diff` for a change under review, or walk the tree for a whole
repository audit. Rank by lines removable, largest first.

Before reporting a finding, confirm the replacement actually exists in this
project: the standard library version for this language version, the native
feature for the browsers or runtime this project targets, the helper at the
path you are naming. A finding that does not compile is worse than no
finding.

## Format

```
<path>:<line> <tag>: <what to cut>. <what replaces it>.
```

Tags:

- `exists` the repository already has this. Give the path.
- `stdlib` the standard library ships this. Name the function.
- `native` the platform does this. Name the feature.
- `yagni` one implementation, one caller, or nothing reads it.
- `wrapper` forwards to another function and adds nothing.
- `shrink` same behaviour, fewer lines. Show the shorter form.

## Examples

Not this: "The EmailValidator class may be more complex than strictly
necessary, and you might consider whether all of these rules are needed."

This:

```
src/validate.js:12 stdlib: 27-line email validator. One "@" check, real validation is the confirmation mail.
src/date.js:4 native: moment imported for one format call. Intl.DateTimeFormat.
src/repo.py:88 yagni: AbstractRepository, one implementation. Inline until a second exists.
src/api.ts:52 wrapper: fetchUser forwards to client.get. Call client.get directly.
src/group.js:30 shrink: manual reduce builds the map. Object.groupBy.
```

Group findings under `certain`, `likely` and `heuristic` so the reader knows
which ones to act on without checking. State the grade honestly: a regex shape
match is not a parsed fact, and calling it one costs you the next finding's
credibility.

End with `net: -<N> lines, -<M> dependencies.` Nothing to cut: `Lean. Ship it.`

`npx ratchet-agent audit` produces the deterministic half of this list in a
second. Run it first, then read the code for what regexes cannot see.

## Out of scope

Correctness, security and performance belong in a normal review. Never flag a
smoke test or a self check for deletion, those are the minimum, not bloat.
Never flag validation at a trust boundary, error handling that prevents data
loss, or an accessibility attribute.

Lists findings. Applies nothing unless asked.
