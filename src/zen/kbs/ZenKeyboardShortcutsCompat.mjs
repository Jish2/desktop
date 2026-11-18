/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// AppConstants is already a global in browser chrome windows, and a static
// import of a system module is rejected by mozilla/reject-import-system-module
// from a non-.sys.mjs file.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ShortcutUtils: "resource://gre/modules/ShortcutUtils.sys.mjs",
});

/**
 * A read-only compatibility view over Zen's shortcuts, for userChrome mods
 * written against the old `window.gZenKeyboardShortcutsManager` global.
 *
 * gh-16163 moved Zen's shortcuts onto Firefox's CustomKeys (about:keyboard) and
 * deleted `chrome/browser/content/browser/zen-components/ZenKeyboardShortcuts.mjs`
 * together with the window global it set. The replacement,
 * `resource:///modules/zen/kbs/ZenKeyboardShortcuts.sys.mjs`, exports an ES
 * module and deliberately sets no global.
 *
 * Mods therefore lose two things without throwing, because both guard the
 * access: shortcut display and Zen-shortcut conflict detection. They cannot be
 * fixed here -- marketplace mods are replaced by Sine's auto-updater, so a
 * local patch does not survive. This restores the old shape as a thin view over
 * the same `<key>` elements the old class parsed. It is evaluated lazily on
 * every access, so it tracks CustomKeys rebinding keys in place instead of
 * caching a list that immediately goes stale.
 *
 * Deprecated: engine code must use `ZenKeyboardShortcuts` instead.
 */

/**
 * The old modifiers object exposed boolean getters, folding Ctrl onto Accel off
 * macOS. Mirror that so `getModifiers()` read back the same way it used to.
 *
 * @param {string} attribute The `modifiers` attribute of a <key>.
 */
function modifiersFromAttribute(attribute) {
  const names = new Set(
    (attribute ?? "")
      .split(",")
      .map(part => part.trim().toLowerCase())
      .filter(Boolean)
  );
  const meta = names.has("meta");
  let control = names.has("control") || names.has("ctrl");
  let accel = names.has("accel");
  if (AppConstants.platform != "macosx") {
    // The legacy class replaced control with accel off macOS.
    accel = control || accel;
    control = false;
  }
  return {
    control,
    alt: names.has("alt"),
    shift: names.has("shift"),
    meta,
    accel,
  };
}

/**
 * Wrap a <key> element in the old KeyShortcut surface.
 *
 * `getAction()` returns the `command` attribute because that is what the legacy
 * class ended up holding: its version-9 migration rewrote `code:` actions into
 * `<command>` ids, and about:keyboard's keys are plain <key> + <command>
 * elements. Callers match on either `getAction()` or `getID()`.
 *
 * @param {Element} keyEl
 */
function shortcutView(keyEl) {
  return {
    getID: () => keyEl.id,
    getAction: () => keyEl.getAttribute("command") ?? "",
    getKeyName: () => (keyEl.getAttribute("key") ?? "").toLowerCase(),
    getRealKeycode: () => keyEl.getAttribute("keycode") ?? "",
    getModifiers: () => modifiersFromAttribute(keyEl.getAttribute("modifiers")),
    isEmpty: () => !keyEl.hasAttribute("key") && !keyEl.hasAttribute("keycode"),
    toDisplayString: () => lazy.ShortcutUtils.prettifyShortcut(keyEl),
  };
}

class nsZenKeyboardShortcutsCompat {
  /**
   * Whether this window is a full browser window. The old manager had the same
   * guard: popups and little windows have no shortcut list worth reading.
   */
  get #inBrowserView() {
    return window.location.href == "chrome://browser/content/browser.xhtml";
  }

  /**
   * Every shortcut in this window, rebuilt from the DOM on each access.
   *
   * This replaces the old `_currentShortcutList` array. It is a getter rather
   * than a stored array because CustomKeys rewrites the `<key>` elements in
   * place when a binding changes, and the old array was only ever a parse of
   * those same elements.
   *
   * @returns {object[]}
   */
  get _currentShortcutList() {
    if (!this.#inBrowserView) {
      return [];
    }
    return [...window.document.querySelectorAll("key")]
      .filter(keyEl => keyEl.id)
      .map(shortcutView);
  }

  /**
   * The shortcut bound to a command, formatted for display.
   *
   * Kept to the legacy single-argument signature, which is bound to this
   * window; `ZenKeyboardShortcuts.getShortcutDisplayFromCommand` takes the
   * window explicitly.
   *
   * @param {string} command The id of the <command> the key triggers.
   * @returns {string|null}
   */
  getShortcutDisplayFromCommand(command) {
    if (!command || !this.#inBrowserView) {
      return null;
    }
    const keyEl = window.document.querySelector(
      `key[command="${window.CSS.escape(command)}"]:not([disabled="true"])`
    );
    if (!keyEl?.hasAttribute("key") && !keyEl?.hasAttribute("keycode")) {
      return null;
    }
    return lazy.ShortcutUtils.prettifyShortcut(keyEl);
  }
}

// Never shadow a real manager, in case a future build brings one back.
window.gZenKeyboardShortcutsManager ??= new nsZenKeyboardShortcutsCompat();
