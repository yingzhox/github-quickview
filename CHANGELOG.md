# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-09-07

### Added

- An opt-in Auto refresh toggle on Files changed and Conversation. The setting is
  saved locally and updates open PR tabs. It activates GitHub's native refresh signal
  once per update, pauses for editors, drafts, and dialogs, and stops on other routes.

### Changed

- The existing storage permission now saves auto-refresh preferences as well as shortcuts.

## [0.5.0] - 2026-09-07

### Added

- Extension options for reassigning or disabling each keyboard shortcut, with duplicate
  detection and a restore-defaults action. Preferences are stored locally and update
  shortcuts and key hints in open pull request tabs immediately.
- Shortcuts can use a single letter or number, with optional modifier keys.

### Changed

- Requests the `storage` permission for shortcut preferences only.
- Controls without shortcuts keep readable labels on narrow screens.

## [0.4.0] - 2026-09-07

### Fixed

- The dock now re-renders when GitHub routes between pull request sections. Its view is
  built with `history.pushState`, which fires none of the `turbo:load`, `turbo:render`,
  `pjax:end` or `popstate` events the extension listened for, and the navigation observer
  ignored attribute changes — so moving from Conversation to Files changed left the dock
  showing the previous section, including a **Comment** button with no composer to jump to.
  Chrome's Navigation API is now the primary signal, and the observer also watches
  `aria-current`.
- The current section is marked with a tinted ring so it is no longer mistakable for a
  hovered one.

### Changed

- Redesigned the dock as a keyboard-first command bar: monospace type, the shortcut key set
  first and bright, and the label trailing in lowercase.
- The bar now keeps one terminal palette in both GitHub themes instead of following Primer
  color variables, so it reads as a command surface rather than as page chrome.
- Reading position is drawn as a ten-cell meter instead of a percentage string. The
  percentage is still reported through the progress control's accessible name.
- Labels now degrade in three steps as the window narrows — full, short, then keys alone.

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

[Unreleased]: https://github.com/yingzhox/github-quickview/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/yingzhox/github-quickview/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/yingzhox/github-quickview/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/yingzhox/github-quickview/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/yingzhox/github-quickview/releases/tag/v0.3.0
