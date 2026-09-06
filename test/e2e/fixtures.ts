import { test as base, expect, type Page } from '@playwright/test';
import { ghRoute } from '../fixtures/github.ts';

/**
 * E2E fixtures (TESTING.md §2, L5; §4).
 *
 * Two things every journey gets for free:
 *
 *  1. `api.github.com` is intercepted and answered from the same fixture set
 *     the integration layer uses, so a journey never depends on the network,
 *     on rate limits, or on a real repository continuing to exist.
 *  2. A `signIn` helper that uses the app's own emulator-only sign-in path.
 *     Real `signInWithPopup` cannot work in an automated browser — there is no
 *     opener frame to relay the result through — which is why that path exists.
 *
 * Multi-user journeys open a second browser context rather than a second
 * profile. Two contexts are two independent storage partitions in one browser,
 * which retires the two-Chrome-profiles ritual entirely.
 */

const NOW = Date.parse('2026-09-01T12:00:00.000Z');

export async function stubGitHub(page: Page): Promise<void> {
  await page.route('https://api.github.com/**', async (route) => {
    const url = route.request().url();
    const etag = route.request().headers()['if-none-match'] ?? null;
    const r = ghRoute(url, NOW, etag);
    if (r.status === 304) {
      await route.fulfill({ status: 304, headers: r.headers ?? {} });
      return;
    }
    await route.fulfill({
      status: r.status,
      headers: { 'content-type': 'application/json', ...(r.headers ?? {}) },
      body: JSON.stringify(r.body ?? {}),
    });
  });
}

/** Fail a test on any console error — a clean console is a PLAN §10 gate. */
export function failOnConsoleErrors(page: Page, allow: RegExp[] = []): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (allow.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

/**
 * Put the emulator back to the seeded circle.
 *
 * Journeys join circles, so they mutate shared state; without a reset each test
 * inherits the previous one's database and the flow silently differs (the join
 * button is not there when you are already a member). Reseeding per test costs
 * about a second and buys tests that mean the same thing in any order.
 */
export async function resetData(page: Page): Promise<void> {
  const res = await page.request.get('/__reset', { timeout: 60_000 });
  if (!res.ok()) throw new Error(`reset failed: ${res.status()} ${await res.text()}`);
}

export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
    await stubGitHub(page);
    await resetData(page);
    await use(page);
  },
});

/**
 * Sign in through the app's own emulator affordance.
 *
 * The affordance signs in one fixed test identity, which is enough: a journey
 * that needs a *second* person opens a second browser context rather than a
 * second login, and that is a truer simulation anyway — separate storage,
 * separate auth, separate service worker.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto('#/');
  const button = page.getByRole('button', { name: /sign in as a test user/i });
  await expect(
    button,
    'the emulator sign-in affordance must be present in this build',
  ).toBeVisible();
  await button.click();
  await expect(button).toBeHidden({ timeout: 20_000 });
}

/** Sign in and join the seeded circle — the starting point most journeys need. */
export async function joinDemoCircle(page: Page): Promise<void> {
  await signIn(page);
  await page.goto('#/join/demo-circle/devtoken');
  const join = page.getByRole('button', { name: /join/i }).first();
  await expect(join, 'the join affordance must be offered to a non-member').toBeVisible({
    timeout: 20_000,
  });
  await join.click();
  await expect(page.getByText('Northside Build Club').first()).toBeVisible({ timeout: 30_000 });
}

/** Open a second, independent session — the second member in a journey. */
export async function secondMember(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await stubGitHub(page);
  return { context, page };
}

export { expect };
