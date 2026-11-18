# Satori local build/release pipeline (macOS arm64).
#
# Thin front-end over scripts/build-satori-local.sh. That script holds the
# operational knowledge; this file makes it discoverable and gives it a correct
# default flow. Run `make help` first.
#
# Why this exists: `npm run build && npm run package` produces an ADHOC-signed
# app with no entitlements. That silently broke macOS passkeys once. Everything
# here goes through the signing pipeline instead.
#
# NOTE on phases: the script's dispatcher runs the named phase AND every phase
# after it (preflight → import → build → package → extract → inject → sign →
# verify → dmg → notarize → ship). So "start at package" means "resume the
# pipeline from packaging onward" — there is no compile-only mode. Targets below
# mirror that instead of inventing finer granularity.

SHELL := /bin/bash
.DEFAULT_GOAL := help

ROOT     := $(CURDIR)
SCRIPT   := $(ROOT)/scripts/build-satori-local.sh
WORK     ?= /tmp/satori-local-build
APP      := $(WORK)/staging/Satori.app
INSTALLED := /Applications/Satori.app
VERSION  := $(shell node -p "require('$(ROOT)/surfer.json').brands.release.release.displayVersion")

# Most local runs have no notary credentials; notarization is opt-in.
SKIP_NOTARIZE ?= 1

.PHONY: help check full resume ship import install uninstall-safe doctor status \
        clean-staging clean

help: ## Show available targets
	@echo "Satori $(VERSION) — local build pipeline (macOS arm64)"
	@echo
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-16s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "  Typical:  make check && make full && make install"
	@echo "  Notarize: make full SKIP_NOTARIZE=0   (needs 'satori-notary' keychain profile)"
	@echo "  Resume:   make resume PHASE=sign"

check: ## Preflight only: identity, provisioning profile, passkey capability, engine
	@$(SCRIPT) preflight

import: ## Run surfer import (engine -> patched tree), then continue the pipeline
	@SKIP_NOTARIZE=$(SKIP_NOTARIZE) $(SCRIPT) import

full: ## Full pipeline: preflight, then build -> sign -> signed DMG (stops before shipping)
	@$(SCRIPT) preflight
	@SKIP_NOTARIZE=$(SKIP_NOTARIZE) STOP_AFTER=dmg $(SCRIPT) build

ship: ## Finish an existing build through release notes (+ UPLOAD=1 to publish)
	@test -d "$(APP)" || { echo "No signed app at $(APP). Run 'make full' first." >&2; exit 1; }
	@UPLOAD=$(UPLOAD) $(SCRIPT) ship

resume: ## Resume the pipeline at PHASE=<name> (see docs/local-build-pipeline.md)
	@if [ -z "$(PHASE)" ]; then \
	  echo "Usage: make resume PHASE=<preflight|import|build|package|extract|inject|sign|verify|dmg|notarize|ship>" >&2; \
	  exit 2; fi
	@SKIP_NOTARIZE=$(SKIP_NOTARIZE) $(SCRIPT) $(PHASE)

install: ## Install the SIGNED app from staging (never the unsigned npm DMG)
	@if pgrep -f '^$(INSTALLED)/Contents/MacOS/zen$$' >/dev/null; then \
	  echo "Satori is running — quit it first." >&2; exit 1; fi
	@test -d "$(APP)" || { \
	  echo "No signed app at $(APP)." >&2; \
	  echo "Run 'make full' first." >&2; exit 1; }
	@if ! codesign -d --entitlements :- "$(APP)" 2>/dev/null | grep -q public-key-credential; then \
	  echo "REFUSING: $(APP) lacks the passkey entitlement." >&2; \
	  echo "Installing it would break passkeys (this is the bug that bit us before)." >&2; \
	  echo "Re-run 'make full' (do not hand-package with npm), or check PROFILE_PATH." >&2; \
	  exit 1; fi
	@if [ -d "$(INSTALLED)" ]; then \
	  rm -rf "$(INSTALLED).backup"; \
	  mv "$(INSTALLED)" "$(INSTALLED).backup"; \
	  echo "previous app -> $(INSTALLED).backup"; \
	fi
	@ditto "$(APP)" "$(INSTALLED)" && echo "installed $(VERSION) -> $(INSTALLED)"
	@echo
	@echo "SourceStamp: $$(awk -F= '$$1=="SourceStamp"{print $$2}' "$(INSTALLED)/Contents/Resources/application.ini")"
	@echo "HEAD       : $$(git -C $(ROOT) rev-parse HEAD)"

