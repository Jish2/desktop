<!--
   - This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/.
   -->
<!-- TODO: Get a job -->
<img src="./docs/assets/zen-dark.svg" width="100px" align="left">

### `Satori Browser`

[![Downloads](https://img.shields.io/github/downloads/Jish2/desktop/total.svg)](https://github.com/Jish2/desktop/releases)
[![Crowdin](https://badges.crowdin.net/zen-browser/localized.svg)](https://crowdin.com/project/zen-browser)
[![Satori Release builds](https://github.com/Jish2/desktop/actions/workflows/build.yml/badge.svg?branch=dev)](https://github.com/Jish2/desktop/actions/workflows/build.yml)

Satori is a personal fork of [Zen Browser](https://github.com/zen-browser/desktop),
a Firefox-based browser focused on productivity.

<div flex="true">
  <a href="https://github.com/Jish2/desktop/releases">
    Satori Releases
  </a>
  •
  <a href="https://docs.zen-browser.app">
    Upstream Documentation
  </a>
</div>

### Firefox Versions

- Satori Release is currently built using Firefox version `154.0.1`.
- The inherited Twilight configuration remains an upstream Zen development channel.

### Contributing

Report Satori-specific bugs on this fork's [GitHub Issues page](https://github.com/Jish2/desktop/issues/). Report reproducible upstream issues to [Zen Browser](https://github.com/zen-browser/desktop/issues/).

Satori is open source, and contributions are welcome. Please read the [contribution guidelines](./docs/contribute.md) before getting started.

#### Partners

Thanks to all the partners of Zen for their support and contributions:

<a href="https://blacksmith.sh">
  <img src="./docs/assets/blacksmith-yellow.png" width="350px"/>
</a>

### Building and installing a local macOS build

This runbook builds the ARM64 app from source and replaces an existing DMG installation without replacing its profile. Satori retains Zen's internal profile identifier, so it stores profile data at `~/Library/Application Support/zen/`.

Run every command in this section from the repository root. Surfer resolves `surfer.json`, `src/`, and the generated `engine/` tree relative to the current directory. Running Surfer from `engine/` can make it look for a nonexistent `engine/src/`.

#### First-time setup

Install GNU Tar, then install the Node dependencies and initialize the Firefox source tree:

```sh
brew install gnu-tar
npm ci
npm run init
python3 scripts/copy_language_pack.py en-US
```

Run `npm run init` once per checkout. It downloads and initializes the Firefox source and needs substantial disk space. The localization copy is required before the first build and whenever the files under `locales/en-US/` change. Without it, Settings and other browser UI can render without labels.

#### Build and package

After switching branches, rebasing, or pulling changes that affect `src/` or generated preferences, refresh the engine:

```sh
npm run import
```

If the inherited English localization changed, rerun `python3 scripts/copy_language_pack.py en-US` after the import.

Configure the release brand and build mode:

```sh
npm run surfer -- config brand release
npm run surfer -- config buildMode release
```

If the current object directory was previously built with another brand or build mode, clear its generated output before the release build:

```sh
./engine/mach clobber
```

This is required before the first release build after an unofficial or development build. A mixed object directory can leave incompatible generated WebIDL headers and fail with incomplete types such as `OwningArrayBufferViewOrArrayBuffer`. Clobbering removes build output, not source files, and the next build will be a full rebuild. It can be skipped when the object directory was already built with the same release configuration.

Build with the local macOS settings:

```sh
ZEN_RELEASE=1 ZEN_GA_DISABLE_PGO=1 ZEN_DISABLE_LTO=1 npm run build -- --jobs 6
npm run package
```

The six-job cap keeps local builds from saturating the machine. Lower it to four
if the system is still sluggish. CI builds are not affected.

For JavaScript-only changes after the first full build,
`npm run build:ui -- --jobs 6` can be used instead of `npm run build`. Use the
full build for native or core changes. Run a full build before browser-chrome
tests because the UI build may not produce test-only programs such as
`ssltunnel`.

#### Choosing a build target

Before rebuilding, inspect the complete working tree, including staged and untracked files:

```sh
git status --short
git diff --name-only
git diff --cached --name-only
```

Use `npm run build:ui` only when the changes are limited to JavaScript in the UI layer. Use the full `npm run build` for changes to C++, Objective-C or Objective-C++, headers, Rust, Cargo files, build configuration, dependencies, Firefox versions, or any mixed or uncertain change set.

If the Firefox source tree was recreated or is missing, run `npm run init` again. When in doubt, import again and use the full build.

#### Compare the installed build with the source

Satori records the source repository and commit SHA in the installed app. Compare that SHA with the checkout before rebuilding:

```sh
installed_app="/Applications/Satori.app"
test -f "$installed_app/Contents/Resources/application.ini"
installed_sha="$(awk -F= '$1 == "SourceStamp" { print $2; exit }' "$installed_app/Contents/Resources/application.ini")"
source_sha="$(git rev-parse HEAD)"

test -n "$installed_sha"
git cat-file -e "$installed_sha^{commit}"
printf 'Installed build: %s\nSource checkout: %s\n' "$installed_sha" "$source_sha"
git log --oneline "$installed_sha..$source_sha"
git diff --stat "$installed_sha..$source_sha"
```

Use `git diff "$installed_sha..$source_sha"` to inspect the committed changes between builds. Also inspect local changes because the embedded SHA does not include uncommitted or untracked files:

```sh
git status --short
git diff "$installed_sha"
git diff --cached
git ls-files --others --exclude-standard
```

If the installed SHA is not present in the local repository history, fetch the required history before running the comparison. Use the changed files and their contents to decide between `npm run build:ui` and a full build.

#### Back up the profile and replace the app

Install from the generated DMG with the guarded installer. Do not copy `engine/obj-aarch64-apple-darwin/dist/Satori.app`; that directory is an unpackaged build artifact with development links and an incomplete runtime resource layout.

```sh
npm run install:macos -- --check
```

The preflight checks that the DMG exists and verifies that Sine can survive the replacement. If a Satori profile contains Sine but the installed app is missing either bootloader file, the installer stops instead of silently disabling Sine.

Quit every Satori window, then install:

```sh
npm run install:macos
```

The installer refuses to run while Satori or the legacy Zen app is open. It validates the packaged localization and source commit, copies both Sine bootloader files into the staged app, backs up the profile to the Desktop, rotates the installed app to an adjacent `.backup`, and then relaunches Satori.

After launch, check `about:profiles` if Satori appears to be a fresh install. Select the desired profile rather than deleting or copying over profile files. The local app is unsigned, so macOS may require opening it through Control-click > Open, and automatic updates may not work.

#### Troubleshooting

If initialization reports that GNU Tar is required, install it with `brew install gnu-tar` and rerun `npm run init`. If a release build reports that no adequate linker was found, use the `ZEN_RELEASE=1 ZEN_GA_DISABLE_PGO=1 ZEN_DISABLE_LTO=1` build command above.

Incomplete-type errors in a generated binding header, especially `WebAuthenticationBinding.h`, usually mean the object directory was reused across build configurations. From the repository root, run `./engine/mach clobber`, then repeat the full release build. Do not run `surfer build` from inside `engine/`.

A `FileExistsError` under `engine/obj-aarch64-apple-darwin/dist/xpi-stage/` also indicates stale generated output, often after an interrupted build. Run `./engine/mach clobber` and repeat the full build rather than removing files from the source tree.

An `engine/.git/index.lock` warning can occur during Firefox source initialization. Wait for any active Git process to finish before removing a stale lock or retrying.
