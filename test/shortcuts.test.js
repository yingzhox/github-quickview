const test = require("node:test");
const assert = require("node:assert/strict");
const { STORAGE_KEY, actions, defaults, fromEvent, normalize, label, conflicts } = require("../src/shortcuts.js");

test("shortcut defaults retain all four existing actions", () => {
  assert.equal(STORAGE_KEY, "shortcuts");
  assert.deepEqual(actions, [
    { id: "conversation", label: "Conversation" },
    { id: "changes", label: "Files changed" },
    { id: "comment", label: "Comment" },
    { id: "top", label: "Back to top" },
  ]);
  assert.deepEqual(normalize(), {
    conversation: "Alt+C", changes: "Alt+F", comment: "Alt+M", top: "Alt+T",
  });
  assert.notEqual(normalize(), defaults);
});

test("normalization falls back per action for malformed and partial settings", () => {
  for (const malformed of [undefined, null, false, 12, "Alt+C", []]) {
    assert.deepEqual(normalize(malformed), defaults);
  }
  for (const malformed of [undefined, false, 12, {}, [], "Ctrl", "Ctrl+Shift", "Ctrl+Ctrl+C", "Ctrl+C+C", "Alt+Space", "Ctrl++C", "Hyper+C", " "]) {
    assert.deepEqual(normalize({ conversation: malformed }), defaults, String(malformed));
  }
  assert.deepEqual(normalize({ conversation: " shift + meta + ctrl + j ", changes: "ALT+7", extra: "Ctrl+Q" }), {
    conversation: "Ctrl+Shift+Meta+J", changes: "Alt+7", comment: "Alt+M", top: "Alt+T",
  });
  assert.deepEqual(normalize(Object.create({ conversation: "Ctrl+J" })), defaults);
});

test("empty and null settings disable only the configured action", () => {
  assert.deepEqual(normalize({ conversation: null, changes: "" }), {
    conversation: "", changes: "", comment: "Alt+M", top: "Alt+T",
  });
});

test("explicit shortcuts take priority over colliding default fallbacks", () => {
  assert.deepEqual(normalize({ top: "Alt+C" }), {
    conversation: "", changes: "Alt+F", comment: "Alt+M", top: "Alt+C",
  });
  assert.deepEqual(normalize({ conversation: "Alt+F" }), {
    conversation: "Alt+F", changes: "", comment: "Alt+M", top: "Alt+T",
  });
  assert.deepEqual(normalize({ conversation: "bad", top: "Alt+C" }), {
    conversation: "", changes: "Alt+F", comment: "Alt+M", top: "Alt+C",
  });
});

test("later duplicate explicit bindings are disabled and remain disabled after normalization", () => {
  const normalized = normalize({ conversation: "ctrl+j", changes: "Ctrl+J", comment: "Ctrl+J" });
  assert.deepEqual(normalized, {
    conversation: "Ctrl+J", changes: "", comment: "", top: "Alt+T",
  });
  assert.deepEqual(normalize(normalized), normalized);
  assert.deepEqual(normalize({ conversation: "Alt+T", top: "Alt+T" }), {
    conversation: "Alt+T", changes: "Alt+F", comment: "Alt+M", top: "",
  });
});

test("events use physical letter and digit codes including every active modifier", () => {
  assert.equal(fromEvent({ code: "KeyC", key: "ç", altKey: true }), "Alt+C");
  assert.equal(fromEvent({ code: "KeyJ", key: "J", ctrlKey: true, shiftKey: true }), "Ctrl+Shift+J");
  assert.equal(fromEvent({ code: "Digit1", key: "!", metaKey: true, shiftKey: true }), "Shift+Meta+1");
  assert.equal(fromEvent({ code: "KeyA", ctrlKey: true, altKey: true, shiftKey: true, metaKey: true }), "Ctrl+Alt+Shift+Meta+A");
  assert.notEqual(fromEvent({ code: "KeyC", altKey: true, shiftKey: true }), defaults.conversation);
});

test("events reject unsupported keys, composition, and AltGraph", () => {
  for (const event of [
    null, {},
    { key: "c", altKey: true }, { code: "Space", altKey: true },
    { code: "ArrowUp", ctrlKey: true }, { code: "Numpad1", altKey: true },
    { code: "AltLeft", altKey: true }, { code: "F1", ctrlKey: true },
    { code: "KeyC", altKey: true, isComposing: true },
    { code: "KeyC", altKey: true, keyCode: 229 },
    { code: "KeyQ", ctrlKey: true, altKey: true, getModifierState: (name) => name === "AltGraph" },
  ]) assert.equal(fromEvent(event), null, JSON.stringify(event));
  assert.equal(fromEvent({ code: "KeyC", altKey: true, getModifierState: () => false }), "Alt+C");
});

test("single letters and numbers normalize, match, and display without modifiers", () => {
  assert.deepEqual(normalize({ conversation: " c ", changes: "1", comment: "shift + m", top: "T" }), {
    conversation: "C", changes: "1", comment: "Shift+M", top: "T",
  });
  assert.equal(fromEvent({ code: "KeyC", key: "c" }), "C");
  assert.equal(fromEvent({ code: "Digit1", key: "1" }), "1");
  assert.equal(fromEvent({ code: "KeyC", key: "C", shiftKey: true }), "Shift+C");
  assert.equal(fromEvent({ code: "KeyC", key: "C", getModifierState: (name) => name === "CapsLock" }), "C");
  assert.equal(fromEvent({ code: "KeyC", isComposing: true }), null);
  assert.equal(fromEvent({ code: "KeyC", keyCode: 229 }), null);
  for (const apple of [true, false]) {
    assert.equal(label("c", apple), "C");
    assert.equal(label("1", apple), "1");
  }
  assert.equal(label("Shift+C", true), "⇧C");
  assert.equal(conflicts({ conversation: "c", top: "C" }).length, 1);
  assert.deepEqual(conflicts({ conversation: "C", top: "Alt+C" }), []);
  assert.deepEqual(normalize({ conversation: "c", changes: "C" }), {
    conversation: "C", changes: "", comment: "Alt+M", top: "Alt+T",
  });
});

test("labels use platform conventions and omit disabled or invalid shortcuts", () => {
  assert.equal(label("Alt+C", true), "⌥C");
  assert.equal(label("Ctrl+Shift+J", true), "⌃⇧J");
  assert.equal(label("Ctrl+Alt+Shift+Meta+7", true), "⌃⌥⇧⌘7");
  assert.equal(label("Alt+C", false), "Alt+C");
  assert.equal(label("ctrl + shift + j", false), "Ctrl+Shift+J");
  for (const value of [undefined, null, "", "bad"]) {
    assert.equal(label(value, true), "");
    assert.equal(label(value, false), "");
  }
});

test("conflicts name both actions before duplicate normalization", () => {
  assert.deepEqual(conflicts(defaults), []);
  assert.deepEqual(conflicts({ conversation: "", changes: null }), []);
  assert.deepEqual(conflicts(), []);
  const messages = conflicts({ conversation: "ctrl+j", top: "Ctrl + J" });
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Conversation/);
  assert.match(messages[0], /Back to top/);
  assert.match(messages[0], /Ctrl\+J/);
  assert.equal(conflicts({ conversation: "Ctrl+J", changes: "Ctrl+J", comment: "Ctrl+J" }).length, 2);
});
