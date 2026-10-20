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

# Pull requests

Create pull requests from this checkout against the personal fork, `Jish2/desktop`. Use `dev` as the base branch unless the user names another branch.

Before creating a PR, pass `--repo Jish2/desktop` explicitly and verify that the resulting URL starts with `https://github.com/Jish2/desktop/pull/`.

Create a PR against `zen-browser/desktop` only when the user explicitly requests an upstream Zen Browser PR in the current message.
