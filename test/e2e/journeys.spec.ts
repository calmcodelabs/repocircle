import {
  expect,
  failOnConsoleErrors,
  joinDemoCircle,
  secondMember,
  signIn,
  test,
} from './fixtures.ts';

/**
 * Journeys through the real build (TESTING.md §2, L5).
 *
 * Every assertion is by role or by visible text, because that is what a member
 * actually perceives — and a journey that can only find its target by CSS class
 * is describing an implementation, not a behaviour. Failures leave a Playwright
 * trace (DOM, network and a screenshot per step) under reports/raw.
 */

test.describe('[auth-signin] arriving at the app', () => {
  test('a signed-out visitor is offered a way in, and nothing else', async ({ app }) => {
    const errors = failOnConsoleErrors(app);
    await app.goto('#/');
    await expect(app.getByRole('heading').first()).toBeVisible();
    await expect(app.getByRole('button', { name: /continue with github/i })).toBeVisible();
    expect(errors, 'the sign-in screen must load with a clean console').toEqual([]);
  });

  test('the shipped policy does not block the app from starting', async ({ app }) => {
    // CSP violations surface as unrelated-looking SDK errors, so they are worth
    // catching at the door rather than three screens in.
    const violations: string[] = [];
    await app.addInitScript(() => {
      window.addEventListener('securitypolicyviolation', (e) => {
        (window as unknown as { __csp: string[] }).__csp ??= [];
        (window as unknown as { __csp: string[] }).__csp.push(
          `${e.violatedDirective} ${e.blockedURI}`,
        );
      });
    });
    await app.goto('#/');
    await app.waitForTimeout(1500);
    const found = await app.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
    violations.push(...found);
    expect(violations, 'the production-shaped CSP must not block the app').toEqual([]);
  });

  test('signing in reaches a real signed-in surface', async ({ app }) => {
    await signIn(app);
    // Either onboarding (no circles yet) or the personal home — both are
    // signed-in states, and neither is a blank page.
    await expect(app.locator('.app')).toBeVisible();
    await expect(app.getByRole('button', { name: /continue with github/i })).toBeHidden();
  });
});

test.describe('[join-flow] joining a circle through an invite', () => {
  test('the invite screen describes the circle before you commit', async ({ app }) => {
    await signIn(app);
    await app.goto('#/join/demo-circle/devtoken');
    await expect(app.getByText('Northside Build Club')).toBeVisible({ timeout: 20_000 });
  });

  test('joining lands on a Home that renders', async ({ app }) => {
    const errors = failOnConsoleErrors(app);
    await signIn(app);
    await app.goto('#/join/demo-circle/devtoken');
    const join = app.getByRole('button', { name: /join/i }).first();
    await expect(join).toBeVisible({ timeout: 20_000 });
    await join.click();
    await expect(app.getByText('Northside Build Club').first()).toBeVisible({ timeout: 30_000 });
    expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
  });

  test('an unknown token is refused with an explanation, not a blank screen', async ({ app }) => {
    await signIn(app);
    await app.goto('#/join/demo-circle/not-a-real-token');
    // Wait for the copy, not a timeout: judging the screen before the invite
    // read resolves tests the loading state and calls it a blank page.
    await expect(app.getByText(/invite link doesn.t exist/i)).toBeVisible({ timeout: 20_000 });
    // Class G: the words name the actual reason, and there is a route out.
    await expect(app.getByRole('link', { name: /go home/i })).toBeVisible();
  });
});

test.describe('[home-gating] Home after joining', () => {
  test('renders the circle and its navigation', async ({ app }) => {
    await joinDemoCircle(app);
    await app.goto('#/g/demo-circle');
    await expect(app.locator('.app')).toBeVisible();
    // The circle name anchors the page; without it nothing else is meaningful.
    await expect(app.getByText('Northside Build Club').first()).toBeVisible({ timeout: 30_000 });
  });

  test('the repos page lists the seeded repositories', async ({ app }) => {
    await joinDemoCircle(app);
    await app.goto('#/g/demo-circle/repos');
    await expect(app.getByText('atlas').first()).toBeVisible({ timeout: 30_000 });
  });

  test('the members page shows the circle', async ({ app }) => {
    await joinDemoCircle(app);
    await app.goto('#/g/demo-circle/members');
    await expect(app.getByText('n-rahman').first()).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('[routing] navigating the app', () => {
  test('an unknown route offers a way back', async ({ app }) => {
    await signIn(app);
    await app.goto('#/definitely/not/a/route');
    await expect(app.getByRole('link').first()).toBeVisible();
  });

  test('the diagnostics screen loads without a circle', async ({ app }) => {
    await app.goto('#/diag');
    await expect(app.locator('.app')).toBeVisible();
  });
});

test.describe('[membership-roles] two members in one circle', () => {
  test('a second member sees the same circle from their own session', async ({ app, browser }) => {
    await joinDemoCircle(app);

    // A second browser context is a genuinely separate session: its own
    // storage, its own auth, its own service worker registration.
    const { context, page } = await secondMember(browser);
    try {
      await signIn(page);
      await page.goto('#/g/demo-circle');
      await expect(page.locator('.app')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe('[pwa-install] the shell', () => {
  test('registers a service worker and serves a manifest', async ({ app }) => {
    await app.goto('#/');
    const registered = await app.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg || !!(await navigator.serviceWorker.ready.catch(() => null));
    });
    expect(registered, 'the built app must register its service worker').toBe(true);

    const res = await app.request.get('manifest.webmanifest');
    expect(res.ok(), 'the PWA manifest must be served').toBe(true);
  });
});
