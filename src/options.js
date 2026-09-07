(function (globalScope) {
  'use strict';

  var settings = globalScope.GitHubQuickviewShortcuts;
  var documentNode = globalScope.document;
  var storage = globalScope.chrome && globalScope.chrome.storage;
  var form = documentNode.querySelector('#shortcuts-form');
  var fields = documentNode.querySelector('#shortcut-fields');
  var rows = documentNode.querySelector('#shortcut-rows');
  var saveButton = documentNode.querySelector('#save');
  var status = documentNode.querySelector('#status');
  var isApple = /Mac|iPhone|iPad|iPod/.test(globalScope.navigator.platform);
  var draft = settings.normalize();
  var inputs = {};

  function showStatus(message, error) {
    status.textContent = message;
    status.setAttribute('data-error', error ? 'true' : 'false');
  }

  function updateFields(message) {
    var errors = settings.conflicts(draft);
    settings.actions.forEach(function (action) {
      var input = inputs[action.id];
      input.value = settings.label(draft[action.id], isApple);
      var duplicate = draft[action.id] && settings.actions.some(function (other) {
        return other.id !== action.id && draft[other.id] === draft[action.id];
      });
      input.setAttribute('aria-invalid', duplicate ? 'true' : 'false');
    });
    saveButton.disabled = errors.length > 0;
    showStatus(errors.length ? errors.join(' ') : message, errors.length > 0);
  }

  settings.actions.forEach(function (action) {
    var row = documentNode.createElement('div');
    row.className = 'shortcut-row';
    var label = documentNode.createElement('label');
    label.htmlFor = 'shortcut-' + action.id;
    label.textContent = action.label;
    var input = documentNode.createElement('input');
    input.id = label.htmlFor;
    input.type = 'text';
    input.readOnly = true;
    input.placeholder = 'Disabled';
    input.setAttribute('aria-describedby', 'shortcut-help status');
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Tab' || event.key === 'Escape' || event.repeat || event.isComposing) {
        return;
      }
      event.preventDefault();
      if (['Control', 'Alt', 'Shift', 'Meta'].indexOf(event.key) !== -1) {
        return;
      }
      var shortcut = settings.fromEvent(event);
      var clear = (event.key === 'Backspace' || event.key === 'Delete') &&
        !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
      if (!shortcut && !clear) {
        showStatus('Press a letter or number, optionally with Ctrl, Alt (Option), Shift, or Command.', true);
        return;
      }
      draft[action.id] = clear ? null : shortcut;
      updateFields('Unsaved changes.');
    });
    var clearButton = documentNode.createElement('button');
    clearButton.type = 'button';
    clearButton.textContent = 'Clear';
    clearButton.setAttribute('aria-label', 'Clear ' + action.label + ' shortcut');
    clearButton.addEventListener('click', function () {
      draft[action.id] = null;
      updateFields('Unsaved changes.');
      input.focus();
    });
    inputs[action.id] = input;
    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(clearButton);
    rows.appendChild(row);
  });

  documentNode.querySelector('#restore').addEventListener('click', function () {
    draft = settings.normalize();
    updateFields('Defaults restored. Save shortcuts to apply.');
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (fields.disabled || settings.conflicts(draft).length) {
      return;
    }
    fields.disabled = true;
    showStatus('Saving shortcuts…');
    try {
      var saved = {};
      saved[settings.STORAGE_KEY] = draft;
      await storage.local.set(saved);
      showStatus('Shortcuts saved.');
    } catch (error) {
      showStatus('Could not save shortcuts. Please try again.', true);
    } finally {
      fields.disabled = false;
    }
  });

  async function load() {
    try {
      var saved = await storage.local.get(settings.STORAGE_KEY);
      draft = settings.normalize(saved[settings.STORAGE_KEY]);
      fields.disabled = false;
      updateFields('');
    } catch (error) {
      showStatus('Could not load shortcuts. Reload this page to try again.', true);
    }
  }

  load();
}(typeof globalThis !== 'undefined' ? globalThis : this));
