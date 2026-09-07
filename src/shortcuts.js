(function (globalScope) {
  'use strict';

  var STORAGE_KEY = 'shortcuts';
  var actions = [
    { id: 'conversation', label: 'Conversation' },
    { id: 'changes', label: 'Files changed' },
    { id: 'comment', label: 'Comment' },
    { id: 'top', label: 'Back to top' }
  ];
  var defaults = {
    conversation: 'Alt+C',
    changes: 'Alt+F',
    comment: 'Alt+M',
    top: 'Alt+T'
  };
  var modifiers = ['Ctrl', 'Alt', 'Shift', 'Meta'];
  var modifierNames = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta' };
  var modifierSymbols = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' };

  function parseShortcut(value) {
    if (value === null || value === '') {
      return '';
    }
    if (typeof value !== 'string') {
      return undefined;
    }
    var parts = value.split('+');
    var present = {};
    var key;
    for (var index = 0; index < parts.length; index += 1) {
      var part = parts[index].trim().toLowerCase();
      var modifier = Object.prototype.hasOwnProperty.call(modifierNames, part) ? modifierNames[part] : null;
      if (modifier && !present[modifier]) {
        present[modifier] = true;
      } else if (/^[a-z0-9]$/.test(part) && !key) {
        key = part.toUpperCase();
      } else {
        return undefined;
      }
    }
    if (!key) {
      return undefined;
    }
    return modifiers.filter(function (modifier) { return present[modifier]; }).concat(key).join('+');
  }

  function fromEvent(event) {
    if (!event || event.isComposing || event.keyCode === 229 ||
        (typeof event.getModifierState === 'function' && event.getModifierState('AltGraph'))) {
      return null;
    }
    var match = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(event.code || '');
    if (!match) {
      return null;
    }
    var pressed = [event.ctrlKey, event.altKey, event.shiftKey, event.metaKey];
    return modifiers.filter(function (modifier, index) { return pressed[index]; })
      .concat(match[1] || match[2]).join('+');
  }

  function normalize(value) {
    var input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var result = {};
    var claimed = {};
    var fallback = [];
    actions.forEach(function (action) {
      var shortcut = parseShortcut(Object.prototype.hasOwnProperty.call(input, action.id) ? input[action.id] : undefined);
      result[action.id] = '';
      if (shortcut === undefined) {
        fallback.push(action.id);
      } else if (shortcut && !claimed[shortcut]) {
        result[action.id] = shortcut;
        claimed[shortcut] = true;
      }
    });
    fallback.forEach(function (id) {
      if (!claimed[defaults[id]]) {
        result[id] = defaults[id];
        claimed[defaults[id]] = true;
      }
    });
    return result;
  }

  function label(shortcut, isApple) {
    var canonical = parseShortcut(shortcut);
    if (!canonical) {
      return '';
    }
    return isApple ? canonical.split('+').map(function (part) {
      return modifierSymbols[part] || part;
    }).join('') : canonical;
  }

  function conflicts(map) {
    var messages = [];
    var claimed = Object.create(null);
    actions.forEach(function (action) {
      var value = map && map[action.id];
      if (typeof value !== 'string' || !value.trim()) {
        return;
      }
      var shortcut = parseShortcut(value) || value.trim();
      if (claimed[shortcut]) {
        messages.push(claimed[shortcut] + ' and ' + action.label + ' use the same shortcut (' + shortcut + ').');
      } else {
        claimed[shortcut] = action.label;
      }
    });
    return messages;
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    actions: actions,
    defaults: defaults,
    fromEvent: fromEvent,
    normalize: normalize,
    label: label,
    conflicts: conflicts
  };
  globalScope.GitHubQuickviewShortcuts = globalScope.GitHubQuickviewShortcuts || api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
