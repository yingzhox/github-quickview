(function (globalScope) {
  'use strict';

  var core = globalScope.GitHubQuickviewCore;
  var shortcutSettings = globalScope.GitHubQuickviewShortcuts;
  if (!core || !shortcutSettings) {
    return;
  }

  var ROOT_ID = 'github-quickview';
  var AUTO_REFRESH_KEY = 'autoRefresh';
  var AUTO_REFRESH_DELAY = 1500;
  var navSelector = 'nav[aria-label="Pull request navigation"]';
  var NAVIGATION_EVENTS = ['turbo:load', 'turbo:render', 'pjax:end', 'popstate'];

  var shortcutTargets = {
    conversation: '[data-gqv-section="conversation"]',
    changes: '[data-gqv-section="changes"]',
    comment: '[data-gqv-comment]',
    top: '[data-gqv-top]'
  };

  function createController(options) {
    options = options || {};
    var documentNode = options.document || globalScope.document;
    var windowNode = options.window || globalScope.window;
    var getLocation = options.getLocation || function () { return windowNode.location; };
    var storage = options.storage || globalScope.chrome && globalScope.chrome.storage;
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
    var shortcuts = shortcutSettings.normalize();
    var shortcutsReady = !storage;
    var settingsRevision = 0;
    var autoRefresh = false;
    var autoRefreshReady = !storage;
    var autoRefreshRevision = 0;
    var autoRefreshSaving = false;
    var autoRefreshError = false;
    var autoRefreshTimer = null;
    var autoRefreshPage = '';
    var refreshHandled = false;

    function onSettingsChanged(changes, area) {
      if (destroyed || area !== 'local') {
        return;
      }
      if (changes[shortcutSettings.STORAGE_KEY]) {
        settingsRevision += 1;
        shortcuts = shortcutSettings.normalize(changes[shortcutSettings.STORAGE_KEY].newValue);
        shortcutsReady = true;
        scheduleRefresh();
      }
      if (changes[AUTO_REFRESH_KEY]) {
        autoRefreshRevision += 1;
        autoRefresh = changes[AUTO_REFRESH_KEY].newValue === true;
        autoRefreshReady = true;
        autoRefreshError = false;
        updateAutoRefreshControl();
        syncAutoRefresh();
      }
    }

    async function loadAutoRefresh() {
      var revision = autoRefreshRevision;
      var saved;
      try {
        saved = await storage.local.get(AUTO_REFRESH_KEY);
      } catch (error) {
        saved = {};
      }
      if (!destroyed && revision === autoRefreshRevision) {
        autoRefresh = saved[AUTO_REFRESH_KEY] === true;
        autoRefreshReady = true;
        updateAutoRefreshControl();
        syncAutoRefresh();
      }
    }

    function updateAutoRefreshControl() {
      var control = root && root.querySelector('[data-gqv-auto-refresh]');
      if (!control || destroyed) {
        return;
      }
      control.disabled = !autoRefreshReady || autoRefreshSaving;
      control.setAttribute('aria-pressed', String(autoRefresh));
      control.setAttribute('aria-label', autoRefreshError ? 'Auto refresh could not be saved. Try again.' : 'Auto refresh');
      control.setAttribute('title', autoRefreshError ? 'Could not save auto refresh. Click to try again.' :
        'Refresh when GitHub reports new changes. Pauses while editing or a dialog is open. Saved on this device.');
      control.querySelector('[data-gqv-auto-state]').textContent = autoRefreshError ? 'retry' : autoRefresh ? 'on' : 'off';
    }

    async function toggleAutoRefresh() {
      if (!autoRefreshReady || autoRefreshSaving || destroyed) {
        return;
      }
      var nextValue = !autoRefresh;
      var revision = autoRefreshRevision;
      autoRefreshSaving = true;
      autoRefreshError = false;
      updateAutoRefreshControl();
      syncAutoRefresh();
      try {
        if (storage) {
          var saved = {};
          saved[AUTO_REFRESH_KEY] = nextValue;
          await storage.local.set(saved);
        }
        if (!destroyed && revision === autoRefreshRevision) {
          autoRefresh = nextValue;
        }
      } catch (error) {
        autoRefreshError = true;
      } finally {
        autoRefreshSaving = false;
        updateAutoRefreshControl();
        syncAutoRefresh();
      }
    }

    function refreshIsPaused() {
      if (isTextEntry(documentNode.activeElement)) {
        return true;
      }
      var dialogs = documentNode.querySelectorAll('[role="dialog"], dialog');
      if (Array.prototype.some.call(dialogs, function (dialog) { return dialog.getClientRects().length > 0; })) {
        return true;
      }
      var editors = documentNode.querySelectorAll('textarea, [contenteditable="true"], [contenteditable="plaintext-only"]');
      return Array.prototype.some.call(editors, function (editor) {
        // Preview tabs may hide a draft's textarea. Include it when its form
        // remains visible, but ignore GitHub's dormant hidden edit forms.
        var visible = editor.getClientRects().length > 0 || editor.form && editor.form.getClientRects().length > 0;
        var value = editor.tagName === 'TEXTAREA' ? editor.value : editor.textContent;
        return visible && String(value || '').trim().length > 0;
      });
    }

    function stopAutoRefresh() {
      if (autoRefreshTimer !== null) {
        windowNode.clearTimeout(autoRefreshTimer);
        autoRefreshTimer = null;
      }
    }

    function syncAutoRefresh() {
      var location = core.parsePullRequestLocation(getLocation());
      var page = location ? location.url.pathname + location.url.search : '';
      if (page !== autoRefreshPage || !autoRefresh) {
        autoRefreshPage = page;
        refreshHandled = false;
      }
      if (destroyed || !root || !autoRefreshReady || !autoRefresh || autoRefreshSaving || !location ||
          (location.section !== 'changes' && location.section !== 'conversation')) {
        stopAutoRefresh();
        return;
      }
      if (autoRefreshTimer !== null) {
        return;
      }
      // Read GitHub's update signal periodically; this makes no network
      // requests and avoids observing every mutation in a large diff.
      autoRefreshTimer = windowNode.setTimeout(function () {
        autoRefreshTimer = null;
        checkAutoRefresh();
        syncAutoRefresh();
      }, AUTO_REFRESH_DELAY);
    }

    function checkAutoRefresh() {
      var location = core.parsePullRequestLocation(getLocation());
      if (destroyed || !root || !autoRefresh || autoRefreshSaving || !location ||
          (location.section !== 'changes' && location.section !== 'conversation')) {
        return;
      }
      var page = location.url.pathname + location.url.search;
      if (page !== autoRefreshPage) {
        autoRefreshPage = page;
        refreshHandled = false;
      }
      // Wait for the signal to clear before handling another update, even
      // if React replaces the link or temporarily marks it as loading.
      if (!documentNode.querySelector('[data-refresh-button-visible="true"]')) {
        refreshHandled = false;
      }
      if (refreshHandled || refreshIsPaused()) {
        return;
      }
      var target = core.findRefreshTarget(documentNode, root, location.url);
      if (target) {
        refreshHandled = true;
        target.click();
      }
    }

    async function loadShortcuts() {
      var revision = settingsRevision;
      var saved;
      try {
        saved = await storage.local.get(shortcutSettings.STORAGE_KEY);
      } catch (error) {
        // Keep the defaults usable if extension storage is unavailable.
        saved = {};
      }
      if (!destroyed && revision === settingsRevision) {
        shortcuts = shortcutSettings.normalize(saved[shortcutSettings.STORAGE_KEY]);
        shortcutsReady = true;
        scheduleRefresh();
      }
    }

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

    function shortcutLabel(action) {
      return shortcutSettings.label(shortcuts[action], isApplePlatform());
    }

    // Added before the label rather than after it: the command bar leads
    // with the shortcut and lets the word explain it.
    function addShortcut(control, action) {
      var label = shortcutLabel(action);
      if (!label) {
        control.className += ' gh-quickview__no-shortcut';
        return;
      }
      control.setAttribute('aria-keyshortcuts', shortcuts[action]);
      var hint = documentNode.createElement('kbd');
      hint.className = 'gh-quickview__shortcut';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = label;
      control.appendChild(hint);
    }

    function renderMeter(indicator, progress) {
      var on = indicator.querySelector('[data-gqv-meter-on]');
      var off = indicator.querySelector('[data-gqv-meter-off]');
      if (!on || !off) {
        return;
      }
      var filled = Math.round(progress / 10);
      on.textContent = new Array(filled + 1).join('\u2588');
      off.textContent = new Array(10 - filled + 1).join('\u2591');
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
      if (!root || !shortcutsReady || event.defaultPrevented || event.repeat || isTextEntry(event.target)) {
        return;
      }
      var shortcut = shortcutSettings.fromEvent(event);
      var action = shortcut && Object.keys(shortcutTargets).find(function (id) {
        return shortcuts[id] === shortcut;
      });
      if (!action) {
        return;
      }
      var control = root.querySelector(shortcutTargets[action]);
      if (!control && action === 'comment') {
        control = root.querySelector(shortcutTargets.conversation);
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
        renderMeter(indicator, progress);
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

      var prompt = documentNode.createElement('span');
      prompt.className = 'gh-quickview__prompt';
      prompt.setAttribute('aria-hidden', 'true');
      prompt.textContent = '\u203a';
      dock.appendChild(prompt);

      var tabsNav = documentNode.createElement('nav');
      tabsNav.className = 'gh-quickview__tabs';
      tabsNav.setAttribute('aria-label', 'Pull request sections');
      tabs.forEach(function (tab) {
        var link = documentNode.createElement('a');
        link.className = 'gh-quickview__tab' + (tab.active ? ' is-active' : '');
        link.setAttribute('data-gqv-section', tab.section);
        var href = tab.href;
        var shortcut = shortcutLabel(tab.section);
        if (tab.section === 'conversation') {
          var conversationUrl = new URL(tab.href, 'https://github.com');
          conversationUrl.hash = 'new_comment_field';
          href = conversationUrl.pathname + conversationUrl.search + conversationUrl.hash;
        }
        link.setAttribute('href', href);
        link.setAttribute('aria-label', tab.label + (shortcut ? ', shortcut ' + shortcut : ''));
        addShortcut(link, tab.section);
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

      var divider = documentNode.createElement('span');
      divider.className = 'gh-quickview__divider';
      divider.setAttribute('aria-hidden', 'true');
      dock.appendChild(divider);

      var controls = documentNode.createElement('div');
      controls.className = 'gh-quickview__controls';
      var commentTarget = location.section === 'conversation' && core.findCommentTarget(documentNode, dock);
      var reviewTarget = location.section === 'changes' && core.findReviewTarget(documentNode, dock);
      if (commentTarget || reviewTarget) {
        var action = documentNode.createElement('button');
        action.type = 'button';
        action.className = 'gh-quickview__action';
        action.setAttribute(commentTarget ? 'data-gqv-comment' : 'data-gqv-review', '');
        action.setAttribute('aria-label', commentTarget ? 'Jump to comment composer' : 'Open GitHub submit review');
        if (commentTarget) {
          addShortcut(action, 'comment');
        }
        var actionLabel = documentNode.createElement('span');
        actionLabel.setAttribute('aria-hidden', 'true');
        actionLabel.textContent = commentTarget ? 'Comment' : 'Review';
        action.appendChild(actionLabel);
        controls.appendChild(action);
      }

      var topButton = documentNode.createElement('button');
      topButton.type = 'button';
      topButton.className = 'gh-quickview__top';
      topButton.setAttribute('data-gqv-top', '');
      topButton.setAttribute('aria-label', 'Back to top');
      addShortcut(topButton, 'top');
      var topLabel = documentNode.createElement('span');
      topLabel.setAttribute('aria-hidden', 'true');
      topLabel.textContent = 'Top';
      topButton.appendChild(topLabel);
      controls.appendChild(topButton);

      if (location.section === 'changes' || location.section === 'conversation') {
        var autoButton = documentNode.createElement('button');
        autoButton.type = 'button';
        autoButton.className = 'gh-quickview__auto-refresh';
        autoButton.setAttribute('data-gqv-auto-refresh', '');
        var autoLabel = documentNode.createElement('span');
        autoLabel.setAttribute('aria-hidden', 'true');
        autoLabel.textContent = 'Auto';
        autoButton.appendChild(autoLabel);
        var refreshLabel = documentNode.createElement('span');
        refreshLabel.className = 'gh-quickview__label-full';
        refreshLabel.setAttribute('aria-hidden', 'true');
        refreshLabel.textContent = 'refresh';
        autoButton.appendChild(refreshLabel);
        var autoState = documentNode.createElement('span');
        autoState.setAttribute('data-gqv-auto-state', '');
        autoState.setAttribute('aria-hidden', 'true');
        autoButton.appendChild(autoState);
        autoButton.addEventListener('click', toggleAutoRefresh);
        controls.appendChild(autoButton);
      }

      var progressOutput = documentNode.createElement('output');
      progressOutput.className = 'gh-quickview__progress';
      progressOutput.setAttribute('data-gqv-progress', '');
      progressOutput.setAttribute('aria-label', 'Page position 0%');
      var meterOn = documentNode.createElement('span');
      meterOn.className = 'gh-quickview__meter-on';
      meterOn.setAttribute('data-gqv-meter-on', '');
      meterOn.setAttribute('aria-hidden', 'true');
      progressOutput.appendChild(meterOn);
      var meterOff = documentNode.createElement('span');
      meterOff.className = 'gh-quickview__meter-off';
      meterOff.setAttribute('data-gqv-meter-off', '');
      meterOff.setAttribute('aria-hidden', 'true');
      progressOutput.appendChild(meterOff);
      controls.appendChild(progressOutput);
      dock.appendChild(controls);
      updateAutoRefreshControl();

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
      mutationObserver.observe(nav, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-current', 'aria-selected', 'href']
      });
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
        syncAutoRefresh();
        return;
      }
      var nav = documentNode.querySelector(navSelector);
      if (!nav) {
        stopMutationObserver();
        removeRoot();
        syncAutoRefresh();
        scheduleHydrationRetry();
        return;
      }
      clearHydrationRetry();
      hydrationAttempts = 0;
      render(nav, location);
      observeNavMutations(nav);
      syncAutoRefresh();
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
      if (storage) {
        storage.onChanged.addListener(onSettingsChanged);
        loadShortcuts();
        loadAutoRefresh();
      }
      NAVIGATION_EVENTS.forEach(function (eventName) {
        windowNode.addEventListener(eventName, scheduleRefresh);
      });
      // GitHub's pull request view routes with history.pushState, which
      // fires none of the events above: popstate only covers back and
      // forward. Chrome's Navigation API is the one signal that reports a
      // same-document route change, so without it the dock keeps whatever
      // section it first rendered.
      if (windowNode.navigation && windowNode.navigation.addEventListener) {
        windowNode.navigation.addEventListener('navigate', scheduleRefresh);
      }
      windowNode.addEventListener('scroll', onScroll, { passive: true });
      windowNode.addEventListener('keydown', onKeyDown);
      refresh();
    }

    function destroy() {
      destroyed = true;
      if (storage && installed) {
        storage.onChanged.removeListener(onSettingsChanged);
      }
      clearHydrationRetry();
      stopAutoRefresh();
      if (reviewResetTimer !== null && windowNode.clearTimeout) {
        windowNode.clearTimeout(reviewResetTimer);
      }
      stopMutationObserver();
      NAVIGATION_EVENTS.forEach(function (eventName) {
        windowNode.removeEventListener(eventName, scheduleRefresh);
      });
      if (windowNode.navigation && windowNode.navigation.removeEventListener) {
        windowNode.navigation.removeEventListener('navigate', scheduleRefresh);
      }
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
