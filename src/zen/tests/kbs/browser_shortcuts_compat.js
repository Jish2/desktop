/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// The compat view exists only for userChrome mods. It is a read-only mirror of
// the <key> elements, so these tests assert what a mod would observe: the list
// shape, the modifiers mapping, and that a CustomKeys rebinding is visible
// immediately rather than served from a stale snapshot.

add_task(async function test_global_is_present_and_shaped() {
  const manager = window.gZenKeyboardShortcutsManager;
  ok(manager, "the legacy global is exposed to browser chrome");
  ok(
    Array.isArray(manager._currentShortcutList),
    "_currentShortcutList is an array, as mods iterate it"
  );
  Assert.greater(
    manager._currentShortcutList.length,
    0,
    "it lists this window's keys"
  );
});

add_task(async function test_list_entries_expose_the_legacy_surface() {
  const manager = window.gZenKeyboardShortcutsManager;
  const byId = new Map(manager._currentShortcutList.map(s => [s.getID(), s]));

  const library = byId.get("zen-library-toggle");
  ok(library, "a Zen key appears in the list");
  is(
    library.getAction(),
    "cmd_zenToggleLibrary",
    "getAction() reports the command the key drives"
  );
  Assert.ok(
    library.toDisplayString().length > 0,
    "toDisplayString() renders the shortcut"
  );
  is(library.isEmpty(), false, "a bound key is not empty");

  const modifiers = library.getModifiers();
  for (const name of ["control", "alt", "shift", "meta", "accel"]) {
    is(
      typeof modifiers[name],
      "boolean",
      `getModifiers().${name} is a boolean`
    );
  }
});

add_task(async function test_modifiers_fold_control_onto_accel_off_mac() {
  const manager = window.gZenKeyboardShortcutsManager;
  const keyEl = document.getElementById("zen-library-toggle");
  const original = keyEl.getAttribute("modifiers");
  try {
    keyEl.setAttribute("modifiers", "control,alt");
    const shortcut = manager._currentShortcutList.find(
      s => s.getID() == "zen-library-toggle"
    );
    const modifiers = shortcut.getModifiers();
    if (isMac) {
      is(modifiers.control, true, "control stays control on macOS");
      is(modifiers.accel, false, "and is not folded into accel");
    } else {
      is(modifiers.control, false, "control folds into accel off macOS");
      is(modifiers.accel, true, "leaving accel set");
    }
    is(modifiers.alt, true, "other modifiers pass through");
  } finally {
    if (original === null) {
      keyEl.removeAttribute("modifiers");
    } else {
      keyEl.setAttribute("modifiers", original);
    }
  }
});

add_task(async function test_rebinding_is_visible_without_a_reload() {
  // The old manager cached a parsed array; this view must not. A mod that reads
  // the list after CustomKeys changes a key has to see the new binding.
  const keyEl = document.getElementById("zen-library-toggle");
  const manager = window.gZenKeyboardShortcutsManager;
  const original = {
    key: keyEl.getAttribute("key"),
    modifiers: keyEl.getAttribute("modifiers"),
  };
  try {
    CustomKeys.changeKey("zen-library-toggle", {
      modifiers: "accel,shift",
      key: UNUSED_KEY,
    });

    const shortcut = manager._currentShortcutList.find(
      s => s.getID() == "zen-library-toggle"
    );
    is(
      shortcut.getKeyName(),
      UNUSED_KEY.toLowerCase(),
      "the view reports the rebound key"
    );
    Assert.ok(
      shortcut.toDisplayString().includes(UNUSED_KEY),
      "and renders it, so the list is not a stale snapshot"
    );
  } finally {
    CustomKeys.resetAll();
    for (const [name, value] of Object.entries(original)) {
      if (value === null) {
        keyEl.removeAttribute(name);
      } else {
        keyEl.setAttribute(name, value);
      }
    }
  }
});

add_task(async function test_get_shortcut_display_from_command() {
  const manager = window.gZenKeyboardShortcutsManager;
  const display = manager.getShortcutDisplayFromCommand(
    "History:RestoreLastClosedTabOrWindowOrSession"
  );
  Assert.ok(
    display && display.length > 0,
    "a Firefox command resolves to its shortcut"
  );
  is(
    manager.getShortcutDisplayFromCommand("not-a-real-command-id"),
    null,
    "an unknown command resolves to null"
  );
  is(
    manager.getShortcutDisplayFromCommand(""),
    null,
    "an empty command resolves to null"
  );
});

add_task(async function test_empty_keys_report_empty() {
  const manager = window.gZenKeyboardShortcutsManager;
  const keyEl = document.getElementById("zen-library-toggle");
  const original = {
    key: keyEl.getAttribute("key"),
    modifiers: keyEl.getAttribute("modifiers"),
  };
  try {
    keyEl.removeAttribute("key");
    keyEl.removeAttribute("keycode");
    const shortcut = manager._currentShortcutList.find(
      s => s.getID() == "zen-library-toggle"
    );
    is(shortcut.isEmpty(), true, "a key with no binding reports empty");
    is(shortcut.getKeyName(), "", "and has no key name");
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === null) {
        keyEl.removeAttribute(name);
      } else {
        keyEl.setAttribute(name, value);
      }
    }
  }
});
