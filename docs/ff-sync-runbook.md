# Firefox sync runbook

How to move this fork to a newer upstream Zen/Firefox, and what to check before
calling it done. The previous syncs are the reference: `50e924445` /
`c9c8e6b7e` (FF156) and the `merge/upstream-1.24.3b` branch (FF160).

## Branch shape

```sh
git switch -c merge/upstream-<version> dev
git fetch upstream --tags
git merge upstream/dev
```

Open the PR against `Jish2/desktop` with base `dev`. Never force-push `dev`.

## The patch layer is the dangerous part

`src/**/*.patch` files are applied to `engine/` by surfer with
`git apply --ignore-space-change --ignore-whitespace`. Consequences:

- **Hunk context drifts silently.** A patch can apply partially, leaving an API
  rename or a deleted rule unnoticed, with no git conflict to warn you.
- **A regenerated patch can lose a rule the old build had.** FF160 dropped
  `.urlbar[breakout][open] > .urlbarView { display: flex }` from stock CSS; the
  regenerated patch kept the badge rule and lost the display rule, so results
  were produced but never painted.

After a sync, confirm every patch applies cleanly:

```sh
cd src && for p in $(find . -name '*.patch' | sed 's|^\./||' | sort); do
  (cd ../engine && git apply --reverse --check --ignore-space-change \
      --ignore-whitespace "../src/$p") || echo "NOT APPLIED: $p"
done
```

Then, **for each patch you regenerated**, diff the target file between the
previous installed build and the new one and confirm only the intended lines
moved:

```sh
diff <(unzip -p /Applications/Satori.app.backup/Contents/Resources/browser/omni.ja <path>) \
     <(unzip -p /Applications/Satori.app/Contents/Resources/browser/omni.ja <path>)
```

Do not hand-count hunk headers. Generate the patch mechanically from a real
diff, and prefer `scripts/recalculate-patches.sh` over editing headers by hand;
hand-editing produces `corrupt patch` and `misordered hunks` errors that cost
more time than regenerating.

## Grep for moved symbols after every major bump

An API move breaks a patch silently. Known moves so far:

| FF | Moved or changed |
| --- | --- |
| 156 | `UrlbarUtils.PROVIDER_TYPE` → `UrlbarShared.PROVIDER_TYPE` |
| 160 | `UrlbarUtils.getIconForUrl` → `UrlbarShared.getIconForUrl` |
| 160 | `UrlbarUtils.HIGHLIGHT` → `UrlbarShared.HIGHLIGHT` |
| 160 | `resource:///modules/sessionstore/*` → `moz-src:///browser/components/sessionstore/*` |
| 160 | `getViewUpdate(result)` → `getViewUpdate(result, controller)` |
| 160 | `gZenKeyboardShortcutsManager` global removed; use `ZenKeyboardShortcuts` + `getShortcuts(window)` |
| 160 | `XPCOMUtils.defineESModuleGetters` → `XPCOMUtils.declareLazy` in some modules |

Run the checks rather than reading for them:

```sh
# every module URI referenced by fork code must resolve in the build
~/.local/bin/sine-mod-doctor --app /Applications/Satori.app \
  --profile "$HOME/Library/Application Support/zen/Profiles/<profile>"
```

## Never merge with unexplained test failures

A failing browser-chrome test that you cannot explain is a bug report, not test
drift. The FF160 sync shipped with four unexplained urlbar failures, labelled
"probably stale expectations"; they were the same CSS regression users hit on
first launch. Treat an unexplainable failure as blocking.

## Build and verify

```sh
ZEN_RELEASE=1 ZEN_GA_DISABLE_PGO=1 ZEN_DISABLE_LTO=1 npm run build -- --jobs 6
```

The release mozconfig is `--disable-tests`, so browser-chrome tests need a
separate test-enabled object directory. Run the fork suites before installing:

```sh
cd engine && ./mach mochitest --headless zen/tests/urlbar zen/tests/tabs \
  zen/tests/media zen/tests/kbs zen/tests/container_essentials
```

Then install through the signed pipeline, not `npm run package` alone — see
[`local-build-pipeline.md`](./local-build-pipeline.md).

## Assert behaviour you can see, not just state you can read

`rows.length > 0` passes while a panel is `display: none` with zero height. Any
test asserting that a UI surface appeared should assert appearance:

```js
Assert.notEqual(getComputedStyle(view).display, "none");
Assert.ok(view.getBoundingClientRect().height > 0);
```
