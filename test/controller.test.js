const test = require("node:test");
const assert = require("node:assert/strict");

global.GitHubQuickviewCore = require("../src/core.js");
require("../src/content.js");

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.nodeType = 1;
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = "";
    this.disabled = false;
    this.form = null;
    this.hidden = false;
    this.isConnected = false;
    this._textContent = "";
    this.style = { setProperty: (name, value) => { this.style[name] = value; } };
  }

  get id() { return this.attributes.get("id") || ""; }
  set id(value) { this.attributes.set("id", String(value)); }
  get textContent() { return this._textContent + this.children.map((child) => child.textContent).join(""); }
  set textContent(value) { this._textContent = String(value); this.children = []; }
  get innerText() { return this.textContent; }
  set innerText(value) { this.textContent = value; }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "class") this.className = String(value);
  }

  getAttribute(name) {
    if (name === "class") return this.className || null;
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  appendChild(child) {
    child.parentElement = this;
    setConnected(child, this.isConnected);
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    for (const child of this.children) setConnected(child, false);
    this.children = [];
    for (const child of children) this.appendChild(child);
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    }
    setConnected(this, false);
    this.parentElement = null;
  }

  contains(candidate) {
    return this === candidate || this.children.some((child) => child.contains(candidate));
  }

  matches(selector) { return matchesSelector(this, selector); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = [];
    walk(this, (element) => {
      if (element !== this && matchesSelector(element, selector)) matches.push(element);
    });
    return matches;
  }

  closest(selector) {
    for (let element = this; element; element = element.parentElement) {
      if (matchesSelector(element, selector)) return element;
    }
    return null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  click() {
    this.clicks = (this.clicks || 0) + 1;
    const event = {
      altKey: false,
      button: 0,
      ctrlKey: false,
      currentTarget: this,
      defaultPrevented: false,
      metaKey: false,
      preventDefault() { this.defaultPrevented = true; },
      shiftKey: false,
      target: this,
    };
    for (const listener of this.listeners.get("click") || []) listener(event);
  }

  focus() { this.ownerDocument.activeElement = this; }
  scrollIntoView() { this.scrolledIntoView = true; }
  getClientRects() { return this.hidden ? [] : [{}]; }
}

function setConnected(element, connected) {
  element.isConnected = connected;
  for (const child of element.children) setConnected(child, connected);
}

function walk(element, visit) {
  visit(element);
  for (const child of element.children) walk(child, visit);
}

function matchesSelector(element, selector) {
  return selector.split(",").some((part) => {
    const value = part.trim();
    if (value === "*") return true;
    if (value.startsWith("#")) return element.id === value.slice(1);
    if (value.startsWith(".")) return element.className.split(/\s+/).includes(value.slice(1));
    const match = value.match(/^([a-z0-9]+)?\[([^=\]]+)(?:="([^"]*)")?\]$/i);
    if (match) {
      const [, tag, attribute, expected] = match;
      if (tag && element.tagName !== tag.toUpperCase()) return false;
      const actual = element.getAttribute(attribute);
      return expected === undefined ? actual !== null : actual === expected;
    }
    return element.tagName === value.toUpperCase();
  });
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement("html", this);
    this.documentElement.scrollHeight = 2000;
    this.body = new FakeElement("body", this);
    this.documentElement.appendChild(this.body);
    setConnected(this.documentElement, true);
    this.activeElement = null;
  }

  createElement(tagName) { return new FakeElement(tagName, this); }
  querySelector(selector) { return this.documentElement.querySelector(selector); }
  querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
}

