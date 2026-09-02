/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const MATCH_URL =
  "https://example.com/?zen-duplicate-tabs=matching&view=primary";
const OTHER_QUERY_URL =
  "https://example.com/?zen-duplicate-tabs=matching&view=other";
const OTHER_URL = "https://example.com/?zen-duplicate-tabs=other";

async function waitForDuplicateCount(tab, count) {
  await TestUtils.waitForCondition(
    () => tab.getAttribute("zen-duplicate-count") === count,
    `Wait for duplicate count ${count}`
  );
}

async function waitForNoDuplicateState(tabs) {
  await TestUtils.waitForCondition(
    () =>
      tabs.every(
        tab =>
          !tab.hasAttribute("zen-duplicate-tab") &&
          !tab.hasAttribute("zen-duplicate-count")
      ),
    "Wait for duplicate state to clear"
  );
}

add_task(async function test_duplicate_matching_identity_and_selection() {
  const originalTab = gBrowser.selectedTab;
  const tabs = [];

  try {
    const first = await addTab(`${MATCH_URL}#first`);
    const second = await addTab(`${MATCH_URL}#second`);
    const differentQuery = await addTab(`${OTHER_QUERY_URL}#first`);
    const differentContainer = await addTab(`${MATCH_URL}#third`, {
      userContextId: 1,
    });
    tabs.push(first, second, differentQuery, differentContainer);

    await BrowserTestUtils.switchTab(gBrowser, first);
    await waitForDuplicateCount(first, "2");

    ok(first.hasAttribute("zen-duplicate-tab"), "The active tab is marked");
    ok(
      second.hasAttribute("zen-duplicate-tab"),
      "A tab differing only by fragment is marked"
    );
    ok(
      !differentQuery.hasAttribute("zen-duplicate-tab"),
      "A tab with a different query is not marked"
    );
    ok(
      !differentContainer.hasAttribute("zen-duplicate-tab"),
      "A tab in another container is not marked"
    );

    const tabBackground = second.querySelector(".tab-background");
    const badgeStyle = getComputedStyle(first, "::after");
    is(
      getComputedStyle(tabBackground).outlineStyle,
      "solid",
      "Duplicate tabs receive the ring style"
    );
    is(
      badgeStyle.content,
      "attr(zen-duplicate-count)",
      "The active tab renders its matching-tab count attribute"
    );
    is(badgeStyle.position, "absolute", "The count badge is positioned");
    is(badgeStyle.right, "-2px", "The count badge is anchored to tab right");
    is(badgeStyle.top, "-2px", "The count badge is anchored to tab top");

    await BrowserTestUtils.switchTab(gBrowser, differentQuery);
    await waitForNoDuplicateState(tabs);
  } finally {
    if (!originalTab.closing) {
      await BrowserTestUtils.switchTab(gBrowser, originalTab);
    }
    for (const tab of tabs.reverse()) {
      if (!tab.closing) {
        await BrowserTestUtils.removeTab(tab);
      }
    }
  }
});

add_task(
  async function test_duplicate_state_updates_for_navigation_and_close() {
    const originalTab = gBrowser.selectedTab;
    const tabs = [];
    let ignoredEmpty;

    try {
      const first = await addTab(`${MATCH_URL}#active`);
      const second = await addTab(OTHER_URL);
      ignoredEmpty = await addTab(`${MATCH_URL}#empty`);
      tabs.push(first, second, ignoredEmpty);
      ignoredEmpty.setAttribute("zen-empty-tab", "true");

      await BrowserTestUtils.switchTab(gBrowser, first);
      gZenDuplicateTabsManager.updateDuplicateTabs();
      await waitForNoDuplicateState(tabs);

      const loaded = BrowserTestUtils.browserLoaded(second.linkedBrowser);
      BrowserTestUtils.startLoadingURIString(
        second.linkedBrowser,
        `${MATCH_URL}#navigated`
      );
      await loaded;
      await waitForDuplicateCount(first, "2");

      ok(
        second.hasAttribute("zen-duplicate-tab"),
        "A background tab is marked after navigating to the active URL"
      );
      ok(
        !ignoredEmpty.hasAttribute("zen-duplicate-tab"),
        "Empty tabs are excluded from matching"
      );

      await BrowserTestUtils.removeTab(second);
      await waitForNoDuplicateState([first, ignoredEmpty]);
    } finally {
      ignoredEmpty?.removeAttribute("zen-empty-tab");
      if (!originalTab.closing) {
        await BrowserTestUtils.switchTab(gBrowser, originalTab);
      }
      for (const tab of tabs.reverse()) {
        if (!tab.closing) {
          await BrowserTestUtils.removeTab(tab);
        }
      }
    }
  }
);
