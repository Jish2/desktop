# Zen / Satori: what goes where

Zen Browser work spans two stores. Pick by the kind of change:

- **This repo (zen-browser/desktop fork)**: engine/source changes —
  C++, `src/` front-end, patches, build scripts, anything that ships in
  the app bundle. Debugging notes for mod/app work live in
  `docs/zen-mods-debugging.md`.
- **yadm dotfiles (`yadm add` / `yadm commit` from `$HOME`)**: user
  configuration — Sine mods in the profile
  (`Library/Application Support/zen/Profiles/.../chrome/sine-mods/...`),
  `~/.config/zen/*`, prefs. Check with `yadm list -a | grep sine-mods`
  before creating any new repo for these files.

When a fix touches both (e.g. a mod workaround plus a real engine fix),
commit each half in its own store and cross-reference the commits.

# Before you build, sync, or debug

Read the doc for the task, not just the code. These exist because the
corresponding mistakes were made and cost hours:

- **Syncing to a newer Firefox/Zen** → `docs/ff-sync-runbook.md`.
  Patches apply to `engine/` with fuzzy matching and can silently keep
  part of a change; a regenerated patch can drop a rule the old build
  had. Never merge with an unexplained test failure.
- **Building or installing a local app you will actually use** →
  `docs/local-build-pipeline.md`. `npm run build` + `npm run package`
  is ad hoc signed with no entitlements, which breaks passkeys and
  Touch ID. Use `scripts/build-satori-local.sh`.
- **Debugging a Sine mod** → `docs/zen-mods-debugging.md`, and run
  `sine-mod-doctor` against the installed app first. A copied profile
  does not load `.uc.js` mods unless the window URL matches the mod's
  `include` patterns.
- **Writing or fixing browser-chrome tests** →
  `.cursor/skills/zen-feature-testing/SKILL.md`. Assert what is
  visible (computed style, layout height), not only that state was
  produced.
- **Signing, entitlements, passkeys** → `docs/macos-fork-passkeys.md`.

Verify a change in the **installed** bundle, not only in
`engine/obj-*/dist/`; the packaged app lays resources out differently.
Passkeys work only in a Developer ID signed build, so a local test
install that skips signing cannot validate them.

# Pull requests

Create pull requests from this checkout against the personal fork, `Jish2/desktop`. Use `dev` as the base branch unless the user names another branch.

Before creating a PR, pass `--repo Jish2/desktop` explicitly and verify that the resulting URL starts with `https://github.com/Jish2/desktop/pull/`.

Create a PR against `zen-browser/desktop` only when the user explicitly requests an upstream Zen Browser PR in the current message.
