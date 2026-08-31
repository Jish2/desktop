/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PlacesTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PlacesTestUtils.sys.mjs"
);
const { UrlbarProviderOpenTabs } = ChromeUtils.importESModule(
  "moz-src:///browser/components/urlbar/UrlbarProviderOpenTabs.sys.mjs"
);
const { UrlbarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlbarTestUtils.sys.mjs"
);

const TEST_ROOT = "https://example.com/browser/zen/tests/urlbar/";
const TEST_URL = `${TEST_ROOT}zen-urlbar-container-title-test-617db8`;
const ESSENTIAL_TEST_URL = `${TEST_ROOT}zen-urlbar-essential-title-test-617db8`;
const WORKSPACE_NAMES = [
  "URLbar Personal Container 617db8",
  "URLbar Work Container 617db8",
];

add_setup(async function () {
  await PlacesUtils.promiseLargeCacheDBConnection();
  await UrlbarProviderOpenTabs.promiseDBPopulated;
  await PlacesTestUtils.addVisits([TEST_URL, ESSENTIAL_TEST_URL]);
  registerCleanupFunction(() => PlacesUtils.history.clear());
});

async function addContainerTab(url, userContextId) {
  return BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: () => {
      gBrowser.selectedTab = BrowserTestUtils.addTab(gBrowser, url, {
        skipAnimation: true,
        userContextId,
      });
    },
  });
}

add_task(async function test_container_tabs_use_their_live_labels() {
  const tabs = [];

  try {
    for (const userContextId of [1, 2]) {
      const tab = await addContainerTab(TEST_URL, userContextId);
      tabs.push(tab);
    }

    const labels = ["Personal Gmail", "Work Gmail"];
    tabs.forEach((tab, index) => {
      tab.zenStaticLabel = labels[index];
      gBrowser._setTabLabel(tab, labels[index], {
        _zenChangeLabelFlag: true,
      });
    });
    Assert.deepEqual(
      tabs.map(tab => tab.label),
      labels,
      "The container tabs should have distinct live labels"
    );

    const searchTab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
      skipAnimation: true,
    });
    tabs.push(searchTab);
    await BrowserTestUtils.switchTab(gBrowser, searchTab);

    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      waitForFocus,
      value: "% zen-urlbar-container-title-test",
    });

    const queryContext = await gURLBar.lastQueryContextPromise;
    const results = queryContext.results
      .filter(result => result.payload.url == TEST_URL)
      .map(result => ({
        title: result.payload.title,
        userContextId: result.payload.userContextId,
      }))
      .sort((a, b) => a.userContextId - b.userContextId);

    Assert.deepEqual(
      results,
      [
        { title: labels[0], userContextId: 1 },
        { title: labels[1], userContextId: 2 },
      ],
      "Switch-to-tab results should use each container tab's live label"
    );
  } finally {
    if (UrlbarTestUtils.isPopupOpen(window)) {
      await UrlbarTestUtils.promisePopupClose(window, () =>
        EventUtils.synthesizeKey("KEY_Escape")
      );
    }
    for (const tab of tabs.reverse()) {
      if (gBrowser.tabs.includes(tab)) {
        await BrowserTestUtils.removeTab(tab);
      }
    }
  }
});

add_task(async function test_inactive_container_essential_uses_live_label() {
  const originalWorkspaceId = gZenWorkspaces.activeWorkspace;
  const workspaceIds = [];
  const workspaces = [];
  const tabs = [];
  const labels = ["Personal Gmail", "Work Gmail"];

  try {
    for (let index = 0; index < WORKSPACE_NAMES.length; index++) {
      const workspace = await gZenWorkspaces.createAndSaveWorkspace(
        WORKSPACE_NAMES[index],
        undefined,
        false,
        index + 1
      );
      Assert.ok(workspace, `Created ${WORKSPACE_NAMES[index]}`);
      workspaces.push(workspace);
      workspaceIds.push(workspace.uuid);

      await gZenWorkspaces.changeWorkspace(workspace);
      const tab = await addContainerTab(ESSENTIAL_TEST_URL, index + 1);
      tabs.push(tab);

      tab.zenStaticLabel = labels[index];
      gBrowser._setTabLabel(tab, labels[index], {
        _zenChangeLabelFlag: true,
      });
      Assert.ok(
        gZenPinnedTabManager.addToEssentials(tab),
        `Added ${labels[index]} to Essentials`
      );
      await TestUtils.waitForCondition(
        () =>
          tab.hasAttribute("zen-essential") &&
          tab.parentNode?.getAttribute("container") == String(index + 1),
        `${labels[index]} should enter its container-specific Essential section`
      );
    }

    await gZenWorkspaces.changeWorkspace(workspaces[1]);

    Assert.ok(
      !gBrowser.tabs.includes(tabs[0]),
      "The inactive workspace Essential should not be in gBrowser.tabs"
    );
    Assert.ok(
      gZenWorkspaces.allStoredTabs.includes(tabs[0]),
      "The inactive workspace Essential should remain in allStoredTabs"
    );

    const searchTab = await addContainerTab(`${TEST_ROOT}search-source`, 2);
    tabs.push(searchTab);

    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      waitForFocus,
      value: "% zen-urlbar-essential-title-test",
    });

    const queryContext = await gURLBar.lastQueryContextPromise;
    const results = queryContext.results
      .filter(result => result.payload.url == ESSENTIAL_TEST_URL)
      .map(result => ({
        title: result.payload.title,
        userContextId: result.payload.userContextId,
      }))
      .sort((a, b) => a.userContextId - b.userContextId);

    Assert.deepEqual(
      results,
      [
        { title: labels[0], userContextId: 1 },
        { title: labels[1], userContextId: 2 },
      ],
      "Switch-to-tab results should include the inactive Essential's live label"
    );
  } finally {
    if (UrlbarTestUtils.isPopupOpen(window)) {
      await UrlbarTestUtils.promisePopupClose(window);
    }
    for (const tab of tabs.reverse()) {
      if (gZenWorkspaces.allStoredTabs.includes(tab)) {
        await BrowserTestUtils.removeTab(tab);
      }
    }
    if (
      gZenWorkspaces
        .getWorkspaces()
        .some(workspace => workspace.uuid == originalWorkspaceId)
    ) {
      await gZenWorkspaces.changeWorkspace(originalWorkspaceId);
    }
    for (const workspaceId of workspaceIds.reverse()) {
      if (
        gZenWorkspaces
          .getWorkspaces()
          .some(workspace => workspace.uuid == workspaceId)
      ) {
        await gZenWorkspaces.removeWorkspace(workspaceId);
      }
    }
  }
});
