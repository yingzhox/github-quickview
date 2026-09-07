const test = require("node:test");
const assert = require("node:assert/strict");

global.GitHubQuickviewCore = require("../src/core.js");
global.GitHubQuickviewShortcuts = require("../src/shortcuts.js");
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
    const match = value.match(/^([a-z0-9]+)?((?:\[[^\]]+\])+)$/i);
    if (match) {
      const [, tag, attributes] = match;
      if (tag && element.tagName !== tag.toUpperCase()) return false;
      return [...attributes.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)].every(([, attribute, expected]) => {
        const actual = element.getAttribute(attribute);
        return expected === undefined ? actual !== null : actual === expected;
      });
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
    // Chrome's Navigation API, which is what actually reports GitHub's
    // same-document pushState routing.
    this.navigation = {
      listeners: new Map(),
      addEventListener(type, listener) {
        const list = this.listeners.get(type) || [];
        list.push(listener);
        this.listeners.set(type, list);
      },
      removeEventListener(type, listener) {
        this.listeners.set(type, (this.listeners.get(type) || []).filter((i) => i !== listener));
      },
      dispatch(type, event = {}) {
        for (const listener of this.listeners.get(type) || []) listener(event);
      },
    };
    this.frames = [];
    this.timers = new Map();
    this.nextTimer = 0;
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
  setTimeout(callback) { const id = ++this.nextTimer; this.timers.set(id, callback); return id; }
  clearTimeout(id) { this.timers.delete(id); }
  flushTimers() {
    const pending = [...this.timers];
    for (const [id, callback] of pending) {
      if (this.timers.delete(id)) callback();
    }
  }
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

