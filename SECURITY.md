# Security Policy

## Supported versions

Only the most recent release receives fixes.

| Version | Supported |
| --- | --- |
| 0.4.x | Yes |
| < 0.4 | No |

## Reporting a vulnerability

Please report security issues privately rather than in a public issue.

Use [GitHub's private vulnerability reporting](https://github.com/yingzhox/github-quickview/security/advisories/new)
for this repository. Expect an initial response within seven days.

Please include the affected version, the browser and operating system, and the steps
needed to reproduce the problem.

## Threat model

GitHub Quickview is a Manifest V3 content script that runs only on
`https://github.com/*/*/pull/*`. It requests no runtime permissions and has no
background worker, storage, analytics, network calls, or remote code. It never posts,
approves, merges, or transmits data.

Because it runs inside the GitHub page, the findings most worth reporting are:

- Any path where the extension injects unsanitized page content into the DOM.
- Any path where it activates a control the user did not ask for, particularly one that
  submits a comment, review, approval, or merge.
- Any way to make it run outside its declared `matches` pattern.
