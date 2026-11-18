# Local build and install pipeline

`scripts/build-satori-local.sh` is the supported way to produce a local Satori
install. It exists because a correctly signed macOS build needs more than
`npm run build` plus `npm run package`.

Read this before running the pipeline by hand, and read
[`macos-fork-passkeys.md`](./macos-fork-passkeys.md) for why the signing and
entitlement steps exist at all.

## Why the script exists

`npm run build` and `npm run package` produce an **ad hoc signed** app with no
entitlements. Native macOS passkeys and Touch ID require all three of:

- a Developer ID Application signature,
- the `com.apple.developer.web-browser.public-key-credential` entitlement, and
- an embedded provisioning profile whose App ID matches the signature.

Missing any one of them breaks passkeys while leaving the browser otherwise
functional, so the failure is easy to miss until you try to sign in somewhere.
The script performs the signing, embeds the profile, and then verifies the
result instead of assuming it worked.

## Phases

```
preflight import build package extract inject sign verify dmg notarize ship
```

Pass a phase name to start from it, which is how you avoid a full rebuild while
iterating on signing. Note the dispatcher runs the named phase **and every phase
after it** — there is no compile-only mode:

```sh
scripts/build-satori-local.sh            # preflight only (check-only)
scripts/build-satori-local.sh sign       # reuse the existing package
SKIP_NOTARIZE=1 scripts/build-satori-local.sh sign
```

| Phase | Does |
| --- | --- |
| `preflight` | Validates the entitlements XML, the provisioning profile, the signing identity, and the artifact hash. Fails loudly rather than producing a silently broken build. |
| `import` | Runs the surfer import (patches into `engine/`). |
| `build` / `package` | Release build and DMG packaging. |
| `extract` / `inject` | Unpacks the packaged app and injects the fork's bundle files. |
| `sign` | Copies the profile to `engine/embedded.provisionprofile`, installs the entitlements, and runs `mach macos-sign -e production`. |
| `verify` | Confirms the signature and greps the entitlement back out of the signed app. |
| `dmg` / `notarize` / `ship` | Rebuilds the DMG, notarizes, staples, and optionally uploads. |

## Make front-end

`make` wraps the same script. Prefer it: the targets are discoverable and the
install step refuses to ship an app that lacks the passkey entitlement.

```sh
make help          # list targets
make check         # preflight only
make full          # preflight, then build -> sign -> signed DMG
make install       # install the SIGNED app from staging
make status        # installed vs built: version, stamp, signing, passkeys
make doctor        # check local Sine mods against the installed build
make uninstall-safe   # restore /Applications/Satori.app.backup
```

Notarization is off by default (`SKIP_NOTARIZE=1`) because most local runs have
no `satori-notary` keychain profile. Opt in with `make full SKIP_NOTARIZE=0`.

Resume mid-pipeline with `make resume PHASE=sign`.

`make install` installs from `$WORK/staging/Satori.app`, **not** from the DMG
that `npm run package` writes. That distinction matters: the npm DMG is ad hoc
signed and has no entitlements, so installing it silently breaks macOS passkeys.

Relevant environment knobs are documented in the script header
(`SKIP_IMPORT`, `SKIP_NOTARIZE`, `SIGN_IDENTITY`, `NOTARY_PROFILE`,
`PROFILE_PATH`, `UPLOAD`).

## Verify after installing, not just after building

Confirm the fix or feature is present **in the installed bundle**. Build output
under `engine/obj-*/dist/` does not always lay resources out the way the
packaged app does, so checking only the objdir can produce a false pass.

```sh
codesign -dv /Applications/Satori.app 2>&1 | grep -E 'Authority|Signature'
codesign -d --entitlements :- /Applications/Satori.app 2>/dev/null \
  | grep public-key-credential
```

Expected: an `Authority=Developer ID Application: ...` line and
`<true/>` for the passkey entitlement. `Signature=adhoc` means the pipeline was
not used.

## Inspecting a built app

The packaged app splits its JavaScript across two archives, which matters when
tracking down where a module or stylesheet actually lives:

| Path inside `Satori.app/Contents/Resources/` | Contains |
| --- | --- |
| `omni.ja` | `moz-src/**` (converted Firefox and Zen modules) and `modules/` |
| `browser/omni.ja` | `chrome/**` (XUL, CSS, front-end modules) and `modules/zen/**` |

```sh
# which archive has a module
for a in omni.ja browser/omni.ja; do
  unzip -l "/Applications/Satori.app/Contents/Resources/$a" | grep -iE 'ZenFoo|urlbar'
done

# read a file without extracting
unzip -p /Applications/Satori.app/Contents/Resources/browser/omni.ja \
  chrome/browser/skin/classic/browser/urlbar/view-proton.css | head
```

The installer rotates the previous app to `/Applications/Satori.app.backup`, so
diffing the installed build against the one it replaced is free and is the
fastest way to see what a change actually did:

```sh
diff <(unzip -p /Applications/Satori.app.backup/Contents/Resources/browser/omni.ja \
          chrome/browser/skin/classic/browser/urlbar/view-proton.css) \
     <(unzip -p /Applications/Satori.app/Contents/Resources/browser/omni.ja \
          chrome/browser/skin/classic/browser/urlbar/view-proton.css)
```

Prefer this to reading the source tree when the question is "did this reach the
build", because it compares shipped artifacts rather than intent.