function createFixtureController(fixture, getLocation, options = {}) {
  return global.GitHubQuickviewContent.createController({
    document: fixture.document,
    window: fixture.window,
    getLocation,
    ...options,
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

test("controls lead with the shortcut key and follow it with the label", () => {
  const fixture = buildFixture();
  const location = new URL("https://github.com/octo/repo/pull/123/changes");
  createFixtureController(fixture, () => location).start();

  const root = fixture.document.querySelector("#github-quickview");
  assert.equal(root.children[0].className, "gh-quickview__prompt");

  const conversation = root.querySelector('[data-gqv-section="conversation"]');
  assert.equal(conversation.children[0].tagName, "KBD");
  assert.equal(conversation.children[0].textContent, "⌥C");
  assert.equal(conversation.children[1].className, "gh-quickview__label-full");

  const top = root.querySelector("[data-gqv-top]");
  assert.equal(top.children[0].tagName, "KBD");
  assert.equal(top.children[1].textContent, "Top");
});

test("scroll progress renders as a ten-cell meter and still reports a percentage", () => {
  const fixture = buildFixture();
  const location = new URL("https://github.com/octo/repo/pull/123/changes");
  createFixtureController(fixture, () => location).start();

  const root = fixture.document.querySelector("#github-quickview");
  const progress = root.querySelector("[data-gqv-progress]");
  const on = progress.querySelector("[data-gqv-meter-on]");
  const off = progress.querySelector("[data-gqv-meter-off]");

  // Empty at rest, but still ten cells wide so the bar does not resize.
  assert.equal(on.textContent, "");
  assert.equal(off.textContent, "░".repeat(10));
  assert.equal(progress.getAttribute("aria-label"), "Page position 0%");

  // 800 of a 1000px scrollable range.
  fixture.window.scrollY = 800;
  fixture.window.dispatch("scroll");
  fixture.window.flushFrames();

  assert.equal(on.textContent, "█".repeat(8));
  assert.equal(off.textContent, "░".repeat(2));
  assert.equal(on.textContent.length + off.textContent.length, 10);
  assert.equal(progress.getAttribute("aria-label"), "Page position 80%");
  assert.equal(root.style["--gqv-progress"], "80%");
});

test("dock re-renders when GitHub routes between sections without a turbo event", () => {
  const fixture = buildFixture();
  let location = new URL("https://github.com/octo/repo/pull/123");
  const controller = createFixtureController(fixture, () => location);
  controller.start();

  const dock = () => fixture.document.querySelector("#github-quickview");
  assert.ok(dock().querySelector("[data-gqv-comment]"), "conversation offers Comment");

  // GitHub's pull request view routes with history.pushState, which fires
  // no turbo:load, turbo:render, pjax:end or popstate event.
  location = new URL("https://github.com/octo/repo/pull/123/changes");
  fixture.window.navigation.dispatch("navigate");
  fixture.window.flushFrames();

  assert.equal(
    dock().querySelector("[data-gqv-comment]"),
    null,
    "Comment must not survive onto Files changed, where there is no composer"
  );
  assert.ok(dock().querySelector("[data-gqv-review]"), "Files changed offers Review");
  // The fake selector engine has no compound-selector support, so assert
  // on the section attribute and read the class off that element.
  const changes = dock().querySelector('[data-gqv-section="changes"]');
  const conversation = dock().querySelector('[data-gqv-section="conversation"]');
  assert.match(changes.className, /\bis-active\b/, "Files changed is the current section");
  assert.doesNotMatch(conversation.className, /\bis-active\b/, "Conversation is no longer current");
  assert.equal(changes.getAttribute("aria-current"), "page");

  controller.destroy();
});

function fakeStorage(get = async () => ({})) {
  const listeners = new Set();
  return {
    local: { get, set: async () => {} },
    onChanged: {
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener),
    },
    emit(value, area = "local", key = "shortcuts") {
      for (const listener of listeners) listener({ [key]: { newValue: value } }, area);
    },
    listeners,
  };
}

function pressShortcut(fixture, code, modifiers = {}) {
  const event = {
    code, target: fixture.document.body, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, ...modifiers,
  };
  fixture.window.dispatch("keydown", event);
  fixture.window.flushFrames();
  return event;
}

test("saved shortcuts replace defaults and update hints and accessible shortcuts", async () => {
  const fixture = buildFixture();
  const storage = fakeStorage(async () => ({ shortcuts: { top: "Ctrl+Shift+J", changes: null } }));
  const controller = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123", { storage });
  controller.start();
  await Promise.resolve();
  fixture.window.flushFrames();

  const root = fixture.document.querySelector("#github-quickview");
  const top = root.querySelector("[data-gqv-top]");
  assert.equal(top.querySelector("kbd").textContent, "⌃⇧J");
  assert.equal(top.getAttribute("aria-keyshortcuts"), "Ctrl+Shift+J");
  const files = root.querySelector('[data-gqv-section="changes"]');
  assert.equal(files.querySelector("kbd"), null);
  assert.equal(files.getAttribute("aria-keyshortcuts"), null);
  assert.match(files.className, /gh-quickview__no-shortcut/);

  fixture.window.scrollY = 800;
  assert.equal(pressShortcut(fixture, "KeyT", { altKey: true }).defaultPrevented, false);
  assert.equal(pressShortcut(fixture, "KeyF", { altKey: true }).defaultPrevented, false);
  assert.equal(pressShortcut(fixture, "KeyJ", { ctrlKey: true }).defaultPrevented, false);
  assert.equal(fixture.window.scrollY, 800);
  assert.equal(pressShortcut(fixture, "KeyJ", { ctrlKey: true, shiftKey: true }).defaultPrevented, true);
  assert.equal(fixture.window.scrollY, 0);

  files.click();
  assert.equal(files.clicks, 1, "disabled shortcuts do not disable mouse controls");
  controller.destroy();
  assert.equal(storage.listeners.size, 0);
});

test("storage updates apply live, ignore other areas, and reset when removed", async () => {
  const fixture = buildFixture();
  fixture.window.navigator.platform = "Linux";
  const storage = fakeStorage();
  const controller = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123", { storage });
  controller.start();
  await Promise.resolve();
  fixture.window.flushFrames();
  const top = () => fixture.document.querySelector("[data-gqv-top]");
  storage.emit({ top: "Ctrl+Shift+1" }, "sync");
  fixture.window.flushFrames();
  assert.equal(top().querySelector("kbd").textContent, "Alt+T");
  storage.emit({ top: "Ctrl+Shift+1" });
  fixture.window.flushFrames();
  assert.equal(top().querySelector("kbd").textContent, "Ctrl+Shift+1");
  fixture.window.scrollY = 400;
  pressShortcut(fixture, "Digit1", { ctrlKey: true, shiftKey: true });
  assert.equal(fixture.window.scrollY, 0);
  storage.emit(undefined);
  fixture.window.flushFrames();
  assert.equal(top().querySelector("kbd").textContent, "Alt+T");
  controller.destroy();
});

test("late storage reads cannot overwrite changes or resurrect a destroyed controller", async () => {
  const fixture = buildFixture();
  let resolve;
  const storage = fakeStorage(() => new Promise((done) => { resolve = done; }));
  const controller = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123", { storage });
  controller.start();
  fixture.window.scrollY = 400;
  assert.equal(pressShortcut(fixture, "KeyT", { altKey: true }).defaultPrevented, false,
    "shortcuts wait for saved settings before accepting keys");
  storage.emit({ top: "Alt+J" });
  fixture.window.flushFrames();
  resolve({ shortcuts: { top: "Alt+K" } });
  await Promise.resolve();
  fixture.window.flushFrames();
  assert.equal(fixture.document.querySelector("[data-gqv-top]").querySelector("kbd").textContent, "⌥J");
  controller.destroy();
  storage.emit({ top: "Alt+L" });
  fixture.window.flushFrames();
  assert.equal(fixture.document.querySelector("#github-quickview"), null);

  const other = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123", { storage });
  other.start();
  other.destroy();
  resolve({ shortcuts: { top: "Alt+K" } });
  await Promise.resolve();
  fixture.window.flushFrames();
  assert.equal(fixture.document.querySelector("#github-quickview"), null);
});

test("storage failures keep default shortcuts usable", async () => {
  const fixture = buildFixture();
  const storage = fakeStorage(async () => { throw new Error("Storage unavailable"); });
  const controller = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123", { storage });
  controller.start();
  await Promise.resolve();
  fixture.window.flushFrames();
  fixture.window.scrollY = 500;
  pressShortcut(fixture, "KeyT", { altKey: true });
  assert.equal(fixture.window.scrollY, 0);
  controller.destroy();
});

test("custom comment shortcut falls back to Conversation away from the composer", async () => {
  const fixture = buildFixture();
  const storage = fakeStorage(async () => ({ shortcuts: { comment: "Alt+Shift+R" } }));
  const controller = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123/changes", { storage });
  controller.start();
  await Promise.resolve();
  fixture.window.flushFrames();
  const conversation = fixture.document.querySelector("#github-quickview").querySelector('[data-gqv-section="conversation"]');
  pressShortcut(fixture, "KeyR", { altKey: true, shiftKey: true });
  assert.equal(conversation.clicks, 1);
  assert.equal(fixture.nativeReview.clickCount, 0);
  controller.destroy();
});

test("custom shortcuts ignore text entry, repeat, composition, and extra modifiers", async () => {
  const fixture = buildFixture();
  const storage = fakeStorage(async () => ({ shortcuts: { top: "Ctrl+Shift+J" } }));
  const controller = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123", { storage });
  controller.start();
  await Promise.resolve();
  fixture.window.flushFrames();
  fixture.window.scrollY = 500;
  for (const extra of [
    { target: fixture.comment }, { target: append(fixture.main, "input") },
    { target: append(fixture.main, "select") }, { target: { isContentEditable: true } },
    { repeat: true }, { isComposing: true }, { defaultPrevented: true },
    { altKey: true }, { metaKey: true }, { getModifierState: () => true },
  ]) {
    pressShortcut(fixture, "KeyJ", { ctrlKey: true, shiftKey: true, ...extra });
    assert.equal(fixture.window.scrollY, 500);
  }
  controller.destroy();
});

test("single key shortcuts activate only outside text entry and require exact modifiers", async () => {
  const fixture = buildFixture();
  const storage = fakeStorage(async () => ({ shortcuts: { top: "T", comment: "1" } }));
  const controller = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123", { storage });
  controller.start();
  await Promise.resolve();
  fixture.window.flushFrames();
  const top = fixture.document.querySelector("[data-gqv-top]");
  assert.equal(top.querySelector("kbd").textContent, "T");
  assert.equal(top.getAttribute("aria-keyshortcuts"), "T");
  fixture.window.scrollY = 500;
  for (const extra of [
    { target: fixture.comment }, { target: append(fixture.main, "input") },
    { target: append(fixture.main, "select") }, { target: { isContentEditable: true } },
    { repeat: true }, { isComposing: true }, { keyCode: 229 }, { defaultPrevented: true },
    { shiftKey: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true },
  ]) {
    pressShortcut(fixture, "KeyT", extra);
    assert.equal(fixture.window.scrollY, 500);
  }
  assert.equal(pressShortcut(fixture, "KeyF").defaultPrevented, false, "defaults still require Alt");
  assert.equal(pressShortcut(fixture, "KeyT").defaultPrevented, true);
  assert.equal(fixture.window.scrollY, 0);
  assert.equal(pressShortcut(fixture, "Digit1").defaultPrevented, true);
  assert.equal(fixture.document.activeElement, fixture.comment);
  storage.emit({ top: null });
  fixture.window.flushFrames();
  fixture.window.scrollY = 500;
  assert.equal(pressShortcut(fixture, "KeyT").defaultPrevented, false);
  assert.equal(fixture.window.scrollY, 500);
  controller.destroy();
});

function addNativeRefresh(fixture, path = "/octo/repo/pull/123/changes") {
  return append(fixture.nativeReview.parentElement, "a", {
    href: path, "aria-label": "Refresh", "data-refresh-button-visible": "true", "data-loading": "false",
  }, "Refresh");
}

const autoToggle = (fixture) => fixture.document.querySelector("[data-gqv-auto-refresh]");

test("auto refresh defaults off, clicks each update once, and stops when disabled", () => {
  const fixture = buildFixture();
  const refresh = addNativeRefresh(fixture);
  const controller = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123/changes");
  controller.start();
  assert.equal(autoToggle(fixture).getAttribute("aria-pressed"), "false");
  assert.equal(fixture.window.timers.size, 0);
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, undefined);
  autoToggle(fixture).click();
  assert.equal(autoToggle(fixture).getAttribute("aria-pressed"), "true");
  fixture.window.flushTimers();
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, 1);
  refresh.setAttribute("data-loading", "true");
  fixture.window.flushTimers();
  refresh.setAttribute("data-loading", "false");
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, 1, "loading does not re-arm a stale refresh signal");
  refresh.setAttribute("data-refresh-button-visible", "false");
  fixture.window.flushTimers();
  refresh.setAttribute("data-refresh-button-visible", "true");
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, 2);
  autoToggle(fixture).click();
  assert.equal(fixture.window.timers.size, 0);
  controller.destroy();
});

