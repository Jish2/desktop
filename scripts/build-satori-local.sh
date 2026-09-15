#!/usr/bin/env bash
# build-satori-local.sh — end-to-end local release pipeline for Satori (macOS arm64).
#
#   build → package → inject bundle files → sign (Developer ID, passkey entitlement)
#         → DMG → notarize → staple → release notes + upload command
#
# Encodes the operational lessons from 2026-09-15; read the comments at each
# phase before deleting them, they are the troubleshooting guide.
#
# Usage:
#   scripts/build-satori-local.sh [start-phase]
#     start-phase: preflight|import|build|package|extract|sign|dmg|notarize|ship
#
# Knobs (env):
#   SKIP_IMPORT=1     skip surfer import entirely (tree already patched)
#   SKIP_NOTARIZE=1   stop after signing the DMG (no Apple round-trip)
#   UPLOAD=1          actually create the GitHub prerelease + upload the DMG
#   SIGN_IDENTITY=..  override "Developer ID Application: Joshua Goon (4NNR2DBK2F)"
#   NOTARY_PROFILE=.. override keychain profile name (default satori-notary)
#   PROFILE_PATH=..   override provisioning profile location
set -euo pipefail
shopt -s nullglob

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ROOT/engine"
OBJ="$ENGINE/obj-aarch64-apple-darwin"
WORK="${WORK:-/tmp/satori-local-build}"
PHASES=(preflight import build package extract inject sign verify dmg notarize ship)

SIGN_IDENTITY="${SIGN_IDENTITY:-Developer ID Application: Joshua Goon (4NNR2DBK2F)}"
NOTARY_PROFILE="${NOTARY_PROFILE:-satori-notary}"
PROFILE_PATH="${PROFILE_PATH:-$HOME/Downloads/Satori_Developer_ID.provisionprofile}"
BUNDLE_ID_PLAIN="com.jgoon.satori"
TEAM_ID="4NNR2DBK2F"
ART_HASH=""  # filled in preflight

export ZEN_RELEASE=1 ZEN_RELEASE_BRANCH="${ZEN_RELEASE_BRANCH:-alpha}" \
       ZEN_DISABLE_LTO=1 ZEN_GA_DISABLE_PGO=1
# Local builds skip full-LTO ('release' branch would trigger MOZ_LTO=cross,full)
# and PGO profile-use, which fetches ~/artifact/merged.profdata in CI only.

