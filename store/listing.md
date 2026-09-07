# Chrome Web Store listing

Copy-paste source for the dashboard. Assets are in `out/`, regenerate with `./render.sh`.

## Description

Paste into **Description**.

---
Long pull requests are hard to move around in. Once a review has a few rounds on it, the
tabs are far above you, the reply box is far below, and getting from one to the other means
scrolling past everything in between.

GitHub Quickview pins a small command bar to the bottom of every pull request. Conversation,
Commits, Checks and Files changed stay one click away, and the bar adds the action that
matters on the page you are actually looking at — jump to the comment box on a conversation,
open GitHub's own review control on a diff, or return to the header.

It is built for the keyboard. Every control leads with its shortcut, so the keys are visible
rather than hidden in a help screen:

• Option-C (Alt+C) — Conversation
• Option-F (Alt+F) — Files changed
• Option-M (Alt+M) — Comment
• Option-T (Alt+T) — Back to top

Shortcuts stay inert inside text fields, so they never fire while you are writing a review.
Reassign or disable them in Extension options. Preferences are saved on your device,
and open pull request tabs update immediately.

The bar also shows how far through the page you are, as a small meter rather than a number
you have to read.

WHAT IT DOES NOT DO

Quickview never posts, approves, merges or submits anything. It moves you to GitHub's own
controls and lets you press them yourself.

It requests only the storage permission to save your shortcut preferences locally. It
makes no network requests, so there is no analytics and no telemetry. It stores no page
content, cookies or identifiers. Its command bar runs only on github.com pull request pages.

There is no account and no setup. Install it and open a pull request.

OPEN SOURCE

MIT licensed and dependency free. The whole
extension is small enough to read before you trust it:
https://github.com/yingzhox/github-quickview
---

## Single purpose description

Paste into **Privacy practices → Single purpose**.

---
GitHub Quickview adds a navigation bar to GitHub pull request pages so that the pull
request's own sections and controls stay reachable without scrolling. That is its only
function.
---

## Permission justifications

The extension declares only the `storage` permission and no `host_permissions`. Its content
scripts are scoped to `https://github.com/*/*/pull/*`.

Storage justification:

---
Stores the user's keyboard shortcut assignments locally so they persist across browser
sessions. No page content or personal data is stored or transmitted.
---

If the dashboard asks to justify host access:

---
The extension's content script runs only on GitHub pull request pages, which is the only
place its navigation bar applies. It reads the page's existing navigation links and controls
in order to link to them, and does not read, collect or transmit any page content.
---

## Data usage disclosures

Tick **nothing**. Then certify all three:

- Not being sold to third parties
- Not being used or transferred for purposes unrelated to the item's single purpose
- Not being used or transferred to determine creditworthiness or for lending purposes

A privacy policy URL is not required while no data is collected. If the dashboard insists,
point it at the README's "Design and privacy" section.

## Field reference

| Field | Value |
| --- | --- |
| Category | Developer Tools |
| Language | English (United States) |
| Store icon | `out/icon-128.png` |
| Screenshots | `out/screenshot-1.jpg` … `screenshot-4.jpg` (1280×800) |
| Small promo tile | `out/promo-small.jpg` (440×280) |
| Marquee promo tile | `out/promo-marquee.jpg` (1400×560) |
| Package | `dist/github-quickview-0.5.0.zip` |
