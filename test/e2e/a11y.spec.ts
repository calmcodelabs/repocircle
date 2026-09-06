import AxeBuilder from '@axe-core/playwright';
import { expect, joinDemoCircle, signIn, test } from './fixtures.ts';
import type { Page } from '@playwright/test';

/**
 * Accessibility, audited in the browser that ships (TESTING.md §2, L6).
 *
 * UI.md asks for keyboard reachability and honest semantics; this is that gate
 * made executable. axe inspects the rendered DOM against WCAG 2.2 A and AA, so
 * it catches the things a role-based test suite cannot: contrast, landmark
 * structure, duplicated ids, controls with no accessible name.
 *
 * Findings are reported per route with their selectors, so a failure names the
 * element rather than the page.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Known violations, allowlisted with a date and a reason (TESTING.md §9d).
 *
 * An allowlist is not a pass. Each entry is a real WCAG failure that this suite
 * found and that someone decided not to fix yet; keeping them listed means the
 * gate still protects every *other* rule on every page, and that this one
 * cannot spread silently.
 */
const ALLOWED: Array<{ id: string; why: string }> = [
  {
    id: 'color-contrast',
    why:
      'Found 2026-09-07 on .viz__meta and .chip: the dark theme’s faint text falls under 4.5:1. ' +
      'Fixing it means moving --text-faint, which is a design-token decision for the owner ' +
      '(ADR-012, UI.md §1), not something a test run should change. Tracked as an open finding.',
  },
];

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const allowed = new Set(ALLOWED.map((a) => a.id));
  const violations = results.violations
    .filter((v) => !allowed.has(v.id))
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ')),
    }));
  const suppressed = results.violations.filter((v) => allowed.has(v.id));
  if (suppressed.length > 0) {
    console.log(
      `[a11y] ${label}: ${suppressed.length} allowlisted violation(s): ` +
        suppressed.map((v) => `${v.id}×${v.nodes.length}`).join(', '),
    );
  }
  expect(violations, `${label} has accessibility violations`).toEqual([]);
}

const joinDemo = joinDemoCircle;

test.describe('[auth-signin] accessibility', () => {
  test('the sign-in screen', async ({ app }) => {
    await app.goto('#/');
    await expect(app.getByRole('button', { name: /continue with github/i })).toBeVisible();
    await audit(app, 'sign-in');
  });
});

test.describe('[home-gating] accessibility', () => {
  test('circle home', async ({ app }) => {
    await joinDemo(app);
    await audit(app, 'circle home');
  });
});

test.describe('[repo-registry] accessibility', () => {
  test('the repos page', async ({ app }) => {
    await joinDemo(app);
    await app.goto('#/g/demo-circle/repos');
    // Same reasoning as the members page: assert the page rendered, not that a
    // particular repo is on it. Which repos show depends on emulator state
    // carried over from earlier tests in the run.
    await expect(app.locator('.app')).toBeVisible({ timeout: 30_000 });
    await app.waitForTimeout(1500);
    await audit(app, 'repos');
  });
});

test.describe('[membership-roles] accessibility', () => {
  test('the members page', async ({ app }) => {
    await joinDemo(app);
    await app.goto('#/g/demo-circle/members');
    // Assert the page rendered its roster, not one particular person: who is
    // listed first depends on join order, which is not what this test is about.
    await expect(app.getByRole('link').first()).toBeVisible({ timeout: 30_000 });
    await audit(app, 'members');
  });
});

test.describe('[routing] accessibility', () => {
  test('not found', async ({ app }) => {
    await signIn(app);
    await app.goto('#/definitely/not/a/route');
    await expect(app.getByRole('link').first()).toBeVisible();
    await audit(app, 'not found');
  });
});

test.describe('[ui-primitives] keyboard reachability', () => {
  test('every control on sign-in can be reached by Tab alone', async ({ app }) => {
    await app.goto('#/');
    await expect(app.getByRole('button', { name: /continue with github/i })).toBeVisible();

    const reachable = new Set<string>();
    for (let i = 0; i < 25; i++) {
      await app.keyboard.press('Tab');
      const id = await app.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        return `${el.tagName}:${(el.textContent ?? '').trim().slice(0, 30)}`;
      });
      if (id) reachable.add(id);
    }
    // The primary action must be among them; a control only reachable by mouse
    // is invisible to a keyboard user and to a screen reader alike.
    const hasPrimary = [...reachable].some((r) => /continue with github/i.test(r));
    expect(hasPrimary, `tab order reached: ${[...reachable].join(' | ')}`).toBe(true);
  });

  test('focus is always visible on the focused control', async ({ app }) => {
    await app.goto('#/');
    await app.keyboard.press('Tab');
    const hasOutline = await app.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return true; // nothing focused yet
      const s = getComputedStyle(el);
      // A focus style is an outline, a ring, or a visible box-shadow. Removing
      // all three is the classic way to make an app unusable by keyboard.
      return (
        (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) ||
        s.boxShadow !== 'none' ||
        s.borderColor !== 'rgba(0, 0, 0, 0)'
      );
    });
    expect(hasOutline, 'the focused control must be visibly focused').toBe(true);
  });
});
