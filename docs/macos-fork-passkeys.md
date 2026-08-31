# Sign a Zen fork for macOS passkeys

This guide covers native iCloud Keychain passkeys and Touch ID in a locally built Zen fork. A normal ad hoc signature or an ordinary Developer ID signature is not enough. Apple must grant the fork's App ID the restricted passkey capability, and the signed app must contain a matching provisioning profile.

Apple Passwords autofill is a separate integration. Native passkeys can work without the Apple Passwords Firefox extension, while the extension may still reject a fork that Apple has not allowlisted.

## Choose the app identity

Create a unique bundle identifier for the fork. Do not reuse Zen's `app.zen-browser.zen` identifier or its signing Team ID.

The examples below use these placeholders:

```text
BUNDLE_ID=com.example.zenfork
TEAM_ID=ABCDE12345
APPLICATION_ID=ABCDE12345.com.example.zenfork
```

Find the Team ID under Membership details in the [Apple Developer account](https://developer.apple.com/account/).

## Request Apple's passkey capability

The required entitlement is:

```text
com.apple.developer.web-browser.public-key-credential
```

It is a managed capability. Holding a paid Apple Developer membership does not grant it automatically.

1. Register an explicit macOS App ID for the fork's bundle identifier.
2. Sign in as the Apple Developer Account Holder.
3. Submit Apple's [macOS browser passkey request](https://developer.apple.com/contact/request/macos-browsers-passkeys/).
4. Wait for Apple to approve the request.
5. Open Certificates, Identifiers & Profiles and enable the approved capability for the App ID.

Apple requires the app to behave as a general web browser. Its `Info.plist` must register the HTTP and HTTPS schemes, and the app must navigate directly to requested web content. See Apple's [entitlement documentation](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.web-browser.public-key-credential).

## Create the signing assets

After approval, regenerate the provisioning profile. A profile created before approval will not contain the new entitlement.

For a local build, create:

- An Apple Development certificate
- A macOS Development provisioning profile for the explicit App ID

For a build distributed outside the Mac App Store, create:

- A Developer ID Application certificate
- A Developer ID provisioning profile for the explicit App ID
- Notarization credentials

Export the signing certificate and private key from Keychain Access as a password-protected `.p12` only if the signing tool or CI requires it. Never commit the `.p12`, its password, or notarization credentials.

Inspect the downloaded profile before using it:

```bash
security cms -D -i "/path/to/ZenFork.provisionprofile" > /tmp/zen-fork-profile.plist
/usr/libexec/PlistBuddy \
  -c "Print :Entitlements:com.apple.developer.web-browser.public-key-credential" \
  /tmp/zen-fork-profile.plist
/usr/libexec/PlistBuddy \
  -c "Print :Entitlements:com.apple.application-identifier" \
  /tmp/zen-fork-profile.plist
```

The first command should print `true`. The second should print the exact application identifier, such as `ABCDE12345.com.example.zenfork`.

## Configure the fork's identity

The bundle identifier, application identifier, certificate Team ID, and provisioning profile must agree.

Firefox constructs the final bundle identifier as
`<distribution-id>.<MOZ_MACBUNDLE_ID>`. In this repository, the release-only
distribution ID and app basename are set in:

```text
configs/common/mozconfig
```

The shared `appId` in `surfer.json` remains `zen` so Twilight keeps its
upstream identity. The release branding override is applied by:

```text
src/browser/branding/release/configure-sh.patch
```

For example, use `com.example` as the release distribution ID and `zenfork`
as the release `MOZ_MACBUNDLE_ID` to produce `com.example.zenfork`.

After branding is generated, release builds read:

```text
engine/browser/branding/release/configure.sh
```

Twilight builds use:

```text
engine/browser/branding/twilight/configure.sh
```

Put the release-specific production entitlements in:

```text
configs/macos/entitlements/satori.browser.xml
```

Its application identifier must use the fork's Team ID and bundle identifier:

```xml
<key>com.apple.application-identifier</key>
<string>ABCDE12345.com.example.zenfork</string>

<key>com.apple.developer.web-browser.public-key-credential</key>
<true/>
```

Before signing a Satori release, copy that file over the generated production
entitlements and confirm that it contains the expected values:

```text
engine/security/mac/hardenedruntime/production/firefox.browser.xml
```

Do not copy Zen's Team ID from the existing patch. Apple validates the entitlement against the certificate and provisioning profile used for the fork.

## Build, package, and sign

Build and package the fork using the normal Zen build process. Sign the packaged `.app`, not the unbundled app inside the object directory. Firefox's signing command expects a writable app extracted from the package because the object-directory app contains symlinks.

From the `engine` directory, place the approved profile where the signing command expects it:

```bash
cp "/path/to/ZenFork.provisionprofile" ./embedded.provisionprofile
```

Install the Satori release entitlements, then sign with the production
entitlement set and an identity installed in the login keychain:

```bash
cp ../configs/macos/entitlements/satori.browser.xml \
  security/mac/hardenedruntime/production/firefox.browser.xml

./mach macos-sign \
  -v \
  -c release \
  -e production \
  -a "/absolute/path/to/Zen Fork.app" \
  -s "Developer ID Application: Your Name (ABCDE12345)"
```

Use the exact identity shown by:

```bash
security find-identity -v -p codesigning
```

For local development, an approved Apple Development certificate and matching development profile can be used in place of the Developer ID identity. Do not use `-e developer`; that entitlement set intentionally omits restricted passkey access.

The repository's release workflow performs that copy for Satori release builds
and uses the equivalent `rcodesign` path in
`.github/workflows/macos-universal-release-build.yml`. Twilight continues to
use its existing production entitlements. The workflow supplies a `.p12`,
password file, provisioning profile, and `-e production`. The same CI
structure can be used with the fork's signing assets stored as encrypted
secrets.

Sign only after all changes to the app bundle are complete. Changing a binary, resource, framework, helper, or extension under the signed `.app` invalidates the seal. Profile-level browser CSS and settings do not modify the app bundle.

## Verify the signed app

Run these checks against the final app:

```bash
APP="/absolute/path/to/Zen Fork.app"

codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dvv "$APP" 2>&1
codesign -d --entitlements :- "$APP" 2>/dev/null
defaults read "$APP/Contents/Info" CFBundleIdentifier
security cms -D -i "$APP/Contents/embedded.provisionprofile"
```

Confirm all of the following:

- `Signature` is not `adhoc`.
- `TeamIdentifier` is the fork's Team ID.
- `CFBundleIdentifier` is the fork's bundle identifier.
- `com.apple.application-identifier` is `<TEAM_ID>.<BUNDLE_ID>`.
- `com.apple.developer.web-browser.public-key-credential` is `true`.
- The embedded profile contains the same application identifier and passkey entitlement.

Open `about:config` in the signed browser and confirm that `security.webauthn.enable_macos_passkeys` is `true`. Test registration and authentication on a WebAuthn test site before testing a site-specific login.

## Notarize a distributed build

Notarization is not what grants passkey access, but it is required for normal distribution outside the Mac App Store.

After creating and signing the DMG:

```bash
xcrun notarytool submit "/path/to/zen-fork.dmg" \
  --keychain-profile "zen-fork-notary" \
  --wait

xcrun stapler staple "/path/to/zen-fork.dmg"
```

Store notarization credentials in the keychain with `notarytool store-credentials` or in encrypted CI secrets.

## Enable the Apple Passwords extension

The passkey entitlement gives the browser access to macOS AuthenticationServices for native passkey registration and assertion. It does not automatically authorize the Apple Passwords Firefox extension.

Apple's native Passwords helper validates the browser's bundle identifier, code-signing identifier, and Team ID. A fork signed by another team is a different browser. Request that Apple add the fork to [`apple/password-manager-resources`](https://github.com/apple/password-manager-resources), including its exact distribution identity. The change may require a later macOS update before the helper accepts the browser.

Until Apple allowlists the fork, native iCloud passkeys may work while password and verification-code autofill from the extension remains unavailable.

## Troubleshooting

`Signature=adhoc` or `TeamIdentifier=not set` means the final app was not signed with the Apple-issued identity, or another tool replaced the signature afterward.

`Unsatisfied entitlements: com.apple.developer.web-browser.public-key-credential` means the entitlement, certificate, App ID, and embedded profile do not match. Check the application identifier first.

If the app will not launch after signing, verify that the profile was issued for the same Team ID and bundle identifier and that every nested executable was signed by the recursive `mach macos-sign` process.

If macOS shows only a hardware security-key prompt, inspect the final app's entitlement and confirm `security.webauthn.enable_macos_passkeys` is enabled.

If the Apple Passwords extension claims that a newer macOS version is required while native passkeys work, the extension helper is probably rejecting the fork's distribution identity. Signing alone cannot bypass that allowlist.