class FakeWindow {
  constructor() {
    this.innerHeight = 1000;
    this.scrollY = 0;
    this.listeners = new Map();
    this.frames = [];
    this.timers = [];
    this.intersectionObservers = [];
    this.mutationObservers = [];
    this.navigator = { platform: "MacIntel" };
    const owner = this;
    this.IntersectionObserver = class {
      constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; owner.intersectionObservers.push(this); }
      observe(target) { this.targets.push(target); }
      disconnect() { this.disconnected = true; this.targets = []; }
      emit(isIntersecting) { this.callback([{ isIntersecting }]); }
    };
    this.MutationObserver = class {
      constructor(callback) { this.callback = callback; this.observations = []; this.disconnected = false; owner.mutationObservers.push(this); }
      observe(target, options) { this.disconnected = false; this.observations.push({ target, options }); }
      disconnect() { this.disconnected = true; this.observations = []; }
      emit(records = []) { if (!this.disconnected) this.callback(records); }
    };
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== listener));
  }
  dispatch(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener(event); }
  requestAnimationFrame(callback) { this.frames.push(callback); return this.frames.length; }
  flushFrames() { while (this.frames.length) this.frames.splice(0).forEach((callback) => callback()); }
  setTimeout(callback) { this.timers.push(callback); return this.timers.length; }
  clearTimeout() {}
  flushTimers() { while (this.timers.length) this.timers.splice(0).forEach((callback) => callback()); }
  matchMedia() { return { matches: true }; }
  scrollTo({ top }) { this.scrollY = top; }
}