test("an update inserted later is detected without re-rendering the dock or repeated clicks on replacements", () => {
  const fixture = buildFixture();
  const controller = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123/changes");
  controller.start();
  const toggle = autoToggle(fixture);
  toggle.click();
  fixture.window.flushTimers();
  const first = addNativeRefresh(fixture);
  fixture.window.flushTimers();
  assert.equal(first.clicks, 1);
  first.remove();
  const replacement = addNativeRefresh(fixture);
  fixture.window.flushTimers();
  assert.equal(replacement.clicks, undefined, "a React replacement cannot loop on the same signal");
  assert.equal(autoToggle(fixture), toggle);
  controller.destroy();
});

test("auto refresh pauses for focus, drafts, previews, and dialogs, then resumes", () => {
  const fixture = buildFixture();
  const refresh = addNativeRefresh(fixture);
  const controller = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123/changes");
  controller.start();
  autoToggle(fixture).click();
  fixture.comment.focus();
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, undefined);
  fixture.document.activeElement = fixture.document.body;
  fixture.comment.value = "My unfinished review";
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, undefined);
  fixture.comment.hidden = true;
  fixture.comment.form = append(fixture.main, "form");
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, undefined, "previewing a draft still pauses refresh");
  fixture.comment.form.hidden = true;
  const dialog = append(fixture.main, "div", { role: "dialog" });
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, undefined);
  dialog.hidden = true;
  const editor = append(fixture.main, "div", { contenteditable: "plaintext-only" }, "Draft");
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, undefined);
  editor.textContent = "";
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, 1);
  controller.destroy();
});

