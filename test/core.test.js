const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateScrollProgress,
  classifySectionPath,
  discoverNativeTabs,
  findCommentTarget,
  findReviewTarget,
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

test("calculateScrollProgress clamps and handles short pages", () => {
  assert.equal(calculateScrollProgress(0, 1000, 500), 0);
  assert.equal(calculateScrollProgress(250, 1000, 500), 50);
  assert.equal(calculateScrollProgress(1000, 1000, 500), 100);
  assert.equal(calculateScrollProgress(-10, 1000, 500), 0);
  assert.equal(calculateScrollProgress(0, 400, 500), 0);
});