function append(parent, tagName, attributes = {}, text = "") {
  const element = parent.ownerDocument.createElement(tagName);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function buildFixture({ withTabs = true } = {}) {
  const document = new FakeDocument();
  const window = new FakeWindow();
  const main = append(document.body, "main");
  const nav = append(main, "nav", { "aria-label": "Pull request navigation" });
  if (withTabs) addTabs(nav);
  const toolbar = append(main, "section");
  append(toolbar, "h2", {}, "Pull request toolbar");
  const nativeReview = append(toolbar, "button", { type: "button" });
  append(nativeReview, "span", {}, "Submit review");
  append(nativeReview, "span", {}, "Review");
  nativeReview.clickCount = 0;
  nativeReview.addEventListener("click", () => { nativeReview.clickCount += 1; });
  const comment = append(main, "textarea", { id: "new_comment_field", name: "comment[body]" });
  return { document, window, main, nav, nativeReview, comment };
}

function addTabs(nav) {
  for (const suffix of ["", "/commits", "/checks", "/changes"]) {
    append(nav, "a", { href: `/octo/repo/pull/123${suffix}` });
  }
}

function createFixtureController(fixture, getLocation) {
  return global.GitHubQuickviewContent.createController({
    document: fixture.document,
    window: fixture.window,
    getLocation,
  });
}

test("controller observes only the native nav boundary and disconnects off PR routes", () => {
  const fixture = buildFixture();
  let location = new URL("https://github.com/octo/repo/pull/123/changes");
  const controller = createFixtureController(fixture, () => location);
  controller.start();

  const observer = fixture.window.mutationObservers.at(-1);
  assert.ok(observer);
  assert.equal(observer.observations.some(({ target }) => target === fixture.document.documentElement), false);
  assert.deepEqual(observer.observations.map(({ target }) => target), [fixture.nav, fixture.main]);

  location = new URL("https://github.com/octo/repo/issues/123");
  fixture.window.dispatch("turbo:load");
  fixture.window.flushFrames();
  assert.equal(fixture.document.querySelectorAll("#github-quickview").length, 0);
  assert.equal(observer.disconnected, true);

  controller.destroy();
});

test("controller recovers when an initially empty native nav hydrates", () => {
  const fixture = buildFixture({ withTabs: false });
  const controller = createFixtureController(fixture, () => new URL("https://github.com/octo/repo/pull/123/changes"));
  controller.start();
  assert.equal(fixture.document.querySelectorAll("#github-quickview").length, 0);

  addTabs(fixture.nav);
  fixture.window.mutationObservers.at(-1).emit([{ addedNodes: fixture.nav.children }]);
  fixture.window.flushFrames();
  assert.equal(fixture.document.querySelectorAll("#github-quickview").length, 1);

  controller.destroy();
});

test("controller keeps one dock and delegates a rapid review activation once", () => {
  const fixture = buildFixture();
  const controller = createFixtureController(fixture, () => new URL("https://github.com/octo/repo/pull/123/changes"));
  controller.start();

  const root = fixture.document.querySelector("#github-quickview");
  const review = root.querySelector("[data-gqv-review]");
  review.click();
  review.click();
  fixture.window.flushFrames();
  assert.equal(fixture.nativeReview.clickCount, 1);

  const duplicate = append(fixture.document.body, "aside", { id: "github-quickview" });
  assert.equal(duplicate.isConnected, true);
  fixture.window.dispatch("turbo:render");
  fixture.window.flushFrames();
  assert.equal(fixture.document.querySelectorAll("#github-quickview").length, 1);

  controller.destroy();
});

test("dock stays visible while the native pull request navigation is visible", () => {
  const fixture = buildFixture();
  const controller = createFixtureController(fixture, () => new URL("https://github.com/octo/repo/pull/123/changes"));
  controller.start();

  const root = fixture.document.querySelector("#github-quickview");
  assert.equal(root.hidden, false);
  assert.equal(fixture.window.intersectionObservers.length, 0);
  fixture.window.intersectionObservers.at(-1)?.emit(true);
  assert.equal(root.hidden, false);

  controller.destroy();
});

test("conversation loads in place, then its dock link explicitly opens the composer", () => {
  const fixture = buildFixture();
  const controller = createFixtureController(fixture, () => new URL("https://github.com/octo/repo/pull/123"));
  controller.start();

  assert.equal(fixture.window.scrollY, 0);
  assert.equal(fixture.comment.scrolledIntoView, undefined);
  assert.equal(fixture.document.activeElement, null);

  const conversation = fixture.document.querySelector("#github-quickview").querySelector('[data-gqv-section="conversation"]');
  assert.equal(conversation.getAttribute("href"), "/octo/repo/pull/123#new_comment_field");
  conversation.click();
  fixture.window.flushFrames();
  assert.equal(fixture.comment.scrolledIntoView, true);
  assert.equal(fixture.document.activeElement, fixture.comment);

  controller.destroy();
});

test("keyboard shortcuts activate Conversation, Files changed, Comment, and Top controls", () => {
  const fixture = buildFixture();
  const controller = createFixtureController(fixture, () => new URL("https://github.com/octo/repo/pull/123"));
  controller.start();
  const root = fixture.document.querySelector("#github-quickview");
  const conversation = root.querySelector('[data-gqv-section="conversation"]');
  const files = root.querySelector('[data-gqv-section="changes"]');
  const comment = root.querySelector("[data-gqv-comment]");
  const top = root.querySelector("[data-gqv-top]");

  assert.equal(conversation.querySelector("kbd").textContent, "⌥C");
  assert.equal(files.querySelector("kbd").textContent, "⌥F");
  assert.equal(comment.querySelector("kbd").textContent, "⌥M");
  assert.equal(top.querySelector("kbd").textContent, "⌥T");

  fixture.window.dispatch("keydown", { altKey: true, shiftKey: false, code: "KeyC", target: fixture.document.body, preventDefault() {} });
  fixture.window.dispatch("keydown", { altKey: true, shiftKey: false, code: "KeyF", target: fixture.document.body, preventDefault() {} });
  fixture.window.dispatch("keydown", { altKey: true, shiftKey: false, code: "KeyM", target: fixture.document.body, preventDefault() {} });
  fixture.window.scrollY = 800;
  fixture.window.dispatch("keydown", { altKey: true, shiftKey: false, code: "KeyT", target: fixture.document.body, preventDefault() {} });
  fixture.window.flushFrames();

  assert.equal(conversation.clicks, 1);
  assert.equal(files.clicks, 1);
  assert.equal(fixture.comment.scrolledIntoView, true);
  assert.equal(fixture.window.scrollY, 0);

  fixture.window.dispatch("keydown", { altKey: true, shiftKey: true, code: "KeyC", target: fixture.document.body, preventDefault() {} });
  assert.equal(conversation.clicks, 1);

  fixture.comment.scrolledIntoView = false;
  fixture.window.dispatch("keydown", { altKey: true, shiftKey: false, code: "KeyM", target: fixture.comment, preventDefault() {} });
  assert.equal(fixture.comment.scrolledIntoView, false);

  controller.destroy();
});