test("auto refresh works on Conversation and legacy Files, but stops on other routes", () => {
  const fixture = buildFixture();
  let location = "https://github.com/octo/repo/pull/123/files";
  const refresh = addNativeRefresh(fixture, "/octo/repo/pull/123/files");
  const controller = createFixtureController(fixture, () => location);
  controller.start();
  autoToggle(fixture).click();
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, 1);
  location = "https://github.com/octo/repo/pull/123";
  refresh.setAttribute("href", "/octo/repo/pull/123");
  fixture.window.navigation.dispatch("navigate");
  fixture.window.flushFrames();
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, 2);
  assert.equal(autoToggle(fixture).getAttribute("aria-pressed"), "true");
  for (const path of ["/octo/repo/pull/123/checks", "/octo/repo/pull/123/commits", "/octo/repo/issues/123"]) {
    location = "https://github.com" + path;
    fixture.window.navigation.dispatch("navigate");
    fixture.window.flushFrames();
    assert.equal(autoToggle(fixture), null);
    assert.equal(fixture.window.timers.size, 0);
  }
  controller.destroy();
});

test("queued auto refresh rechecks the route before acting, even before navigation renders", () => {
  const fixture = buildFixture();
  let location = "https://github.com/octo/repo/pull/123/changes";
  const refresh = addNativeRefresh(fixture);
  const controller = createFixtureController(fixture, () => location);
  controller.start();
  autoToggle(fixture).click();
  location = "https://github.com/octo/repo/issues/123";
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, undefined);
  assert.equal(fixture.window.timers.size, 0);
  controller.destroy();
});

