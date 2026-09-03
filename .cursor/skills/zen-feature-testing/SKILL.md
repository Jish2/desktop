---
name: zen-feature-testing
description: Validates Zen Browser source changes with focused linting, browser-chrome mochitests, and isolated runtime checks. Use when testing, debugging, or signing off changes under src/, locales/, or engine/browser/, including command, shortcut, urlbar, media, and localization behavior.
---

# Zen feature testing

Prefer deterministic browser-chrome assertions. A successful launch or a
command that does not throw is a smoke test, not runtime sign-off.

## Workflow

1. Inspect the complete working tree:

   ```sh
   git status --short
   git diff --name-only
   git diff --cached --name-only
   git ls-files --others --exclude-standard
   ```

2. Find the nearest test manifest, shared `head.js`, and neighboring tests.
   Start with one test that exercises the changed behavior, then run its owning
   manifest or directory.
3. Prepare the build only as far as the change requires. Follow the build
   selection guidance in `README.md`.
4. Run focused lint and tests.
5. Repair test infrastructure failures separately from product failures.
6. Use an isolated runtime check only when browser-chrome cannot cover the
   behavior.
7. Report exact assertions, test counts, and remaining manual checks.

## Source synchronization and builds

Files under `src/` are linked into `engine/`. English localization under
`locales/en-US/` is copied, so localization changes require:

```sh
python3 scripts/copy_language_pack.py en-US
```

Run that command from the repository root, then rebuild. Use the JavaScript UI
build for UI-only changes and a full build for native, build-system, mixed, or
uncertain changes. A full build is also required when the object directory
lacks browser-chrome helper programs. Do not clobber a healthy object directory
unless the conditions in `README.md` require it.

## Focused verification

Run lint from `engine/` with the narrowest relevant path:

```sh
./mach lint -l eslint zen/tests/<area>
```

Run the changed test first:

```sh
MOZ_HEADLESS=1 ./mach mochitest zen/tests/<area>/browser_<feature>.js
```

Then run the owning suite:

```sh
MOZ_HEADLESS=1 ./mach mochitest zen/tests/<area>
```

A valid pass has an exit code of zero, at least one executed test, and
`Unexpected results: 0`. A run that executes zero checks or fails before
`TEST_START` has not validated the feature.

Use a headed run only for behavior that depends on visible macOS rendering or
focus. If a headed suite finishes its tests and logs `must wait for focus`,
bring the test Zen process to the foreground or rerun headlessly.

## Browser-chrome test design

Exercise the user-visible chain, not only an internal method:

- Establish and assert the observable precondition.
- Trigger the command, shortcut, or UI entry through its browser-chrome seam.
- Assert the resulting content state and browser-owned state.
- Cover background tabs or windows when the feature promises cross-tab or
  cross-window behavior.
- Clean up tabs, preferences, observers, and media in `finally`.

Use `SpecialPowers.spawn` for content elements and page APIs. Wait for
browser-observed state such as tab attributes or controller state after a
content action. Follow nearby current tests for wait helpers. In the current
harness, generic polling uses `TestUtils.waitForCondition`.

For conditionally visible actions, test both branches: available while the
precondition holds and unavailable after the action completes.

## Test harness recovery

Classify failures before changing product code. An extension-install,
`ssltunnel`, Marionette startup, or missing test-file error is infrastructure.

If SpecialPowers or Mochikit installs as a corrupt extension because
`dist/xpi-stage` is empty, restore the staged extensions from `engine/`:

```sh
make -C obj-aarch64-apple-darwin install-dist_xpi-stage
```

If `ssltunnel` is missing, build its object-directory target:

```sh
make -C obj-aarch64-apple-darwin/testing/mochitest/ssltunnel
```

Rerun the exact focused test after each repair. A helper API exception shared
by unrelated tests usually indicates test drift; compare with nearby passing
tests before modifying feature code.

## Isolated runtime fallback

Use the built app, `--no-remote --new-instance`, and a disposable profile.
Never automate against a normal Zen profile. Prefer a local fixture over a
network site, and set only the preferences needed by the behavior under test.

For privileged checks, use Marionette or another structured browser protocol
to return JSON assertions from chrome and content contexts. Verify labels,
availability gates, command effects, and post-action state explicitly.

Reserve manual testing for OS integration, visible layout, audible output, and
user-assigned shortcuts that cannot be asserted reliably in browser-chrome.

## Sign-off

Sign off only when:

- the focused behavior test passes;
- its owning suite passes;
- relevant lint passes;
- the build is current for the changed file types;
- no harness error has been mistaken for a product result; and
- the working tree contains only understood changes.

State what was observed, what was automated, and what still needs a human
check. Keep product failures distinct from local build or harness repairs.
