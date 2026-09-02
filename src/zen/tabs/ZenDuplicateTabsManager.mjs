// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { nsZenDOMOperatedFeature } from "chrome://browser/content/zen-components/ZenCommonUtils.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  SessionStore: "resource:///modules/sessionstore/SessionStore.sys.mjs",
});

const TAB_CHANGE_EVENTS = [
  "TabSelect",
  "TabOpen",
  "TabClose",
  "TabMove",
  "TabPinned",
  "TabUnpinned",
  "TabAddedToEssentials",
  "TabRemovedFromEssentials",
  "ZenWorkspacesUIUpdate",
];

class nsZenDuplicateTabsManager extends nsZenDOMOperatedFeature {
  #onTabChange = () => this.updateDuplicateTabs();

  init() {
    gZenWorkspaces.promiseInitialized.then(() => {
      for (const event of TAB_CHANGE_EVENTS) {
        window.addEventListener(event, this.#onTabChange);
      }
      gBrowser.addTabsProgressListener(this);
      this.updateDuplicateTabs();

      window.addEventListener(
        "unload",
        () => {
          for (const event of TAB_CHANGE_EVENTS) {
            window.removeEventListener(event, this.#onTabChange);
          }
          gBrowser.removeTabsProgressListener(this);
        },
        { once: true }
      );
    });
  }

  onLocationChange(_aBrowser, aWebProgress) {
    if (aWebProgress.isTopLevel) {
      this.updateDuplicateTabs();
    }
  }

  updateDuplicateTabs() {
    const tabs = gZenWorkspaces.allStoredTabs;
    for (const tab of tabs) {
      tab.removeAttribute("zen-duplicate-tab");
      tab.removeAttribute("zen-duplicate-count");
    }

    const selectedTab = gBrowser.selectedTab;
    if (!this.#isEligibleTab(selectedTab)) {
      return;
    }

    const selectedURL = this.#getComparableURL(selectedTab);
    if (!selectedURL) {
      return;
    }

    const selectedContextId = selectedTab.userContextId;
    const selectedWorkspaceId =
      selectedTab.getAttribute("zen-workspace-id") ??
      gZenWorkspaces.activeWorkspace;
    const matchingTabs = tabs.filter(
      tab =>
        this.#isEligibleTab(tab) &&
        tab.userContextId === selectedContextId &&
        this.#isInSelectedWorkspace(tab, selectedWorkspaceId) &&
        this.#getComparableURL(tab) === selectedURL
    );

    if (matchingTabs.length < 2) {
      return;
    }

    for (const tab of matchingTabs) {
      tab.setAttribute("zen-duplicate-tab", "true");
    }
    const duplicateCount = matchingTabs.length.toString();
    selectedTab.setAttribute("zen-duplicate-count", duplicateCount);
  }

  #isEligibleTab(tab) {
    return Boolean(
      tab &&
      !tab.closing &&
      !tab.hasAttribute("zen-empty-tab") &&
      !tab.hasAttribute("zen-glance-tab")
    );
  }

  #isInSelectedWorkspace(tab, selectedWorkspaceId) {
    return (
      tab.hasAttribute("zen-essential") ||
      !selectedWorkspaceId ||
      tab.getAttribute("zen-workspace-id") === selectedWorkspaceId
    );
  }

  #getComparableURL(tab) {
    const browser = tab.linkedBrowser;
    let url = browser?.registeredOpenURI?.spec ?? browser?.currentURI?.spec;

    if (tab.hasAttribute("pending") && (!url || url === "about:blank")) {
      url = this.#getPendingTabURL(tab);
    }

    return url?.split("#", 1)[0] || null;
  }

  #getPendingTabURL(tab) {
    try {
      const state = JSON.parse(lazy.SessionStore.getTabState(tab));
      const entries = state.entries ?? [];
      const index = Math.max(0, (state.index || entries.length) - 1);
      return entries[index]?.url ?? null;
    } catch {
      return null;
    }
  }
}

window.gZenDuplicateTabsManager = new nsZenDuplicateTabsManager();
