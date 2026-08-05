# Contributing

## Running it

```
npm test
```

The suite builds throwaway git repositories under the temp directory and drives
the hooks as real subprocesses with real payloads. Nothing touches your own
settings files.

## Before opening a pull request

Run the suite on your platform. If you touch anything that handles a path,
say so in the description, because path handling is where this project has
broken before: an installer that substituted a Windows path into serialised
JSON, a directory walk that relied on a field missing in older Node, a
baseline file whose fingerprints were not portable between operating systems.
`tests/windows.test.js` covers that class of bug without needing a Windows
machine, so add to it rather than assuming your platform is the only one.

## Adding a detector

Detectors live in `hooks/lib/detect.js`. Each one needs:

- A confidence tier. `certain` means parsed rather than guessed, so a manifest
  entry or a named import qualifies and a regex over code shape does not.
  `likely` is structural. `heuristic` is shape matching.
- A replacement that exists. Naming a standard library function that shipped
  two versions after the one the project targets is worse than saying nothing.
- Two tests: one that fires, and one lookalike that must not.

The second test matters more than the first. A detector that cries wolf costs
more than the finding it caught, because the next real finding gets ignored.

## What does not belong here

Correctness bugs, security holes and performance are out of scope by design.
This tool looks for over-engineering and nothing else. Routing those elsewhere
is the point, not an omission.

Never flag a smoke test, a self check, validation at a trust boundary, error
handling that prevents data loss, or an accessibility attribute.

## Style

No comments in the code. Names carry the meaning, and a comment explaining a
line is usually a sign the line should be rewritten. Keep the tool smaller than
the problem it solves.
