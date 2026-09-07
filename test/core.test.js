const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateScrollProgress,
  classifySectionPath,
  discoverNativeTabs,
  findCommentTarget,
  findReviewTarget,
  findRefreshTarget,
  parsePullRequestLocation,
} = require("../src/core.js");

function usableElement(overrides = {}) {
  return {
    disabled: false,
    form: null,
    isConnected: true,
    textContent: "",
    closest: () => null,
    getAttribute: () => null,
    getClientRects: () => [{}],
    querySelectorAll: () => [],
    ...overrides,
  };
}

function refreshFixture(options = {}) {
  const attributes = {
    href: "/octo/repo/pull/123/changes",
    "data-refresh-button-visible": "true",
    "data-loading": "false",
    ...options.attributes,
  };
  const main = {};
  const section = {
    querySelectorAll: () => [{
      textContent: options.heading || "Pull request toolbar",
      closest: () => section,
    }],
  };
  const candidate = usableElement({
    textContent: "Refresh",
    getAttribute: (name) => attributes[name] ?? null,
    closest: (selector) => {
      if (selector === "section") return options.inToolbar === false ? null : section;
      if (selector === 'main, [role="main"]') return options.inMain === false ? null : main;
      return options.blockedAncestor || null;
    },
    ...options.element,
  });
  const documentNode = {
    defaultView: { getComputedStyle: () => ({ visibility: "visible", display: "block", ...options.style }) },
    querySelectorAll: (selector) => {
      assert.equal(selector, 'a[data-refresh-button-visible="true"][href]');
      return [candidate];
    },
  };
  return { candidate, documentNode };
}

test("parsePullRequestLocation accepts exact GitHub PR sections", () => {
  const conversation = parsePullRequestLocation("https://github.com/octo/repo/pull/123");
  assert.deepEqual(
    { owner: conversation.owner, repo: conversation.repo, number: conversation.number, section: conversation.section },
    { owner: "octo", repo: "repo", number: "123", section: "conversation" },
  );
  assert.equal(parsePullRequestLocation("https://github.com/octo/repo/pull/123/changes").section, "changes");
  assert.equal(parsePullRequestLocation("https://github.com/octo/repo/pull/123/files/").section, "changes");
  assert.equal(parsePullRequestLocation("https://github.com/octo/repo/pull/123/commits?after=abc").section, "commits");
});

test("parsePullRequestLocation rejects unsafe origins and non-canonical paths", () => {
  const rejected = [
    "http://github.com/octo/repo/pull/123",
    "https://gist.github.com/octo/repo/pull/123",
    "https://github.com/octo/repo/pull/not-a-number",
    "https://github.com/octo/%72epo/pull/123",
    "https://github.com/octo/repo/pull/123/changes/extra",
    "https://github.com/octo/repo/issues/123",
    "https://github.com//repo/pull/123",
  ];

  for (const url of rejected) assert.equal(parsePullRequestLocation(url), null, url);
});

test("classifySectionPath recognizes both Files changed routes", () => {
  const base = "/octo/repo/pull/123";
  assert.equal(classifySectionPath(base, base), "conversation");
  assert.equal(classifySectionPath(`${base}/commits/`, base), "commits");
  assert.equal(classifySectionPath(`${base}/checks`, base), "checks");
  assert.equal(classifySectionPath(`${base}/changes`, base), "changes");
  assert.equal(classifySectionPath(`${base}/files`, base), "changes");
  assert.equal(classifySectionPath(`${base}/files/extra`, base), null);
  assert.equal(classifySectionPath("/other/repo/pull/123", base), null);
});