log()  { printf '\033[1;36m== %s ==\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '\033[1;33mWARN:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mFAIL:\033[0m %s\n' "$*" >&2; exit 1; }
have_phase() { local t="$1" p; for p in "${PHASES[@]}"; do [[ "$p" == "$t" ]] && return 0; done; return 1; }

# ───────────────────────── preflight ─────────────────────────
preflight() {
  log "preflight"
  [[ -x "$ENGINE/mach" ]] || die "no engine/mach — run 'npm run init' first (fresh engine download needed)"
  [[ -f "$PROFILE_PATH" ]] || die "provisioning profile not found at $PROFILE_PATH (set PROFILE_PATH)"
  security find-identity -v -p codesigning | grep -qF "$SIGN_IDENTITY" \
    || die "identity '$SIGN_IDENTITY' not in keychain"
  xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1 \
    || die "notarytool keychain profile '$NOTARY_PROFILE' unavailable (notarytool store-credentials)"
  grep -q "$TEAM_ID.$BUNDLE_ID_PLAIN" "$ROOT/configs/macos/entitlements/satori.browser.xml" \
    || die "entitlements XML lacks $TEAM_ID.$BUNDLE_ID_PLAIN"

  # passkey profile self-check (from docs/macos-fork-passkeys.md)
  local tmp="$WORK/preflight"; mkdir -p "$tmp"
  security cms -D -i "$PROFILE_PATH" > "$tmp/profile.plist"
  [[ "$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:com.apple.developer.web-browser.public-key-credential' "$tmp/profile.plist" 2>/dev/null)" == "true" ]] \
    || die "profile lacks passkey entitlement — redownload after Apple approval"
  [[ "$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:com.apple.application-identifier' "$tmp/profile.plist")" == "$TEAM_ID.$BUNDLE_ID_PLAIN" ]] \
    || die "profile app-id mismatch"

  # engine branding must already contain today's configs art; if not, import must run.
  ART_HASH=$(shasum -a 256 "$ROOT/configs/branding/release/logo512.png" | cut -d' ' -f1)
  if [[ "$(shasum -a 256 "$ENGINE/browser/branding/release/logo512.png" 2>/dev/null | cut -d' ' -f1)" == "$ART_HASH" ]]; then
    log "engine branding art in sync (logo512 $ART_HASH)"
  else
    warn "engine branding art differs from configs — import phase will resync"
  fi

  # identity patch probe: the tree must say satori, not zen, after patching.
  if grep -q 'MOZ_MACBUNDLE_ID="satori"' "$ENGINE/browser/branding/release/configure.sh" 2>/dev/null; then
    log "identity patch present (MOZ_MACBUNDLE_ID=satori)"
  else
    warn "identity patch not visible in engine branding — import phase required"
  fi
}

# ───────────────────────── import ─────────────────────────
# surfer import CANNOT self-heal this engine: engine/.git is an orphan (no
# commits), so its internal 'git checkout .' reset is a no-op and re-applying
# patches over a drifted tree fails. We tolerate failure after verifying the
# patch *intents* are already present (reverse-apply probes).
import() {
  [[ "${SKIP_IMPORT:-0}" == "1" ]] && { log "import skipped (SKIP_IMPORT=1)"; return; }
  log "surfer import (tolerant mode)"
  if npm --prefix "$ROOT" run import; then
    log "import succeeded cleanly"
    return
  fi
  warn "surfer import failed — verifying tree state by probes instead"
  grep -q 'MOZ_MACBUNDLE_ID="satori"' "$ENGINE/browser/branding/release/configure.sh" \
    || die "configure.sh identity still unpatched; engine needs fresh 'npm run init'"
  (cd "$ENGINE" && git apply --check -R "../src/tools/signing/macos/mach_commands-py.patch") \
    || die "mach_commands signing patch not in final state"
  [[ "$(shasum -a 256 "$ENGINE/browser/branding/release/logo512.png" | cut -d' ' -f1)" == "$ART_HASH" ]] \
    || die "engine branding art stale after import attempt"
  log "probes pass — tree is in the intended patched state; proceeding"
}

# ───────────────────────── build / package ─────────────────────────
build() {
  log "surfer build (ZEN_RELEASE=1, no LTO, no PGO)"
  (cd "$ROOT" && npm run build)
}
package() {
  log "mach package"
  (cd "$ENGINE" && ./mach package)
}

# ───────────────────────── extract ─────────────────────────
PACKAGED_APP="$WORK/staging/Satori.app"
extract() {
  log "extract packaged app"
  rm -rf "$WORK/staging" && mkdir -p "$WORK/staging"
  local zip
  zip=$(ls -t "$OBJ"/dist/*.en-US.mac.zip 2>/dev/null | head -1 || true)
  if [[ -n "${zip:-}" ]]; then
    unzip -q "$zip" -d "$WORK/staging"
  else
    local dmg
    dmg=$(ls -t "$OBJ"/dist/*.en-US.mac.dmg 2>/dev/null | head -1 || true)
    [[ -n "${dmg:-}" ]] || die "no packaged zip/dmg in $OBJ/dist — did 'mach package' run?"
    warn "no zip; extracting from $dmg"
    local mp="$WORK/dmg-mount"; mkdir -p "$mp"
    hdiutil attach -nobrowse -readonly -mountpoint "$mp" "$dmg"
    cp -RL "$mp/Satori.app" "$WORK/staging/"
    hdiutil detach "$mp" -quiet
  fi
  [[ -x "$PACKAGED_APP/Contents/MacOS/zen" ]] || die "extracted bundle malformed"
  local n; n=$(find "$PACKAGED_APP" -type l | wc -l | tr -d ' ')
  [[ "$n" == "0" ]] || warn "$n symlinks remain (packaged app should be link-free) — will dereference"
  mv "$PACKAGED_APP" "$PACKAGED_APP.tmp" && cp -RL "$PACKAGED_APP.tmp" "$WORK/staging/" && rm -rf "$PACKAGED_APP.tmp" || true
  [[ "$(defaults read "$WORK/staging/Satori.app/Contents/Info" CFBundleIdentifier)" == "$BUNDLE_ID_PLAIN" ]] \
    || die "wrong bundle id in packaged app"
  log "packaged app ready: $(du -sh "$PACKAGED_APP" | cut -f1)"
}

# ───────────────────────── inject ─────────────────────────
inject() {
  log "inject app-bundle-files (Sine bootstrap + DisableAppUpdate policy)"
  cp -R "$ROOT/configs/macos/app-bundle-files/" "$PACKAGED_APP/Contents/Resources/"
  for f in config.js defaults/pref/config-prefs.js distribution/policies.json; do
    [[ -f "$PACKAGED_APP/Contents/Resources/$f" ]] || die "missing Resources/$f after inject"
  done
  # after this point the bundle must not change until signing completes
}

# ───────────────────────── sign ─────────────────────────
sign() {
  log "sign with production passkey entitlements"
  cp "$PROFILE_PATH" "$ENGINE/embedded.provisionprofile"          # mach moves this into Contents/
  cp "$ROOT/configs/macos/entitlements/satori.browser.xml" \
     "$ENGINE/security/mac/hardenedruntime/production/firefox.browser.xml"
  grep -q "$TEAM_ID.$BUNDLE_ID_PLAIN" "$ENGINE/security/mac/hardenedruntime/production/firefox.browser.xml" \
    || die "entitlements copy missing app id"
  (cd "$ENGINE" && ./mach macos-sign -v -c release -e production -a "$PACKAGED_APP" -s "$SIGN_IDENTITY")
}

# ───────────────────────── verify ─────────────────────────
verify() {
  log "verify signature"
  codesign --verify --deep --strict --verbose=2 "$PACKAGED_APP" 2>&1 | tail -3
  codesign -dvv "$PACKAGED_APP" 2>&1 | grep -E "^(Signature|TeamIdentifier|Identifier)" || die "codesign dump failed"
  codesign -d --entitlements :- "$PACKAGED_APP" 2>/dev/null | grep -q "public-key-credential" \
    || die "passkey entitlement missing from signed app"
  [[ -f "$PACKAGED_APP/Contents/embedded.provisionprofile" ]] \
    || die "provision profile not embedded"
  spctl --assess --type execute -vvv "$PACKAGED_APP" 2>&1 | tail -1 || true
}

# ───────────────────────── dmg ─────────────────────────
DMG_PATH=""  # set in dmg()
dmg() {
  log "create DMG"
  local version dmgname
  version=$(defaults read "$PACKAGED_APP/Contents/Info" CFBundleShortVersionString)
  dmgname="satori-${version}-arm64.dmg"
  DMG_PATH="$WORK/$dmgname"
  rm -rf "$WORK/dmg-root" && mkdir -p "$WORK/dmg-root"
  ln -s /Applications "$WORK/dmg-root/Applications"
  cp -R "$PACKAGED_APP" "$WORK/dmg-root/"
  rm -f "$DMG_PATH"
  hdiutil create -volname "Satori $version" -srcfolder "$WORK/dmg-root" -ov -format UDZO "$DMG_PATH"
  codesign --force --sign "$SIGN_IDENTITY" "$DMG_PATH"
  log "DMG built & signed: $DMG_PATH ($(du -sh "$DMG_PATH" | cut -f1))"
}

# ───────────────────────── notarize ─────────────────────────
notarize() {
  [[ "${SKIP_NOTARIZE:-0}" == "1" ]] && { warn "notarization skipped (SKIP_NOTARIZE=1)"; return; }
  log "notarize (Apple round-trip, a few minutes)"
  xcrun notarytool submit "$DMG_PATH" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$DMG_PATH"
  spctl --assess --type open --context context:primary-signature -v "$DMG_PATH" 2>&1 | tail -1 || true
  log "stapled"
}

# ───────────────────────── ship ─────────────────────────
ship() {
  local version sha tag
  version=$(defaults read "$PACKAGED_APP/Contents/Info" CFBundleShortVersionString)
  sha=$(shasum -a 256 "$DMG_PATH" | cut -d' ' -f1)
  tag=$(gh release list --repo Jish2/desktop --limit 20 --json tagName --jq '.[].tagName' \
        | grep -E "satori-${version}-preview\.[0-9]+$" | sed 's/.*preview\.//' | sort -n | tail -1)
  tag="satori-${version}-preview.$((${tag:-0} + 1))"
  {
    echo "Next release tag : $tag"
    echo "SHA-256          : $sha"
    echo "DMG              : $DMG_PATH"
    echo "Source commit    : $(git -C "$ROOT" rev-parse HEAD)"
    echo
    echo "Upload with:"
    echo "  git tag -a $tag <release-branch-tip> && git push origin $tag"
    echo "  gh release create $tag --repo Jish2/desktop --prerelease --title \"Satori $version Preview N (macOS ARM64)\" --notes-file NOTES.md '$DMG_PATH'"
  } | tee "$WORK/ship.txt"
  if [[ "${UPLOAD:-0}" == "1" ]]; then
    [[ -f "$WORK/NOTES.md" ]] || die "UPLOAD=1 needs notes at $WORK/NOTES.md"
    gh release create "$tag" --repo Jish2/desktop --prerelease --title "Satori $version" --notes-file "$WORK/NOTES.md" "$DMG_PATH"
    log "release published: https://github.com/Jish2/desktop/releases/tag/$tag"
  fi
}

# ── driver ──
start="${1:-preflight}"
have_phase "$start" || die "unknown start phase '$start' (one of: ${PHASES[*]})"
go=0
for p in "${PHASES[@]}"; do
  [[ "$p" == "$start" ]] && go=1
  [[ "$go" == "1" ]] && "$p"
done
log "pipeline complete → $WORK"
