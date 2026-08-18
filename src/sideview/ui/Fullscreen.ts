/**
 * Fullscreen and orientation on phones.
 *
 * A page cannot put itself into fullscreen on load. Every browser requires the
 * request to come from inside a user gesture, deliberately, so a site cannot
 * take over the screen the moment it opens - and iOS Safari has no Fullscreen
 * API on iPhone at all.
 *
 * So this does the two things that are actually available:
 *
 *   - asks on the FIRST tap, whatever that tap was for, so the player reaches
 *     fullscreen without having to know a button exists;
 *   - locks to landscape once there, since the game is a side-scroller.
 *
 * The other half is the web manifest: launched from the home screen the game
 * opens with no browser chrome at all, on Android through the manifest and on
 * iOS through the apple-mobile-web-app meta tags. That is the only route to
 * "always fullscreen" on an iPhone.
 */

const isMobile = () =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);

export function isFullscreen(): boolean {
  return Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);
}

export async function enterFullscreen(): Promise<boolean> {
  const el = document.documentElement as any;
  const request = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (!request) return false;

  try {
    await request.call(el, { navigationUI: 'hide' });
  } catch {
    return false;
  }

  // Only meaningful once fullscreen, and unsupported on several browsers -
  // a refusal here is not a failure of the fullscreen itself.
  try {
    await (screen.orientation as any)?.lock?.('landscape');
  } catch { /* not supported, or the device is locked in portrait */ }

  return true;
}

/**
 * Requests fullscreen at the first opportunity the browser will accept.
 *
 * Registered on several event types because which one counts as the gesture
 * varies: a tap on iOS fires touchend, a click on Android fires pointerdown
 * first, and a keyboard player never touches either.
 */
export function installAutoFullscreen() {
  if (!isMobile()) return;

  let done = false;
  const events = ['pointerdown', 'touchend', 'click', 'keydown'];

  const attempt = async () => {
    if (done || isFullscreen()) { cleanup(); return; }
    done = true;
    const ok = await enterFullscreen();
    // A refusal is worth retrying on the next gesture rather than giving up -
    // the first tap may have landed during a transition the browser would not
    // accept.
    if (!ok) done = false;
    else cleanup();
  };

  const cleanup = () => events.forEach((e) => document.removeEventListener(e, attempt));
  events.forEach((e) => document.addEventListener(e, attempt, { passive: true }));

  // Leaving fullscreen should not be fought - if the player pressed back or
  // swiped away, re-entering on their next tap would be hostile. The listener
  // is not reinstalled.
}
