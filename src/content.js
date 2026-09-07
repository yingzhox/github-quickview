(function (globalScope) {
  'use strict';

  var core = globalScope.GitHubQuickviewCore;
  if (!core) {
    return;
  }

  var ROOT_ID = 'github-quickview';
  var navSelector = 'nav[aria-label="Pull request navigation"]';
  var shortcutTargets = {
    KeyC: '[data-gqv-section="conversation"]',
    KeyF: '[data-gqv-section="changes"]',
    KeyM: '[data-gqv-comment]',
    KeyT: '[data-gqv-top]'
  };

  function createController(options) {
    options = options || {};
    var documentNode = options.document || globalScope.document;
    var windowNode = options.window || globalScope.window;
    var getLocation = options.getLocation || function () { return windowNode.location; };
    if (!documentNode || !windowNode) {
      return { install: function () {}, refresh: function () {}, destroy: function () {} };
    }

    var root = null;
    var mutationObserver = null;
    var scheduled = false;
    var scrollScheduled = false;
    var destroyed = false;
    var installed = false;
    var lastUrl = '';
    var reviewDelegating = false;
    var reviewResetTimer = null;
    var hydrationTimer = null;
    var hydrationAttempts = 0;

    function getUrl() {
      var current = getLocation();
      return current && current.href ? current.href : String(current || '');
    }

    function removeRoot() {
      var roots = documentNode.querySelectorAll('#' + ROOT_ID);
      Array.prototype.forEach.call(roots, function (candidate) { candidate.remove(); });
      root = null;
    }

    function ensureRoot() {
      var roots = documentNode.querySelectorAll('#' + ROOT_ID);
      root = roots[0] || null;
      Array.prototype.slice.call(roots, 1).forEach(function (duplicate) { duplicate.remove(); });
      if (root) {
        return root;
      }
      root = documentNode.createElement('aside');
      root.id = ROOT_ID;
      root.className = 'gh-quickview';
      root.setAttribute('aria-label', 'GitHub Quickview');
      documentNode.body.appendChild(root);
      return root;
    }

    function scrollBehavior() {
      return windowNode.matchMedia && windowNode.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    }

    function scrollToComment() {
      var target = core.findCommentTarget(documentNode, root);
      if (!target) {
        return false;
      }
      target.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
      windowNode.requestAnimationFrame(function () { target.focus({ preventScroll: true }); });
      return true;
    }

    function isApplePlatform() {
      var platform = windowNode.navigator && windowNode.navigator.platform || '';
      return /Mac|iPhone|iPad|iPod/.test(platform);
    }

    function shortcutLabel(key) {
      return isApplePlatform() ? '⌥' + key : 'Alt+' + key;
    }

    function appendShortcut(control, key) {
      var hint = documentNode.createElement('kbd');
      hint.className = 'gh-quickview__shortcut';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = shortcutLabel(key);
      control.appendChild(hint);
    }

    function isTextEntry(element) {
      if (!element) {
        return false;
      }
      var tagName = String(element.tagName || '').toLowerCase();
      return tagName === 'input' || tagName === 'textarea' || tagName === 'select' ||
        element.isContentEditable || element.getAttribute && element.getAttribute('contenteditable') === 'true';
    }

    function onKeyDown(event) {
      if (!root || event.defaultPrevented || event.repeat || !event.altKey || event.shiftKey ||
          event.ctrlKey || event.metaKey || isTextEntry(event.target)) {
        return;
      }
      var selector = shortcutTargets[event.code];
      if (!selector) {
        return;
      }
      var control = root.querySelector(selector);
      if (!control && event.code === 'KeyM') {
        control = root.querySelector(shortcutTargets.KeyC);
      }
      if (!control) {
        return;
      }
      event.preventDefault();
      control.click();
    }

    function delegateReview() {
      if (reviewDelegating) {
        return;
      }
      var target = core.findReviewTarget(documentNode, root);
      if (!target) {
        return;
      }
      reviewDelegating = true;
      windowNode.requestAnimationFrame(function () {
        try {
          target.click();
        } finally {
          reviewResetTimer = windowNode.setTimeout(function () {
            reviewDelegating = false;
            reviewResetTimer = null;
          }, 400);
        }
      });
    }

    function updateProgress() {
      if (!root) {
        return;
      }
      var progress = core.calculateScrollProgress(windowNode.scrollY, documentNode.documentElement.scrollHeight, windowNode.innerHeight);
      var indicator = root.querySelector('[data-gqv-progress]');
      if (indicator) {
        indicator.textContent = progress + '%';
        indicator.setAttribute('aria-label', 'Page position ' + progress + '%');
      }
      root.style.setProperty('--gqv-progress', progress + '%');
    }

    function onScroll() {
      if (scrollScheduled) {
        return;
      }
      scrollScheduled = true;
      windowNode.requestAnimationFrame(function () {
        scrollScheduled = false;
        updateProgress();
      });
    }

    function render(nav, location) {
      var tabs = core.discoverNativeTabs(nav, location.url);
      if (!tabs.length) {
        removeRoot();
        return;
      }
      var dock = ensureRoot();
      dock.replaceChildren();

      var tabsNav = documentNode.createElement('nav');
      tabsNav.className = 'gh-quickview__tabs';
      tabsNav.setAttribute('aria-label', 'Pull request sections');
      tabs.forEach(function (tab) {
        var link = documentNode.createElement('a');
        link.className = 'gh-quickview__tab' + (tab.active ? ' is-active' : '');
        link.setAttribute('data-gqv-section', tab.section);
        var href = tab.href;
        var shortcutKey = tab.section === 'conversation' ? 'C' : tab.section === 'changes' ? 'F' : '';
        if (tab.section === 'conversation') {
          var conversationUrl = new URL(tab.href, 'https://github.com');
          conversationUrl.hash = 'new_comment_field';
          href = conversationUrl.pathname + conversationUrl.search + conversationUrl.hash;
        }
        link.setAttribute('href', href);
        link.setAttribute('aria-label', tab.label + (shortcutKey ? ', shortcut ' + shortcutLabel(shortcutKey) : ''));
        var fullLabel = documentNode.createElement('span');
        fullLabel.className = 'gh-quickview__label-full';
        fullLabel.setAttribute('aria-hidden', 'true');
        fullLabel.textContent = tab.label;
        link.appendChild(fullLabel);
        var shortLabel = documentNode.createElement('span');
        shortLabel.className = 'gh-quickview__label-short';
        shortLabel.setAttribute('aria-hidden', 'true');
        shortLabel.textContent = tab.section === 'conversation' ? 'Chat' :
          tab.section === 'changes' ? 'Files' : tab.label;
        link.appendChild(shortLabel);
        if (shortcutKey) {
          appendShortcut(link, shortcutKey);
        }
        if (tab.active) {
          link.setAttribute('aria-current', 'page');
        }
        if (tab.section === 'conversation') {
          link.addEventListener('click', function (event) {
            var current = core.parsePullRequestLocation(getLocation());
            var plainClick = event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
            if (plainClick && current && current.section === 'conversation' && core.findCommentTarget(documentNode, dock)) {
              event.preventDefault();
              scrollToComment();
            }
          });
        }
        tabsNav.appendChild(link);
      });
      dock.appendChild(tabsNav);

      var controls = documentNode.createElement('div');
      controls.className = 'gh-quickview__controls';
      var commentTarget = location.section === 'conversation' && core.findCommentTarget(documentNode, dock);
      var reviewTarget = location.section === 'changes' && core.findReviewTarget(documentNode, dock);
      if (commentTarget || reviewTarget) {
        var action = documentNode.createElement('button');
        action.type = 'button';
        action.className = 'gh-quickview__action';
        action.textContent = commentTarget ? 'Comment' : 'Review';
        action.setAttribute(commentTarget ? 'data-gqv-comment' : 'data-gqv-review', '');
        action.setAttribute('aria-label', commentTarget ? 'Jump to comment composer' : 'Open GitHub submit review');
        if (commentTarget) {
          appendShortcut(action, 'M');
        }
        controls.appendChild(action);
      }

      var topButton = documentNode.createElement('button');
      topButton.type = 'button';
      topButton.className = 'gh-quickview__top';
      topButton.setAttribute('data-gqv-top', '');
      topButton.setAttribute('aria-label', 'Back to top');
      var topLabel = documentNode.createElement('span');
      topLabel.textContent = '↑ Top';
      topButton.appendChild(topLabel);
      appendShortcut(topButton, 'T');
      controls.appendChild(topButton);

      var progressOutput = documentNode.createElement('output');
      progressOutput.className = 'gh-quickview__progress';
      progressOutput.setAttribute('data-gqv-progress', '');
      progressOutput.setAttribute('aria-label', 'Page position 0%');
      progressOutput.textContent = '0%';
      controls.appendChild(progressOutput);
      dock.appendChild(controls);

      var comment = dock.querySelector('[data-gqv-comment]');
      var review = dock.querySelector('[data-gqv-review]');
      dock.querySelector('[data-gqv-top]').addEventListener('click', function () {
        windowNode.scrollTo({ top: 0, behavior: scrollBehavior() });
      });
      if (comment) {
        comment.addEventListener('click', scrollToComment);
      }
      if (review) {
        review.addEventListener('click', delegateReview);
      }
      updateProgress();
    }

    function stopMutationObserver() {
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
    }

    function observeNavMutations(nav) {
      if (!windowNode.MutationObserver) {
        return;
      }
      if (!mutationObserver) {
        mutationObserver = new windowNode.MutationObserver(scheduleRefresh);
      } else {
        mutationObserver.disconnect();
      }
      mutationObserver.observe(nav, { childList: true, subtree: true });
      var parent = nav.parentElement;
      if (parent && parent !== documentNode.body && parent !== documentNode.documentElement) {
        mutationObserver.observe(parent, { childList: true });
      }
    }

    function clearHydrationRetry() {
      if (hydrationTimer !== null && windowNode.clearTimeout) {
        windowNode.clearTimeout(hydrationTimer);
      }
      hydrationTimer = null;
    }

    function scheduleHydrationRetry() {
      if (hydrationTimer !== null || hydrationAttempts >= 8 || !windowNode.setTimeout) {
        return;
      }
      hydrationAttempts += 1;
      hydrationTimer = windowNode.setTimeout(function () {
        hydrationTimer = null;
        scheduleRefresh();
      }, 250);
    }

    function refresh() {
      scheduled = false;
      if (destroyed) {
        return;
      }
      var currentUrl = getUrl();
      if (currentUrl !== lastUrl) {
        hydrationAttempts = 0;
      }
      lastUrl = currentUrl;
      var location = core.parsePullRequestLocation(getLocation());
      if (!location) {
        clearHydrationRetry();
        stopMutationObserver();
        removeRoot();
        return;
      }
      var nav = documentNode.querySelector(navSelector);
      if (!nav) {
        stopMutationObserver();
        removeRoot();
        scheduleHydrationRetry();
        return;
      }
      clearHydrationRetry();
      hydrationAttempts = 0;
      render(nav, location);
      observeNavMutations(nav);
    }

    function scheduleRefresh() {
      if (!scheduled) {
        scheduled = true;
        windowNode.requestAnimationFrame(refresh);
      }
    }

    function install() {
      if (installed || destroyed || !documentNode.body) {
        return;
      }
      installed = true;
      ['turbo:load', 'turbo:render', 'pjax:end', 'popstate'].forEach(function (eventName) {
        windowNode.addEventListener(eventName, scheduleRefresh);
      });
      windowNode.addEventListener('scroll', onScroll, { passive: true });
      windowNode.addEventListener('keydown', onKeyDown);
      refresh();
    }

    function destroy() {
      destroyed = true;
      clearHydrationRetry();
      if (reviewResetTimer !== null && windowNode.clearTimeout) {
        windowNode.clearTimeout(reviewResetTimer);
      }
      stopMutationObserver();
      ['turbo:load', 'turbo:render', 'pjax:end', 'popstate'].forEach(function (eventName) {
        windowNode.removeEventListener(eventName, scheduleRefresh);
      });
      windowNode.removeEventListener('scroll', onScroll);
      windowNode.removeEventListener('keydown', onKeyDown);
      removeRoot();
    }

    return {
      install: install,
      start: install,
      refresh: scheduleRefresh,
      destroy: destroy,
      updateProgress: updateProgress
    };
  }

  var contentApi = globalScope.GitHubQuickviewContent || {};
  contentApi.createController = createController;
  globalScope.GitHubQuickviewContent = contentApi;

  if (globalScope.document && globalScope.window && globalScope.document.body &&
      core.parsePullRequestLocation(globalScope.window.location)) {
    if (globalScope.GitHubQuickview && typeof globalScope.GitHubQuickview.destroy === 'function') {
      globalScope.GitHubQuickview.destroy();
    }
    var controller = createController();
    globalScope.GitHubQuickview = controller;
    controller.install();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
