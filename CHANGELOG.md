# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-09-07

First public release. Earlier versions were developed privately and never published.

### Added

- Always-visible compact dock on `https://github.com/*/*/pull/*`, linking Conversation,
  Commits, Checks, and Files changed.
- Context-aware actions: **Comment** focuses GitHub's native composer, **Review** opens the
  native Submit review control, and **Back to top** returns to the PR header.
- Keyboard shortcuts that stay inert inside text fields, so they never interrupt typing:
  `⌥C` / `Alt+C` (Conversation), `⌥F` / `Alt+F` (Files changed), `⌥M` / `Alt+M` (Comment),
  and `⌥T` / `Alt+T` (Back to top).
- Support for both the `/changes` and legacy `/files` Files changed routes.
- Theme-aware styling built on GitHub Primer color variables.
- Local fixture server (`npm run fixture`) that exercises the production controller against
  GitHub-like markup without installing the extension.

### Security

- Manifest V3 content script only: no background worker, no requested runtime permissions,
  no storage, no network calls, and no remote code.
- The extension never posts, approves, merges, or transmits data.

[Unreleased]: https://github.com/yingzhox/github-quickview/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/yingzhox/github-quickview/releases/tag/v0.3.0
