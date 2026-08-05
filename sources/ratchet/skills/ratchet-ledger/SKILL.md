---
name: ratchet-ledger
description: >
  Reports what the ratchet actually measured in this repository: the session
  ledger at .ratchet/ledger.jsonl, the accepted complexity mark, and every
  `ratchet:` shortcut comment left in the code with its ceiling and its
  upgrade trigger. Use when the user says "ratchet ledger", "/ratchet-ledger",
  "what did we defer", "show the complexity trend", "what shortcuts are in
  here", or asks whether the codebase is getting simpler or more complex over
  time. Reports real recorded numbers only, never estimates.
---

# Ratchet ledger

Three sections. Real numbers only.

## 1. Trend

Read `.ratchet/ledger.jsonl`, one JSON object per finished session. Report
the last ten: date, mode, lines added, new dependencies, findings by tag, and
the repository line count at the end of that session.

Show the direction plainly. If the line count has risen for three sessions in
a row, say so.

If the file is missing, say the ratchet is not initialised for this repository
and that `mkdir .ratchet` turns it on. Do not invent a trend.

## 2. Mark

Read `.ratchet/mark.json`, the accepted high water mark. Compare it to the
repository now.

Below or equal to the mark: `At the mark.` Above it: report the gap and the
reason recorded on the mark, then ask whether to bring it down or accept a
new mark with a written reason.

## 3. Shortcuts

```
grep -rnE '(#|//|--) ?ratchet:' . --exclude-dir=node_modules --exclude-dir=.git
```

One row per hit, grouped by file:

```
<file>:<line> <what was simplified>. ceiling: <the limit>. upgrade: <the trigger>.
```

The convention is `ratchet: <ceiling>, <upgrade path>`, so both fields come
straight out of the comment. Any marker with no upgrade trigger gets tagged
`no-trigger`, those are the ones that rot silently.

End with `<N> shortcuts, <M> with no trigger.`

## Honesty

Every number here is read from a file or counted from the tree. Never report
what a session "saved": the version that was not written was never written,
so there is nothing to subtract from. The trend and the shortcut count are
the real figures, and they are enough.

Reports only. Changes nothing unless asked to write the report to a file.
