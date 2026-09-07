# GitHub Quickview

A small, dependency-free Chrome extension for pull requests that have grown too long to navigate comfortably—especially PRs with repeated agent review rounds.

An always-visible compact dock sits at the bottom of every supported pull request. It keeps Conversation, Commits, Checks, and Files changed one click away and adds the action that matters on the current page:

- **Conversation** goes directly to the comment composer when clicked; an ordinary page load keeps its original scroll position.
- **Comment** jumps to and focuses GitHub's native comment composer.
- **Review** opens GitHub's native Submit review control.
- **Back to top** returns to the PR header.

The extension never posts, approves, merges, or sends data itself.

## Shortcuts

Shortcuts work outside text fields, so they never interfere while you are writing a comment.

| Action | macOS | Windows/Linux |
| --- | --- | --- |
| Conversation | `⌥C` | `Alt+C` |
| Files changed | `⌥F` | `Alt+F` |
| Comment | `⌥M` | `Alt+M` |
| Back to top | `⌥T` | `Alt+T` |

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository folder.
5. Open or refresh a GitHub pull request.

## Design and privacy

- Manifest V3 content script only—no background worker.
- No requested runtime permissions, storage, analytics, network calls, or remote code.
- Runs only on `https://github.com/*/*/pull/*`.
- Uses GitHub's native navigation links and controls rather than recreating review actions.
- Uses GitHub Primer color variables, so it follows light and dark themes.
- Avoids GitHub's generated CSS-module class names and fails safely if expected semantic markup is unavailable.

## Development

No install step is required.

```sh
npm test
npm run check
npm run fixture
```

The fixture is available at `http://127.0.0.1:4173/octo/repo/pull/123/changes`. It uses the production controller with an injected GitHub-like location so the dock can be exercised without installing the extension.

## Scope

Version 0.3 targets `github.com` pull-request Conversation, Commits, Checks, Files changed (`/changes`), and compatibility Files (`/files`) routes. GitHub Enterprise hosts and direct comment/review submission are intentionally out of scope.