test("auto refresh saves separately from shortcuts and restores on another tab", async () => {
  const fixture = buildFixture();
  const storage = fakeStorage();
  const writes = [];
  storage.local.set = async (value) => { writes.push(value); };
  const controller = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123/changes", { storage });
  controller.start();
  assert.equal(autoToggle(fixture).disabled, true);
  await Promise.resolve();
  autoToggle(fixture).click();
  assert.equal(autoToggle(fixture).disabled, true);
  await Promise.resolve();
  assert.deepEqual(writes, [{ autoRefresh: true }]);
  assert.equal(autoToggle(fixture).getAttribute("aria-pressed"), "true");
  const other = buildFixture();
  const restored = createFixtureController(other, () => "https://github.com/octo/repo/pull/123", {
    storage: fakeStorage(async () => ({ autoRefresh: true })),
  });
  restored.start();
  await Promise.resolve();
  assert.equal(autoToggle(other).getAttribute("aria-pressed"), "true");
  restored.destroy();
  storage.emit(false, "sync", "autoRefresh");
  assert.equal(autoToggle(fixture).getAttribute("aria-pressed"), "true");
  storage.emit(undefined, "local", "autoRefresh");
  assert.equal(autoToggle(fixture).getAttribute("aria-pressed"), "false");
  assert.equal(fixture.window.timers.size, 0);
  controller.destroy();
  assert.equal(storage.listeners.size, 0);
});

test("auto refresh storage updates beat late reads without affecting shortcuts", async () => {
  const fixture = buildFixture();
  let resolveAuto;
  const storage = fakeStorage((key) => key === "autoRefresh" ? new Promise(resolve => { resolveAuto = resolve; }) : Promise.resolve({ shortcuts: { top: "J" } }));
  const controller = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123/changes", { storage });
  controller.start();
  storage.emit(true, "local", "autoRefresh");
  resolveAuto({ autoRefresh: false });
  await Promise.resolve();
  fixture.window.flushFrames();
  assert.equal(autoToggle(fixture).getAttribute("aria-pressed"), "true");
  assert.equal(fixture.document.querySelector("[data-gqv-top]").getAttribute("aria-keyshortcuts"), "J");
  controller.destroy();
  assert.equal(fixture.window.timers.size, 0);
});