uninstall-safe: ## Restore the previous app from /Applications/Satori.app.backup
	@test -d "$(INSTALLED).backup" || { echo "No $(INSTALLED).backup to restore." >&2; exit 1; }
	@if pgrep -f '^$(INSTALLED)/Contents/MacOS/zen$$' >/dev/null; then \
	  echo "Satori is running — quit it first." >&2; exit 1; fi
	@rm -rf "$(INSTALLED)" && mv "$(INSTALLED).backup" "$(INSTALLED)" \
	  && echo "restored previous app"

doctor: ## Check local Sine mods against the installed build
	@test -x "$$HOME/.local/bin/sine-mod-doctor" || { echo "sine-mod-doctor not found in ~/.local/bin" >&2; exit 1; }
	@profile=$$(node -e "const fs=require('fs');const d=process.env.HOME+'/Library/Application Support/zen/Profiles';const all=fs.readdirSync(d).filter(x=>/release/.test(x));const ok=all.filter(x=>fs.existsSync(d+'/'+x+'/chrome/sine-mods/mods.json'));if(!ok.length){console.error('no profile with chrome/sine-mods/mods.json in '+d);process.exit(1);}console.log(d+'/'+ok[0])"); \
	echo "profile: $$profile"; \
	"$$HOME/.local/bin/sine-mod-doctor" --app "$(INSTALLED)" --profile "$$profile"

status: ## Installed app vs built app: version, stamp, signing, passkeys
	@echo "installed : $(INSTALLED)"
	@if [ -d "$(INSTALLED)" ]; then \
	  echo "  version   : $$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$(INSTALLED)/Contents/Info.plist" 2>/dev/null)"; \
	  echo "  stamp     : $$(awk -F= '$$1=="SourceStamp"{print $$2}' "$(INSTALLED)/Contents/Resources/application.ini" 2>/dev/null)"; \
	  codesign -dvv "$(INSTALLED)" 2>&1 | sed -n 's/^Identifier=/  identifier: /p;s/^TeamIdentifier=/  team      : /p'; \
	  if codesign -d --entitlements :- "$(INSTALLED)" 2>/dev/null | grep -q public-key-credential; \
	    then echo "  passkeys  : entitlement present"; \
	    else echo "  passkeys  : ENTITLEMENT MISSING (app predates signing fix)"; fi; \
	else echo "  (not installed)"; fi
	@echo "built     : $(APP)"
	@if [ -d "$(APP)" ]; then \
	  echo "  stamp     : $$(awk -F= '$$1=="SourceStamp"{print $$2}' "$(APP)/Contents/Resources/application.ini" 2>/dev/null)"; \
	  if codesign -d --entitlements :- "$(APP)" 2>/dev/null | grep -q public-key-credential; \
	    then echo "  passkeys  : entitlement present"; else echo "  passkeys  : ENTITLEMENT MISSING"; fi; \
	else echo "  (absent — run 'make full')"; fi
	@echo "repo      : $$(git -C $(ROOT) rev-parse --short HEAD) ($$(git -C $(ROOT) branch --show-current))"

clean-staging: ## Remove the staging dir and intermediate DMG
	@rm -rf "$(WORK)"
	@echo "removed $(WORK)"

clean: clean-staging ## Also remove the object dir (next build is a full rebuild)
	@rm -rf "$(ROOT)/engine/obj-aarch64-apple-darwin"
	@echo "removed engine/obj-aarch64-apple-darwin"