test("discoverNativeTabs preserves native hrefs, order, and current section", () => {
  const links = [
    ["/octo/repo/pull/123", null],
    ["/octo/repo/pull/123/commits", null],
    ["/octo/repo/pull/123/checks", null],
    ["/octo/repo/pull/123/changes?diff=split", "page"],
    ["/octo/repo/issues/123", null],
  ].map(([href, current]) => ({
    getAttribute(name) {
      if (name === "href") return href;
      if (name === "aria-current") return current;
      return null;
    },
  }));
  const nav = { querySelectorAll: () => links };
  const tabs = discoverNativeTabs(nav, "https://github.com/octo/repo/pull/123/changes");

  assert.deepEqual(tabs.map(({ section, href, active }) => ({ section, href, active })), [
    { section: "conversation", href: "/octo/repo/pull/123", active: false },
    { section: "commits", href: "/octo/repo/pull/123/commits", active: false },
    { section: "checks", href: "/octo/repo/pull/123/checks", active: false },
    { section: "changes", href: "/octo/repo/pull/123/changes?diff=split", active: true },
  ]);
});

test("findCommentTarget prefers the primary field and skips unusable fields", () => {
  const fallback = usableElement();
  const disabledPrimary = usableElement({ disabled: true });
  const documentNode = {
    querySelector: () => disabledPrimary,
    querySelectorAll: () => [usableElement({ isConnected: false }), fallback],
  };

  assert.equal(findCommentTarget(documentNode), fallback);
  assert.equal(findCommentTarget({ querySelector: () => fallback, querySelectorAll: () => [] }), fallback);
});

test("findReviewTarget requires one usable toolbar candidate", () => {
  const exactLabel = usableElement({ textContent: "Submit review" });
  const reviewButton = usableElement({
    textContent: "Submit reviewReview",
    querySelectorAll: () => [exactLabel],
  });
  const section = { querySelectorAll: () => [reviewButton] };
  const heading = usableElement({ textContent: "Pull request toolbar", closest: () => section });
  const documentNode = { querySelectorAll: (selector) => selector === "h2" ? [heading] : [] };

  assert.equal(findReviewTarget(documentNode), reviewButton);
  section.querySelectorAll = () => [reviewButton, usableElement({ textContent: "Submit review" })];
  assert.equal(findReviewTarget(documentNode), null);
  section.querySelectorAll = () => [usableElement({ textContent: "Submit review", disabled: true })];
  assert.equal(findReviewTarget(documentNode), null);
});

test("findRefreshTarget accepts the native Files changed refresh link and legacy files route", () => {
  for (const route of ["changes", "files"]) {
    const { candidate, documentNode } = refreshFixture({ attributes: { href: `/octo/repo/pull/123/${route}?diff=split` } });
    assert.equal(findRefreshTarget(documentNode, null, `https://github.com/octo/repo/pull/123/${route}`), candidate);
  }
});

test("findRefreshTarget accepts an explicit Conversation refresh marker in the PR main region", () => {
  const { candidate, documentNode } = refreshFixture({
    attributes: { href: "/octo/repo/pull/123" },
    inToolbar: false,
  });
  assert.equal(findRefreshTarget(documentNode, null, "https://github.com/octo/repo/pull/123"), candidate);

  const outsideMain = refreshFixture({ attributes: { href: "/octo/repo/pull/123" }, inMain: false });
  assert.equal(findRefreshTarget(outsideMain.documentNode, null, "https://github.com/octo/repo/pull/123"), null);
});

test("findRefreshTarget ignores hidden, disabled, loading, disconnected, or extension controls", () => {
  const rejected = [
    { attributes: { "data-refresh-button-visible": "false" } },
    { attributes: { "data-refresh-button-visible": null } },
    { attributes: { disabled: "" } },
    { attributes: { "aria-disabled": "true" } },
    { attributes: { "data-loading": "true" } },
    { attributes: { "aria-busy": "true" } },
    { element: { disabled: true } },
    { element: { isConnected: false } },
    { element: { getClientRects: () => [] } },
    { blockedAncestor: {} },
    { style: { display: "none" } },
    { style: { visibility: "hidden" } },
    { style: { visibility: "collapse" } },
  ];
  for (const options of rejected) {
    const { documentNode } = refreshFixture(options);
    assert.equal(findRefreshTarget(documentNode, null, "https://github.com/octo/repo/pull/123/changes"), null, JSON.stringify(options));
  }
  const { candidate, documentNode } = refreshFixture();
  assert.equal(findRefreshTarget(documentNode, { contains: (node) => node === candidate }, "https://github.com/octo/repo/pull/123/changes"), null);
});

