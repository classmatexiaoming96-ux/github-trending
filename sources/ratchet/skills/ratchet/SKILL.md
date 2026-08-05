---
name: ratchet
description: >
  Enforces a measured complexity budget on coding work. Reaches for the
  standard library, native platform features and code that already exists in
  the repository before writing anything new, and treats every added
  dependency, file and line as a cost that has to be justified. A hook
  measures the real diff and reports overruns back mid-task, so the budget is
  a number, not a mood. Use this on ANY coding task: writing, refactoring,
  fixing, reviewing, choosing libraries, or designing an interface. Use it
  whenever the user says "ratchet", "keep it minimal", "simplest thing that
  works", "yagni", "don't over-engineer", "smallest diff", or complains about
  bloat, boilerplate, scaffolding or dependency creep. Do not use it for
  non-coding requests.
argument-hint: "[advise|guard|strict|off]"
license: MIT
---

# Ratchet

A ratchet turns one way. The complexity of this codebase goes down or stays
flat unless someone deliberately turns it the other way and says why.

## Understand first, then shorten

The budget applies to the solution, never to the reading. Before choosing an
approach, read the code the change touches and trace the actual flow end to
end, including the callers you did not open. A small diff in the wrong place
is not a small change, it is a second bug that is now harder to find.

Say plainly when you do not yet understand something well enough to shorten
it. That sentence costs less than a confident wrong patch.

## The ladder

Stop at the first rung that holds.

1. **Does this need to exist?** Speculative need, no user, no ticket: skip it and say so in one line.
2. **Does this repository already have it?** A helper, a type, a pattern, a migration that already does this job. Search before writing. Reimplementing something that lives three files over is the single most common failure.
3. **Does the standard library cover it?** Name the function and use it.
4. **Does a native platform feature cover it?** `<input type="date">` over a picker library, `<dialog>` over a modal library, a CSS property over a JS listener, a database constraint over application code.
5. **Does an already-installed dependency cover it?** Use it. Never add a new one for something a handful of lines can do.
6. **Can it be one line?** Then it is one line.
7. **Otherwise:** the minimum that works.

## Bugs

A report names a symptom. Find the function every affected path routes
through and fix it once. Grep the callers before editing: one guard in the
shared function is both the correct fix and the smaller diff, and patching
only the path named in the ticket leaves the sibling callers broken.

## Costs that have to be justified

Each of these is measured by the hook and reported back to you. None of them
is forbidden. All of them need a reason stated in the same response.

- A new dependency. Say what in the standard library or the platform fails to cover it.
- A new file. Say why an existing file is the wrong home.
- An interface, abstract class or protocol with one implementation.
- A function whose body only forwards to another function.
- A configuration value nothing reads.
- Going over the session line budget, which counts net lines. Deleting fifty lines buys you fifty.

Findings arrive graded, and the grade tells you how much to trust them:

- `certain` is parsed, not guessed. A dependency name read out of a manifest, an import of a named package. Treat it as fact.
- `likely` is structural. A function that forwards and nothing else, an interface with one implementation. Usually right, occasionally reading a stub or a deliberate seam.
- `heuristic` is shape matching. Often right, sometimes catching a lookalike. Judge it on the code in front of you.

When a finding is wrong, say so in one line and move on. It is a detector, not
an authority. What is not acceptable is silently ignoring a flag.

When it is wrong for a reason that will keep being true, silence it where it
lives rather than arguing every time:

```
// ratchet-ignore: profiled, the clone is the hot path
const copy = JSON.parse(JSON.stringify(frame));
```

That covers the line the comment sits on and the line after it. A repository
that has been baselined already ignores everything that existed before the
ratchet was installed, so anything you see is something this session did.

## Marking a deliberate shortcut

When you knowingly ship something with a ceiling, mark it where it lives:

```
# ratchet: single global lock, split per account if write throughput matters
```

The comment names the ceiling and the trigger to revisit. `/ratchet-ledger`
collects these, so a deferral cannot quietly become permanent.

## Where the budget does not apply

Never trade these away for a smaller diff:

- Input validation at trust boundaries.
- Error handling on paths where failure loses or corrupts data.
- Security controls, including the boring ones.
- Accessibility basics: labels, focus order, contrast, keyboard reachability.
- Calibration and tolerance for real hardware. A clock drifts, a sensor reads off, the physical world does not match the datasheet.
- Anything the user explicitly asked for. If they want the full version after hearing the smaller one, build it and stop arguing.
- One runnable check per piece of non-trivial logic: an `assert` based self check or a single small test file. The smallest thing that fails when the logic breaks. No frameworks, no fixtures, no suite per function. Trivial one-liners need none.

## Output

Code first. Then at most three short lines: what you left out, and the
condition that should bring it back. If the explanation runs longer than the
code, the explanation is the thing to cut. A paragraph defending a
simplification is complexity smuggled back in as prose.

Explanation the user asked for is not overhead. Give it in full.

## Modes

| Mode | New files | New deps | Added lines | On overrun |
|------|-----------|----------|-------------|------------|
| **advise** | 8 | 3 | 400 | findings only |
| **guard** | 3 | 1 | 150 | findings and budget warnings |
| **strict** | 1 | 0 | 60 | blocked on a `certain` finding or an overrun |

Default is `guard`. Switch with `/ratchet advise|guard|strict|off`. Per
project overrides live in `.ratchet/config.json`.

## Boundaries

Ratchet governs what gets built, not how you talk. Off with `stop ratchet`.
