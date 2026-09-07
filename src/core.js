(function (globalScope) {
  'use strict';

  var SECTION_PATHS = {
    conversation: '',
    commits: 'commits',
    checks: 'checks',
    changes: 'changes',
    files: 'files'
  };
  var TAB_LABELS = {
    conversation: 'Conversation',
    commits: 'Commits',
    checks: 'Checks',
    changes: 'Files changed'
  };
  var SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

  function asUrl(value) {
    if (value && typeof value === 'object' && typeof value.href === 'string') {
      return new URL(value.href);
    }
    return new URL(String(value));
  }

  function parsePullRequestLocation(value) {
    var url;
    try {
      url = asUrl(value || globalScope.location.href);
    } catch (error) {
      return null;
    }
    if (url.origin !== 'https://github.com') {
      return null;
    }

    var segments = url.pathname.split('/').slice(1);
    if (segments[segments.length - 1] === '') {
      segments.pop();
    }
    if (segments.length < 4 || segments[2] !== 'pull') {
      return null;
    }
    var owner = segments[0];
    var repo = segments[1];
    var number = segments[3];
    if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(repo) || !/^\d+$/.test(number)) {
      return null;
    }
    if (owner.indexOf('%') !== -1 || repo.indexOf('%') !== -1 || number.indexOf('%') !== -1) {
      return null;
    }

    var remaining = segments.slice(4);
    if (remaining.length > 1 || (remaining.length === 1 && !Object.prototype.hasOwnProperty.call(SECTION_PATHS, remaining[0]))) {
      return null;
    }
    var section = remaining[0] || 'conversation';
    return {
      owner: owner,
      repo: repo,
      number: number,
      section: section === 'files' ? 'changes' : section,
      path: '/'.concat(owner, '/').concat(repo, '/pull/').concat(number),
      url: url
    };
  }

  function classifySectionPath(pathname, pullPath) {
    if (typeof pathname !== 'string') {
      return null;
    }
    var path = pathname.replace(/\/+$/, '') || '/';
    var base = pullPath;
    if (!base) {
      var parsed = parsePullRequestLocation('https://github.com' + pathname);
      return parsed ? parsed.section : null;
    }
    base = base.replace(/\/+$/, '');
    if (path === base) {
      return 'conversation';
    }
    var suffix = path.slice(base.length + 1);
    if (path.indexOf(base + '/') !== 0 || suffix.indexOf('/') !== -1) {
      return null;
    }
    if (suffix === 'files') {
      return 'changes';
    }
    return Object.prototype.hasOwnProperty.call(TAB_LABELS, suffix) ? suffix : null;
  }

  function normalizedText(node) {
    return String(node && (node.textContent || node.innerText) || '').replace(/\s+/g, ' ').trim();
  }

  function isUsable(element) {
    if (!element || !element.isConnected || element.disabled || element.getAttribute('aria-disabled') === 'true') {
      return false;
    }
    if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) {
      return false;
    }
    return true;
  }

  function discoverNativeTabs(nav, locationValue) {
    var location = parsePullRequestLocation(locationValue || globalScope.location.href);
    if (!nav || !location || typeof nav.querySelectorAll !== 'function') {
      return [];
    }
    var currentSection = location.section;
    var links = nav.querySelectorAll('a[href]');
    var tabs = [];
    Array.prototype.forEach.call(links, function (link) {
      var href = link.getAttribute('href');
      if (!href) {
        return;
      }
      var target;
      try {
        target = new URL(href, 'https://github.com');
      } catch (error) {
        return;
      }
      if (target.origin !== 'https://github.com') {
        return;
      }
      var section = classifySectionPath(target.pathname, location.path);
      if (!section || tabs.some(function (tab) { return tab.section === section; })) {
        return;
      }
      tabs.push({
        section: section,
        label: TAB_LABELS[section],
        href: href,
        active: section === currentSection && (link.getAttribute('aria-current') === 'page' || section === currentSection)
      });
    });
    return tabs;
  }

  function findCommentTarget(documentNode, extensionRoot) {
    if (!documentNode || typeof documentNode.querySelector !== 'function') {
      return null;
    }
    var primary = documentNode.querySelector('#new_comment_field');
    if (isUsable(primary) && !(extensionRoot && extensionRoot.contains(primary))) {
      return primary;
    }
    var candidates = documentNode.querySelectorAll('textarea[name="comment[body]"]');
    for (var index = 0; index < candidates.length; index += 1) {
      var candidate = candidates[index];
      if (!isUsable(candidate) || (extensionRoot && extensionRoot.contains(candidate))) {
        continue;
      }
      if (!candidate.closest || !candidate.closest('[data-commenting], .js-inline-comment-form, [data-side="left"], [data-side="right"]')) {
        return candidate;
      }
    }
    return null;
  }

  function hasExactSubmitReviewLabel(button) {
    if (normalizedText(button) === 'Submit review') {
      return true;
    }
    var descendants = button.querySelectorAll ? button.querySelectorAll('*') : [];
    return Array.prototype.some.call(descendants, function (child) {
      return normalizedText(child) === 'Submit review';
    });
  }

  function findReviewTarget(documentNode, extensionRoot) {
    if (!documentNode || typeof documentNode.querySelectorAll !== 'function') {
      return null;
    }
    var headings = documentNode.querySelectorAll('h2');
    for (var index = 0; index < headings.length; index += 1) {
      var heading = headings[index];
      if (normalizedText(heading) !== 'Pull request toolbar' || !heading.closest) {
        continue;
      }
      var section = heading.closest('section');
      if (!section) {
        continue;
      }
      var buttons = section.querySelectorAll('button');
      var matches = Array.prototype.filter.call(buttons, function (button) {
        return isUsable(button) && !(extensionRoot && extensionRoot.contains(button)) &&
          !(button.closest && button.closest('[role="dialog"], dialog')) &&
          !(button.form || button.getAttribute('type') === 'submit') && hasExactSubmitReviewLabel(button);
      });
      return matches.length === 1 ? matches[0] : null;
    }
    return null;
  }

  function calculateScrollProgress(scrollTop, scrollHeight, clientHeight) {
    var maximum = Math.max(0, Number(scrollHeight) - Number(clientHeight));
    if (!maximum) {
      return 0;
    }
    return Math.round(Math.max(0, Math.min(1, Number(scrollTop) / maximum)) * 100);
  }

  var api = {
    parsePullRequestLocation: parsePullRequestLocation,
    classifySectionPath: classifySectionPath,
    discoverNativeTabs: discoverNativeTabs,
    findCommentTarget: findCommentTarget,
    findReviewTarget: findReviewTarget,
    calculateScrollProgress: calculateScrollProgress
  };
  globalScope.GitHubQuickviewCore = globalScope.GitHubQuickviewCore || api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