test("findRefreshTarget rejects unrelated Refresh links, unsafe scopes, and destinations", () => {
  const rejected = [
    { inToolbar: false },
    { heading: "User comment" },
    { attributes: { "data-refresh-button-visible": null } },
    { attributes: { href: "https://example.com/octo/repo/pull/123/changes" } },
    { attributes: { href: "https://gist.github.com/octo/repo/pull/123/changes" } },
    { attributes: { href: "http://github.com/octo/repo/pull/123/changes" } },
    { attributes: { href: "/octo/repo/pull/124/changes" } },
    { attributes: { href: "/other/repo/pull/123/changes" } },
    { attributes: { href: "/octo/repo/pull/123" } },
    { attributes: { href: "/octo/repo/pull/123/checks" } },
    { attributes: { href: "/octo/repo/pull/123/changes/extra" } },
    { attributes: { href: "/octo/repo/pull/123/changes#discussion_r1" } },
    { attributes: { href: "javascript:alert(1)" } },
    { attributes: { href: "http://[" } },
  ];
  for (const options of rejected) {
    const { documentNode } = refreshFixture(options);
    assert.equal(findRefreshTarget(documentNode, null, "https://github.com/octo/repo/pull/123/changes"), null, JSON.stringify(options));
  }
  const { documentNode } = refreshFixture();
  for (const location of ["https://github.com/octo/repo/pull/123/commits", "https://github.com/octo/repo/pull/123/checks", "https://example.com/octo/repo/pull/123/changes"]) {
    assert.equal(findRefreshTarget(documentNode, null, location), null, location);
  }
});

test("findRefreshTarget excludes comments, diffs, forms, dialogs, and hidden ancestors", () => {
  for (const ancestor of ['[hidden]', '[inert]', '[aria-hidden="true"]', '[aria-disabled="true"]', '[aria-busy="true"]', '[data-loading="true"]', 'form', 'dialog', '[role="dialog"]', '.markdown-body', '.js-comment-body', '.js-comment', '.comment-body', '.js-inline-comment-form', '[data-commenting]', '.diff-table', '[data-diff-anchor]', 'pre', 'code']) {
    const { documentNode, candidate } = refreshFixture();
    const closest = candidate.closest;
    candidate.closest = (selector) => selector.split(", ").includes(ancestor) ? {} : closest(selector);
    assert.equal(findRefreshTarget(documentNode, null, "https://github.com/octo/repo/pull/123/changes"), null, ancestor);
  }
});

test("findRefreshTarget requires exactly one usable native refresh candidate", () => {
  const first = refreshFixture();
  const second = refreshFixture();
  first.documentNode.querySelectorAll = () => [first.candidate, second.candidate];
  assert.equal(findRefreshTarget(first.documentNode, null, "https://github.com/octo/repo/pull/123/changes"), null);
  second.candidate.disabled = true;
  assert.equal(findRefreshTarget(first.documentNode, null, "https://github.com/octo/repo/pull/123/changes"), first.candidate);
  first.documentNode.querySelectorAll = () => [];
  assert.equal(findRefreshTarget(first.documentNode, null, "https://github.com/octo/repo/pull/123/changes"), null);
});

test("calculateScrollProgress clamps and handles short pages", () => {
  assert.equal(calculateScrollProgress(0, 1000, 500), 0);
  assert.equal(calculateScrollProgress(250, 1000, 500), 50);
  assert.equal(calculateScrollProgress(1000, 1000, 500), 100);
  assert.equal(calculateScrollProgress(-10, 1000, 500), 0);
  assert.equal(calculateScrollProgress(0, 400, 500), 0);
});
