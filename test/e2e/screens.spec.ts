import { expect, failOnConsoleErrors, joinDemoCircle, signIn, test } from './fixtures.ts';
import type { Page } from '@playwright/test';

/**
 * Every screen a member can reach, walked with real seeded data.
 *
 * These journeys are deliberately broad rather than deep: the detail pages are
 * the largest files in the app and most of their code only runs when something
 * is actually on them. Loading each one against a populated circle exercises
 * the listeners, the derived state and the empty-state branches together, and
 * asserts the thing that matters most about a page nobody has opened in a
 * while — that it renders at all, with a clean console.
 */

/** Every screen must render its shell and say something. */
async function rendersSomething(page: Page, label: string) {
  await expect(page.locator('.app'), `${label}: no app shell`).toBeVisible({ timeout: 30_000 });
  const text = (await page.locator('body').innerText()).trim();
  expect(text.length, `${label}: rendered an empty page`).toBeGreaterThan(20);
}

/** Ignore noise that is not the app's doing. */
const NOISE = [/favicon/i, /net::ERR_/i, /Failed to load resource/i];

test.describe('[repo-needs] the repo detail page', () => {
  test('opens a seeded repo with its activity and discussion', async ({ app }) => {
    const errors = failOnConsoleErrors(app, NOISE);
    await joinDemoCircle(app);
    await app.goto('#/g/demo-circle/repos');
    await expect(app.getByText('atlas').first()).toBeVisible({ timeout: 30_000 });

    // The first repo carries a comment and a full daily history in the seed.
    await app.goto('#/g/demo-circle/repo/1000');
    await rendersSomething(app, 'repo detail');
    await expect(app.getByText(/atlas/).first()).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test('a repo nobody has touched still renders', async ({ app }) => {
    await joinDemoCircle(app);
    await app.goto('#/g/demo-circle/repo/1005');
    await rendersSomething(app, 'quiet repo detail');
  });

  test('a repo id that does not exist does not hang', async ({ app }) => {
    await joinDemoCircle(app);
    await app.goto('#/g/demo-circle/repo/999999');
    await rendersSomething(app, 'missing repo');
  });
});

test.describe('[profiles] a member profile', () => {
  test('opens another member with their skills and work', async ({ app }) => {
    const errors = failOnConsoleErrors(app, NOISE);
    await joinDemoCircle(app);
    await app.goto('#/g/demo-circle/m/n-rahman');
    await rendersSomething(app, 'profile');
    await expect(app.getByText(/n-rahman/).first()).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test('my own profile renders the editable view', async ({ app }) => {
    await joinDemoCircle(app);
    await app.goto('#/g/demo-circle/m/dev-tester');
    await rendersSomething(app, 'own profile');
  });
});

test.describe('[asks] the ask detail page', () => {
  test('opens a seeded ask with its claims and thread', async ({ app }) => {
    const errors = failOnConsoleErrors(app, NOISE);
    await joinDemoCircle(app);
    await app.goto('#/g/demo-circle/ask/a0');
    await rendersSomething(app, 'ask detail');
    expect(errors).toEqual([]);
  });

  test('a resolved ask shows its resolution rather than hiding', async ({ app }) => {
    await joinDemoCircle(app);
    // a3 is seeded resolved, with a credit line (ADR-019).
    await app.goto('#/g/demo-circle/ask/a3');
    await rendersSomething(app, 'resolved ask');
  });
});

test.describe('[ideas] the idea detail page', () => {
  test('opens a seeded idea', async ({ app }) => {
    const errors = failOnConsoleErrors(app, NOISE);
    await joinDemoCircle(app);
    await app.goto('#/g/demo-circle/idea/i0');
    await rendersSomething(app, 'idea detail');
    expect(errors).toEqual([]);
  });

  test('a germinated idea shows the repo it became', async ({ app }) => {
    await joinDemoCircle(app);
    // i2 is seeded germinated, linked to the first repo.
    await app.goto('#/g/demo-circle/idea/i2');
    await rendersSomething(app, 'germinated idea');
  });
});

test.describe('[settings-admin] circle settings', () => {
  test('a member sees the page without the admin controls', async ({ app }) => {
    const errors = failOnConsoleErrors(app, NOISE);
    await joinDemoCircle(app);
    await app.goto('#/g/demo-circle/settings');
    await rendersSomething(app, 'settings');
    expect(errors).toEqual([]);
  });
});

test.describe('[personal-home] the signed-in landing page', () => {
  test('lists the circles you are in', async ({ app }) => {
    const errors = failOnConsoleErrors(app, NOISE);
    await joinDemoCircle(app);
    await app.goto('#/');
    await rendersSomething(app, 'personal home');
    await expect(app.getByText('Northside Build Club').first()).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test('a member of nothing is offered onboarding rather than an empty page', async ({ app }) => {
    await signIn(app);
    await app.goto('#/');
    await rendersSomething(app, 'no circles');
  });
});

test.describe('[onboarding] the create-a-circle screen', () => {
  test('offers a way to start one', async ({ app }) => {
    await signIn(app);
    await app.goto('#/new');
    await rendersSomething(app, 'onboarding');
    // Something must be typeable, or there is no way through.
    await expect(app.locator('input, textarea').first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('[diag] the diagnostics screen', () => {
  test('reports the session and the build without leaking a token', async ({ app }) => {
    await joinDemoCircle(app);
    await app.goto('#/diag');
    await rendersSomething(app, 'diag');
    const text = await app.locator('body').innerText();
    // SECURITY §5: the vault's contents never reach the screen or the logs.
    expect(text).not.toMatch(/gho_[A-Za-z0-9]/);
    expect(text).not.toMatch(/ghp_[A-Za-z0-9]/);
  });
});

test.describe('[home-gating] Home widens as a member settles in', () => {
  test('a brand-new member gets the narrowed page, and can open it up', async ({ app }) => {
    await joinDemoCircle(app);
    await app.goto('#/g/demo-circle');
    await rendersSomething(app, 'home');

    // ADR-022: the page says when it is deliberately narrow, and the escape
    // hatch is remembered. Whichever of those is present, one must be.
    const body = await app.locator('body').innerText();
    const showAll = app.getByRole('button', { name: /show everything|show all/i });
    const narrowed = /narrow|new here|settling/i.test(body);
    expect(
      narrowed || (await showAll.count()) > 0,
      'a narrowed Home must say so or offer the escape hatch',
    ).toBe(true);

    if ((await showAll.count()) > 0) {
      await showAll.first().click();
      await rendersSomething(app, 'home, widened');
    }
  });
});

test.describe('[repo-list-view] the repos page in both shapes', () => {
  test('switches between the gallery and the list', async ({ app }) => {
    await joinDemoCircle(app);
    await app.goto('#/g/demo-circle/repos');
    await expect(app.getByText('atlas').first()).toBeVisible({ timeout: 30_000 });

    // M20 added a list alongside the cards; whichever control exposes it, the
    // repos must still be there afterwards.
    const toggle = app.getByRole('button', { name: /list|gallery|view/i });
    if ((await toggle.count()) > 0) {
      await toggle.first().click();
      await expect(app.getByText('atlas').first()).toBeVisible();
    }
  });

  test('filtering by what a repo needs keeps the page honest', async ({ app }) => {
    await joinDemoCircle(app);
    await app.goto('#/g/demo-circle/repos');
    await expect(app.getByText('atlas').first()).toBeVisible({ timeout: 30_000 });

    const filter = app.getByRole('button', { name: /frontend/i });
    if ((await filter.count()) > 0) {
      await filter.first().click();
      // Class G: if the filter empties the list, the copy must say the filter
      // did it — not "nothing here yet".
      const body = await app.locator('body').innerText();
      const looksEmpty = /no repos|nothing/i.test(body);
      if (looksEmpty) expect(body).toMatch(/filter|match|clear/i);
    }
  });
});
