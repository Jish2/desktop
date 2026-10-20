# Zen / Sine Mod Debugging Notes

Lessons from debugging Zen Browser mods (userChrome JS). Read this before
instrumenting or bisecting a hang, crash, or CPU/memory runaway in a mod.

Last major case (2026-10-20): workspace-switch hang in the `zen-inbox` mod —
infinite MutationObserver loop. Root cause + fix: yadm commit `a359a34`
(`zen-inbox: fix workspace-switch hang; add unloadable inbox tabs`).

## Getting a JS-level view first (highest value)

Symbol-less native tools (`sample`, `vmmap`) show anonymous JIT frames and
unnamed XUL offsets for JS hangs. Don't burn time symbolizing. Get *any*
JS execution/observability channel first — the answer falls out in one query:

1. **Browser Console** (`Cmd+Shift+J`): evaluates in chrome scope.
   `window.gBrowser`, `window.__<modApi>`, prefs, DOM all reachable.
   Drive it by finding the console's AXTextArea and using act_ui
   `setText` + `keypress Return` (key name `Return`, not `Enter` — see
   UI-driver gotchas below).
2. **File-stream logger in the mod** (works first try, every time):

   ```js
   var __log = (function() {
     const Cc = Components.classes, Ci = Components.interfaces;
     let stream = null;
     try {
       let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
       file.initWithPath("/tmp/debug-trace.log");
       let fos = Cc["@mozilla.org/network/file-output-stream;1"]
         .createInstance(Ci.nsIFileOutputStream);
       fos.init(file, 0x02 | 0x08 | 0x10, 0o644, 0); // WRITE|CREATE|APPEND
       stream = fos;
     } catch (e) {}
     return function(msg) {
       if (!stream) return;
       try { stream.write(msg + "\n", (msg + "\n").length); } catch (e) {}
     };
   })();
   ```

## Things that don't work (don't retry them)

- `dump()` — produces nothing on macOS GUI builds, even chrome-side, even
  redirected via `nohup > file`. Assume broken.
- `MOZ_LOG` for SpiderMonkey GC (`JS::GC`, `js-GC`, `GC`) — module doesn't
  log in release builds. Empty log files, wasted restarts.
- Symbolizing XUL offsets — release XUL is stripped; `nm` gives ~3k imports
  only. `sample` stacks with `??? (in XUL) load address ... + 0xOFFSET` are
  dead ends for JS bugs.
- lldb `bt` on the spinning process — works, but frames are
  `___lldb_unnamed_symbol_*`; only confirms "JIT loop calling C++ with
  memcmp/memmove", which you already knew.

## The winning pattern: trap DOM writes, not suspected code paths

When a hang mutates DOM state, instrument the DOM writes themselves instead
of guard-looping every loop in the code you *suspect* (each guarded loop is
a restart; a write trap is one restart and names the file:line):

```js
// In any chrome-scope module (or via Browser Console eval):
const orig = window.Element.prototype.setAttribute;
const counts = {};
window.Element.prototype.setAttribute = function(name, value) {
  if (name === "hidden") {                    // the attr churning
    counts["hidden"] = (counts["hidden"] || 0) + 1;
    const n = counts["hidden"];
    if (n > 50 && n < 54) {                   // skip startup noise, catch the loop
      const st = new window.Error().stack;
      __log("HIDDEN n=" + n + " stack=" + st.split("\n").slice(1, 7).join(" <= "));
    }
  }
  return orig.call(this, name, value);
};
```

The stack names the exact file:line of the runaway writer. In the
zen-inbox case this found `syncWorkspaceCollapse@zen-inbox.uc.js:796`
in one restart, after ~7 negative loop-guard patches.

Related: a `MutationObserver` summarizing mutations on documentElement
(attribute names + values, aggregated) also works and needs no wrapper,
but setAttribute trapping gives stacks.

## The bug pattern to recognize

**Self-triggering MutationObserver loop**: an observer watches attribute X
on an element; the handler calls `setAttribute(X, sameValue)`. Per spec,
`setAttribute` queues a mutation record *even when the value is unchanged*
→ infinite microtask loop: 100% CPU on the main thread, unbounded memory
(string/attribute churn), UI frozen, AX tree unresponsive, process
eventually killed. Fix: only mutate when the value actually differs
(`if (!el.hasAttribute(x)) ...` / compare first).

Trigger correlation hint: the loop only fires when a *data condition* holds
(e.g. collapsed pinned tabs + empty inbox) — which is why it looked
workspace-specific. When a hang correlates with certain profile data,
bisect the data file (e.g. `zen-sessions.jsonlz4`: 8-byte `mozLz40\0`
header + lz4 JSON) rather than the code.

## Sandbox setup for reproducing (do this before touching the live browser)

1. Copy the app: `tar --no-xattrs -cf - App.app | (cd /tmp && tar xf -)`
   — re-sign with `codesign --force -s -` on every Mach-O, then inner
   bundles, then the bundle root. (`cp -R` copies get AMFI-killed and
   can't be re-signed due to the `com.apple.provenance` xattr; tar without
   xattrs re-signs fine. Verify with `codesign --verify --deep`.)
2. Copy the profile, excluding noise:
   `rsync -a --exclude cache2 --exclude startupCache --exclude 'Crash Reports'
   --exclude glean --exclude datareporting <profile>/ /tmp/test-profile/`
3. Reset crash counter so the "Troubleshoot Mode?" dialog never appears:
   `user_pref("toolkit.startup.recent_crashes", 0)` in the copy's prefs.js.
4. Launch: `/tmp/.../app --profile /tmp/test-profile --no-remote > log 2>&1 &`
5. **Make the sandbox copy before clicking anything in the live browser.**
   Reproducing in the user's real window kills their session.

Repro flakiness note: the hang reproduced ~50–100% at startup with the
triggering workspace active. If a launch is clean, just relaunch — don't
conclude "fixed" from one run.

## UI-driver gotchas (macOS AX driving of the browser)

- Firefox/XUL context menus don't appear in AX outlines; verify menu
  behavior via DOM state or console eval instead of hunting for menu items.
- `act_ui` keypress with key name `Enter` on the Browser Console editor
  silently did nothing; `Return` executes. If an eval "didn't run", retry
  with `Return` before concluding.
- Preferred eval-with-side-effect pattern: have the eval write its result
  to a file with the nsIFileOutputStream snippet (above) and read the file
  in bash — console AX output is noisy and hard to read.
- Repeated `pkill -9` triggers the Troubleshoot Mode dialog (see crash
  counter reset above).

## Where mod changes get committed

Zen Sine mods live in the browser profile and are tracked in **yadm**
(dotfiles), not in this repo and not per-mod git repos:

- `yadm list -a | grep sine-mods` to see what's tracked.
- Run yadm from `$HOME` (worktree root); paths are `Library/Application
  Support/zen/...`.
- `yadm commit -m` heredocs break on parens — use `yadm commit -F <file>`.
