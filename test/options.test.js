const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const settings = require("../src/shortcuts.js");

const optionsSource = fs.readFileSync(require.resolve("../src/options.js"), "utf8");

class Element {
  constructor(tagName, document) {
    this.tagName = tagName;
    this.document = document;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.disabled = false;
    this.value = "";
    this.textContent = "";
  }

  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  focus() { this.document.activeElement = this; }

  async dispatch(type, properties = {}) {
    const event = {
      key: "", code: "", altKey: false, ctrlKey: false, shiftKey: false, metaKey: false,
      repeat: false, isComposing: false, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...properties,
    };
    await this.listeners.get(type)?.(event);
    return event;
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function createOptions({ saved = {}, platform = "Linux", get, set } = {}) {
  const elements = [];
  const document = {
    activeElement: null,
    createElement(tagName) {
      const element = new Element(tagName, this);
      elements.push(element);
      return element;
    },
    querySelector(selector) { return elements.find((element) => element.id === selector.slice(1)); },
  };
  const controls = {};
  for (const [id, tag] of [
    ["shortcuts-form", "form"], ["shortcut-fields", "fieldset"], ["shortcut-rows", "div"],
    ["save", "button"], ["restore", "button"], ["status", "p"],
  ]) {
    controls[id] = document.createElement(tag);
    controls[id].id = id;
  }
  controls["shortcut-fields"].disabled = true;
  controls.status.textContent = "Loading shortcuts…";
  const reads = [];
  const writes = [];
  const storage = {
    async get(key) {
      reads.push(key);
      return get ? get(key) : saved;
    },
    async set(value) {
      writes.push(JSON.parse(JSON.stringify(value)));
      if (set) await set(value);
    },
  };
  vm.runInNewContext(optionsSource, {
    GitHubQuickviewShortcuts: settings, document, navigator: { platform }, chrome: { storage: { local: storage } },
  }, { filename: "options.js" });

  return {
    controls, document, reads, writes,
    ready: () => new Promise((resolve) => setImmediate(resolve)),
    field: (id) => document.querySelector("#shortcut-" + id),
    clear: (id) => elements.find((element) => element.getAttribute("aria-label") === "Clear " + settings.actions.find((action) => action.id === id).label + " shortcut").dispatch("click"),
    restore: () => controls.restore.dispatch("click"),
    submit: () => controls["shortcuts-form"].dispatch("submit"),
  };
}

function bindings(page) {
  return Object.fromEntries(settings.actions.map(({ id }) => [id, page.field(id).value]));
}

test("options stays disabled during loading and displays defaults when no settings exist", async () => {
  const loading = deferred();
  const page = createOptions({ get: () => loading.promise });
  assert.equal(page.controls["shortcut-fields"].disabled, true);
  await page.submit();
  assert.equal(page.writes.length, 0);
  loading.resolve({});
  await page.ready();
  assert.deepEqual(page.reads, [settings.STORAGE_KEY]);
  assert.deepEqual(bindings(page), settings.defaults);
  assert.equal(page.controls["shortcut-fields"].disabled, false);
  assert.equal(page.controls.save.disabled, false);
  assert.equal(page.controls.status.textContent, "");
  assert.equal(page.field("conversation").readOnly, true);
});

test("options loads custom and disabled settings using Apple display labels", async () => {
  const page = createOptions({ platform: "MacIntel", saved: { shortcuts: { conversation: "Ctrl+Shift+J", changes: null, top: "Meta+9" } } });
  await page.ready();
  assert.deepEqual(bindings(page), { conversation: "⌃⇧J", changes: "", comment: "⌥M", top: "⌘9" });
  assert.equal(page.field("changes").placeholder, "Disabled");
  assert.equal(page.writes.length, 0);
});

test("keyboard capture uses physical keys and does not persist until Save", async () => {
  const page = createOptions();
  await page.ready();
  const event = await page.field("conversation").dispatch("keydown", { code: "KeyJ", key: "∆", altKey: true, shiftKey: true });
  assert.equal(event.defaultPrevented, true);
  assert.equal(page.field("conversation").value, "Alt+Shift+J");
  assert.equal(page.controls.status.textContent, "Unsaved changes.");
  assert.equal(page.writes.length, 0);
});

test("modifier-only, repeat, navigation and composing events leave the draft intact", async () => {
  const page = createOptions();
  await page.ready();
  const input = page.field("conversation");
  for (const key of ["Control", "Alt", "Shift", "Meta"]) {
    await input.dispatch("keydown", { key });
    assert.equal(input.value, "Alt+C");
    assert.equal(page.controls.status.textContent, "");
  }
  for (const properties of [
    { key: "j", code: "KeyJ", ctrlKey: true, repeat: true },
    { key: "j", code: "KeyJ", ctrlKey: true, isComposing: true },
    { key: "Tab", code: "Tab" }, { key: "Escape", code: "Escape" },
  ]) {
    const event = await input.dispatch("keydown", properties);
    assert.equal(event.defaultPrevented, false);
    assert.equal(input.value, "Alt+C");
    assert.equal(page.controls.status.textContent, "");
  }
});

test("unsupported keys show guidance without overwriting the saved combination", async () => {
  const page = createOptions();
  await page.ready();
  for (const properties of [
    { key: " ", code: "Space" }, { key: ";", code: "Semicolon" },
    { key: "F1", code: "F1", ctrlKey: true }, { key: "Delete", code: "Delete", ctrlKey: true },
    { key: "@", code: "KeyQ", ctrlKey: true, altKey: true, getModifierState: () => true },
  ]) {
    const event = await page.field("conversation").dispatch("keydown", properties);
    assert.equal(event.defaultPrevented, true);
    assert.equal(page.field("conversation").value, "Alt+C");
    assert.equal(page.controls.status.getAttribute("data-error"), "true");
    assert.match(page.controls.status.textContent, /letter or number/);
  }
  await page.submit();
  assert.deepEqual(page.writes[0], { shortcuts: settings.defaults });
});

test("single keys are captured, validated, saved, and loaded alongside modified shortcuts", async () => {
  const page = createOptions();
  await page.ready();
  await page.field("conversation").dispatch("keydown", { key: "c", code: "KeyC" });
  await page.field("changes").dispatch("keydown", { key: "1", code: "Digit1" });
  await page.field("comment").dispatch("keydown", { key: "M", code: "KeyM", shiftKey: true });
  assert.equal(page.field("conversation").value, "C");
  assert.equal(page.field("changes").value, "1");
  assert.equal(page.field("comment").value, "Shift+M");
  await page.field("top").dispatch("keydown", { key: "c", code: "KeyC" });
  assert.equal(page.controls.save.disabled, true);
  await page.submit();
  assert.equal(page.writes.length, 0);
  await page.field("top").dispatch("keydown", { key: "c", code: "KeyC", altKey: true });
  assert.equal(page.controls.save.disabled, false);
  await page.submit();
  assert.deepEqual(page.writes[0], {
    shortcuts: { conversation: "C", changes: "1", comment: "Shift+M", top: "Alt+C" },
  });
  const reloaded = createOptions({ saved: page.writes[0] });
  await reloaded.ready();
  assert.deepEqual(bindings(reloaded), bindings(page));
});

test("duplicate assignments block saving until one action is cleared", async () => {
  const page = createOptions();
  await page.ready();
  await page.field("changes").dispatch("keydown", { key: "c", code: "KeyC", altKey: true });
  assert.equal(page.controls.save.disabled, true);
  assert.equal(page.field("conversation").getAttribute("aria-invalid"), "true");
  assert.equal(page.field("changes").getAttribute("aria-invalid"), "true");
  assert.match(page.controls.status.textContent, /Conversation.*Files changed/);
  await page.submit();
  assert.equal(page.writes.length, 0);
  await page.clear("conversation");
  assert.equal(page.document.activeElement, page.field("conversation"));
  assert.equal(page.field("conversation").value, "");
  assert.equal(page.controls.save.disabled, false);
  assert.equal(page.field("conversation").getAttribute("aria-invalid"), "false");
  assert.equal(page.field("changes").getAttribute("aria-invalid"), "false");
  await page.submit();
  assert.deepEqual(settings.normalize(page.writes[0].shortcuts), {
    conversation: "", changes: "Alt+C", comment: "Alt+M", top: "Alt+T",
  });
});

test("restore defaults is staged and only saved on submission", async () => {
  const page = createOptions({ saved: { shortcuts: { conversation: "Ctrl+J", changes: "" } } });
  await page.ready();
  await page.restore();
  assert.deepEqual(bindings(page), settings.defaults);
  assert.equal(page.writes.length, 0);
  assert.match(page.controls.status.textContent, /Defaults restored.*Save shortcuts/);
  await page.submit();
  assert.deepEqual(page.writes, [{ shortcuts: settings.defaults }]);
  assert.equal(page.controls.status.textContent, "Shortcuts saved.");
});

test("saving persists custom bindings and keyboard-cleared disabled actions", async () => {
  const page = createOptions();
  await page.ready();
  await page.field("conversation").dispatch("keydown", { key: "2", code: "Digit2", ctrlKey: true });
  await page.field("changes").dispatch("keydown", { key: "Backspace", code: "Backspace" });
  await page.field("comment").dispatch("keydown", { key: "Delete", code: "Delete" });
  await page.submit();
  assert.deepEqual(settings.normalize(page.writes[0].shortcuts), {
    conversation: "Ctrl+2", changes: "", comment: "", top: "Alt+T",
  });
  assert.equal(page.controls["shortcut-fields"].disabled, false);
  assert.equal(page.controls.status.getAttribute("data-error"), "false");
});

test("pending save disables controls and prevents a second write", async () => {
  const saving = deferred();
  const page = createOptions({ set: () => saving.promise });
  await page.ready();
  const submitted = page.submit();
  assert.equal(page.controls["shortcut-fields"].disabled, true);
  assert.match(page.controls.status.textContent, /Saving/);
  await page.submit();
  assert.equal(page.writes.length, 1);
  saving.resolve();
  await submitted;
  assert.equal(page.controls["shortcut-fields"].disabled, false);
  assert.equal(page.controls.status.textContent, "Shortcuts saved.");
});

test("save failure retains the draft and permits retry", async () => {
  let attempts = 0;
  const page = createOptions({ set: async () => { if (++attempts === 1) throw new Error("Storage unavailable"); } });
  await page.ready();
  await page.field("top").dispatch("keydown", { key: "j", code: "KeyJ", metaKey: true });
  await page.clear("comment");
  const draft = bindings(page);
  await page.submit();
  assert.equal(page.controls["shortcut-fields"].disabled, false);
  assert.equal(page.controls.save.disabled, false);
  assert.equal(page.controls.status.getAttribute("data-error"), "true");
  assert.match(page.controls.status.textContent, /Could not save.*try again/);
  assert.deepEqual(bindings(page), draft);
  await page.submit();
  assert.equal(page.writes.length, 2);
  assert.deepEqual(page.writes[1], page.writes[0]);
  assert.equal(page.controls.status.textContent, "Shortcuts saved.");
  assert.equal(page.controls.status.getAttribute("data-error"), "false");
});

test("load failure keeps the form disabled and blocks persistence", async () => {
  const page = createOptions({ get: async () => { throw new Error("Storage unavailable"); } });
  await page.ready();
  assert.equal(page.controls["shortcut-fields"].disabled, true);
  assert.equal(page.controls.status.getAttribute("data-error"), "true");
  assert.match(page.controls.status.textContent, /Could not load.*Reload/);
  await page.submit();
  assert.equal(page.writes.length, 0);
});
