# GitHub Trending Site Fix Tasks

## Context
Working dir: `/root/repos/github-trending/`
Repo: `classmatexiaoming96-ux/github-trending`
GitHub Pages: https://classmatexiaoming96-ux.github.io/github-trending/

## Issue 1: kimi-code.html missing OpenClaw in site-index nav

**File:** `kimi-code.html`
**Problem:** The `<nav class="site-index">` section (lines 20-33) has 6 links but is MISSING the OpenClaw entry. index.html has all 7 links including OpenClaw. kimi-code.html should match.

**Current kimi-code.html site-index links (6 total, MISSING OpenClaw):**
- CodeGraph → index.html#cg
- Understand-Anything → index.html#ua
- Claude Plugins → index.html#cp
- OpenHuman Memory Tree → index.html#oh
- Kimi Code → index.html#kc
- Odysseus → index.html#od

**Should also have (the 7th, currently missing):**
```html
<a href="index.html#oc">🗂 OpenClaw<br><span>全渠道 · 个人 AI 助手</span></a>
```

**Fix:** Add the OpenClaw link to the site-index nav in kimi-code.html, between the Kimi Code and Odysseus entries (or at the end). Use `index.html#oc` as href.

Also verify the tab buttons section (lines 40-47) already has `data-tab="oc"` — if not, add it.

## Issue 2: Garbled/mojibake text on the page

**Problem:** User reports garbled text appearing on the page. Possible causes:
- HTML entity encoding issue (&lt; &gt; &amp; rendered literally)
- CSS not loading (styles.css path issue)
- Font not loading causing fallback font to show wrong characters
- Chinese text being double-encoded

**Investigation steps:**
1. Check browser console for errors: look for 404s on CSS/font files, JS errors
2. View page source and check if HTML entities are properly decoded
3. Check if `./assets/styles.css` path is correct (should be `./styles.css` based on repo structure)
4. Check for any literal `&lt;` `&gt;` `&amp;` strings in the HTML that should be `<` `>` `&`
5. Check for UTF-8 BOM or encoding issues in the HTML files

**Known paths in repo:**
- CSS: `./styles.css` (root level, not `./assets/styles.css`)
- HTML files are at root level

**Fix approach:**
- If CSS path wrong: update the `<link href="./assets/styles.css">` to correct path
- If HTML entities: find and replace the literal strings
- If encoding: ensure all HTML files have `<meta charset="utf-8" />` at top

## Deliverables
1. Patch kimi-code.html to add OpenClaw link to site-index nav
2. Investigate and fix the garbled text issue
3. Commit and push each fix separately with descriptive commit messages
4. Verify on GitHub Pages after each fix

## Permission mode
Use `--permission-mode acceptEdits`. When Claude Code pauses at "Allow this action?", send "2" + Enter via tmux to batch-approve all.
