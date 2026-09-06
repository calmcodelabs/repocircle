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

/** Freeze everything that would otherwise move between two identical runs. */
async function settle(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
      .halo { display: none !important; }
    `,
  });
  await page.waitForTimeout(400);
}

/** Regions that legitimately differ run to run and would flake a pixel diff. */
const masks = (page: Page) => [
  page.locator('.avatar'),
  page.locator('.spark'),
  page.locator('[class*="rel"]'),
];

test.beforeEach(async ({ app }) => {
  // A fixed instant, so "2 days ago" is the same string in every run.
  await app.clock.setFixedTime(new Date('2026-09-01T12:00:00Z'));
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

test.describe('[maintenance-mode] visual', () => {
  test('the pause screen is unmistakable', async ({ app }) => {
    await app.setViewportSize({ width: 1280, height: 800 });
    await app.goto('#/');
    await settle(app);
    await expect(app).toHaveScreenshot('signin-shell.png', { mask: masks(app), fullPage: true });
  });
});

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
