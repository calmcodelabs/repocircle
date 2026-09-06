import { expect, signIn, test } from './fixtures.ts';
import type { Page } from '@playwright/test';

/**
 * Visual regression (TESTING.md §2, L6).
 *
 * Pixel diffing is only useful if the pixels are deterministic, so every source
 * of drift is pinned before a shot is taken: the clock, animations, and any
 * region whose content is time- or identity-dependent is masked.
 *
 * Baselines are NOT generated on a developer machine. Font rasterisation
 * differs across operating systems, so a local baseline fails for everyone
 * else — see scripts/visual-baselines.sh, which runs this same spec inside the
 * Playwright container that CI uses.
 */

/**
 * Freeze everything that would otherwise move between two identical runs.
 *
 * Deliberately no `addStyleTag`: the shipped CSP is `style-src 'self'`, so
 * injecting a stylesheet is blocked — and weakening the policy to allow it
 * would mean the screenshots came from an artifact nobody receives. Emulating
 * reduced motion instead triggers the app's own media block, which already
 * zeroes durations, delays and fill so the settled state is reached at once.
 * Anything genuinely volatile is masked rather than hidden.
 */
async function settle(page: Page) {
  // A repaint plus a beat, so the reduced-motion styles have certainly applied.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  await page.waitForTimeout(250);
}

/**
 * Regions that legitimately differ run to run and would flake a pixel diff.
 *
 * Keep this list minimal and justified. `.halo` was masked here once and it
 * destroyed the baseline: it is `position: fixed; inset: 0`, so Playwright
 * painted the entire viewport with its mask colour and produced a solid
 * magenta reference that would have passed forever while proving nothing. It
 * is also a static gradient with no animation, so there was never anything to
 * mask. Anything added here should be genuinely non-deterministic, and small.
 */
const masks = (page: Page) => [page.locator('.avatar'), page.locator('.spark')];

test.beforeEach(async ({ app }) => {
  // A fixed instant, so "2 days ago" is the same string in every run.
  await app.clock.setFixedTime(new Date('2026-09-01T12:00:00Z'));
  // Set before navigation so the settled state is what first paints.
  await app.emulateMedia({ reducedMotion: 'reduce' });
});

test.describe('[auth-signin] visual', () => {
  test('sign-in, desktop', async ({ app }) => {
    await app.setViewportSize({ width: 1280, height: 800 });
    await app.goto('#/');
    await expect(app.getByRole('button', { name: /continue with github/i })).toBeVisible();
    await settle(app);
    await expect(app).toHaveScreenshot('signin-desktop.png', { mask: masks(app), fullPage: true });
  });

  test('sign-in, mobile', async ({ app }) => {
    await app.setViewportSize({ width: 375, height: 812 });
    await app.goto('#/');
    await expect(app.getByRole('button', { name: /continue with github/i })).toBeVisible();
    await settle(app);
    await expect(app).toHaveScreenshot('signin-mobile.png', { mask: masks(app), fullPage: true });
  });
});

// Deliberately no maintenance-screen shot. The pause is skipped for emulator
// builds on purpose (that is what lets anyone develop while the app is paused),
// so this harness cannot reach it — an attempt here captured the sign-in screen
// under a maintenance-sounding name, which is worse than no coverage. The pause
// screen's content is asserted in the component layer instead.

test.describe('[routing] visual', () => {
  test('not found', async ({ app }) => {
    await app.setViewportSize({ width: 1280, height: 800 });
    await signIn(app);
    await app.goto('#/definitely/not/a/route');
    await expect(app.getByRole('link').first()).toBeVisible();
    await settle(app);
    await expect(app).toHaveScreenshot('not-found.png', { mask: masks(app), fullPage: true });
  });
});