test("failed auto refresh saves keep the previous setting and allow retry", async () => {
  const fixture = buildFixture();
  const storage = fakeStorage(async () => { throw new Error("read unavailable"); });
  storage.local.set = async () => { throw new Error("write unavailable"); };
  const controller = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123/changes", { storage });
  controller.start();
  await Promise.resolve();
  autoToggle(fixture).click();
  await Promise.resolve();
  assert.equal(autoToggle(fixture).getAttribute("aria-pressed"), "false");
  assert.equal(autoToggle(fixture).disabled, false);
  assert.match(autoToggle(fixture).textContent, /retry/);
  assert.equal(fixture.window.timers.size, 0);
  storage.local.set = async () => {};
  autoToggle(fixture).click();
  await Promise.resolve();
  assert.equal(autoToggle(fixture).getAttribute("aria-pressed"), "true");
  controller.destroy();
});

test("destroy cancels auto refresh and ignores an in-flight setting save", async () => {
  const fixture = buildFixture();
  const storage = fakeStorage(async () => ({ autoRefresh: true }));
  const refresh = addNativeRefresh(fixture);
  let completeSave;
  storage.local.set = () => new Promise(resolve => { completeSave = resolve; });
  const controller = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123/changes", { storage });
  controller.start();
  await Promise.resolve();
  autoToggle(fixture).click();
  assert.equal(fixture.window.timers.size, 0);
  controller.destroy();
  completeSave();
  await Promise.resolve();
  fixture.window.flushFrames();
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, undefined);
  assert.equal(autoToggle(fixture), null);
  assert.equal(fixture.window.timers.size, 0);
});

test("auto refresh resumes for updates that arrived while away or disabled", () => {
  const fixture = buildFixture();
  let location = "https://github.com/octo/repo/pull/123/changes";
  const refresh = addNativeRefresh(fixture);
  const controller = createFixtureController(fixture, () => location);
  controller.start();
  autoToggle(fixture).click();
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, 1);
  location = "https://github.com/octo/repo/pull/123/checks";
  fixture.window.navigation.dispatch("navigate");
  fixture.window.flushFrames();
  refresh.setAttribute("data-refresh-button-visible", "false");
  refresh.setAttribute("data-refresh-button-visible", "true");
  location = "https://github.com/octo/repo/pull/123/changes";
  fixture.window.navigation.dispatch("navigate");
  fixture.window.flushFrames();
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, 2, "returning to the same page re-arms detection");
  location = "https://github.com/octo/repo/issues/123";
  fixture.window.navigation.dispatch("navigate");
  fixture.window.flushFrames();
  assert.equal(fixture.window.timers.size, 0);
  refresh.setAttribute("data-refresh-button-visible", "false");
  refresh.setAttribute("data-refresh-button-visible", "true");
  location = "https://github.com/octo/repo/pull/123/changes";
  fixture.window.navigation.dispatch("navigate");
  fixture.window.flushFrames();
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, 3, "returning from a non-PR route also re-arms detection");
  autoToggle(fixture).click();
  refresh.setAttribute("data-refresh-button-visible", "false");
  refresh.setAttribute("data-refresh-button-visible", "true");
  autoToggle(fixture).click();
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, 4, "re-enabling handles an update missed while disabled");
  controller.destroy();
});

test("clearing a prefilled draft resumes refresh even when its default text remains", () => {
  const fixture = buildFixture();
  fixture.comment.textContent = "A server-rendered draft";
  fixture.comment.value = "A server-rendered draft";
  const refresh = addNativeRefresh(fixture);
  const controller = createFixtureController(fixture, () => "https://github.com/octo/repo/pull/123/changes");
  controller.start();
  autoToggle(fixture).click();
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, undefined);
  fixture.comment.value = "";
  fixture.window.flushTimers();
  assert.equal(refresh.clicks, 1);
  controller.destroy();
});
