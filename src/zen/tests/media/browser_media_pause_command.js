/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_pause_media_command() {
  const originalTab = gBrowser.selectedTab;
  const mediaTab = await addMediaTab();
  await BrowserTestUtils.switchTab(gBrowser, mediaTab);

  try {
    await playVideoIn(mediaTab);
    ok(
      gZenMediaController.hasPlayingMedia,
      "precondition: window reports playing media"
    );

    // The command must work while the media tab is in the background.
    await BrowserTestUtils.switchTab(gBrowser, originalTab);

    document.getElementById("cmd_zenMediaPause").doCommand();

    await BrowserTestUtils.waitForCondition(
      () => !mediaTab.soundPlaying,
      "tab stops playing sound after cmd_zenMediaPause"
    );
    const videoPaused = await SpecialPowers.spawn(
      mediaTab.linkedBrowser,
      [VIDEO_SELECTOR],
      async selector => content.document.querySelector(selector).paused
    );
    ok(videoPaused, "the background tab's video is paused");
    ok(
      !gZenMediaController.hasPlayingMedia,
      "window no longer reports playing media"
    );
  } finally {
    await pauseVideoIn(mediaTab);
    BrowserTestUtils.removeTab(mediaTab);
    gBrowser.selectedTab = originalTab;
  }
});
