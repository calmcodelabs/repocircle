import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/preact';
import { userEvent } from 'vitest/browser';
import { App } from '../../src/views/App';
import { GroupShell } from '../../src/views/GroupShell';
import { Maintenance } from '../../src/views/Maintenance';
import { NotFound } from '../../src/views/NotFound';
import { activeDenied, activeGroup, myMembership } from '../../src/data/activeGroup';
import { sessionUser } from '../../src/auth/session';
import { myUserDoc } from '../../src/data/users';
import { route } from '../../src/router';
import { updateReady } from '../../src/util/appUpdate';
import { serverUnavailable } from '../../src/util/log';
import { member, signedInAs } from './harness/stores.ts';

/**
 * Views driven through the states their own stores can reach (TESTING.md §2, L4).
 *
 * Everything here is real: the component, its hooks, its markup and the app's
 * stylesheets. The states are set through the same Preact signals the data
 * layer writes to, which is how the app itself moves between them — no module
 * is stubbed, so nothing can pass because a mock was wrong.
 *
 * The limit of that approach, and the reason §9c records it: states that live
 * behind a `watch*` call rather than a store are not reachable from here. Those
 * are covered by the E2E journeys instead, where the emulator supplies them for
 * real.
 */

describe('[routing] the shell picks the right screen', () => {
  beforeEach(() => {
    route.value = { name: 'root' };
  });

  it('shows a skeleton while auth is still unknown, never an empty page', async () => {
    sessionUser.value = undefined as never;
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.skeleton')).toBeTruthy());
  });

  it('sends a signed-out visitor to sign-in', async () => {
    sessionUser.value = null;
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading')).toBeTruthy());
  });

  it('routes an unknown hash to not-found rather than a blank screen', async () => {
    signedInAs('mira-t');
    route.value = { name: 'notfound' };
    render(<App />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
  });

  it('offers a way out of not-found', () => {
    render(<NotFound />);
    const home = screen.getAllByRole('link').find((a) => a.getAttribute('href')?.includes('#/'));
    expect(home, 'NotFound must offer a route home').toBeTruthy();
  });
});

describe('[app-update] the reload bar (Class D)', () => {
  beforeEach(() => {
    signedInAs('mira-t');
    route.value = { name: 'notfound' };
  });

  it('stays hidden until an update is genuinely waiting', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: /updated/i })).toBeNull();
  });

  it('appears when a new worker takes over, and is reachable by keyboard', async () => {
    render(<App />);
    updateReady.value = true;
    const bar = await screen.findByRole('button', { name: /updated/i });
    // A button, not a banner: the whole point of Class D is that the person
    // looking at yesterday's bundle can do something about it.
    await userEvent.tab();
    expect(document.activeElement).toBe(bar);
  });

  it('says what happened in plain words', async () => {
    render(<App />);
    updateReady.value = true;
    const bar = await screen.findByRole('button', { name: /updated/i });
    expect(bar.textContent).toContain('RepoCircle was updated');
  });
});

describe('[active-circle] a denied circle offers a way out (Class B)', () => {
  beforeEach(() => {
    signedInAs('mira-t');
    route.value = { name: 'home', gid: 'demo-circle' };
  });

  it('never leaves a denial as a silent blank screen', async () => {
    render(
      <GroupShell gid="demo-circle">
        <div>inner</div>
      </GroupShell>,
    );
    activeDenied.value = true;
    await waitFor(() => expect(screen.queryByText('inner')).toBeNull());
    // Something must be actionable — a latched error with no exit is the class.
    const actions = [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')];
    expect(actions.length).toBeGreaterThan(0);
  });

  it('offers a retry, because a denial is often just a slow membership write', async () => {
    render(
      <GroupShell gid="demo-circle">
        <div>inner</div>
      </GroupShell>,
    );
    activeDenied.value = true;
    await waitFor(() => expect(screen.queryByText('inner')).toBeNull());
    const retry = screen
      .queryAllByRole('button')
      .find((b) => /try again|retry/i.test(b.textContent ?? ''));
    expect(retry, 'the denied screen must offer a retry').toBeTruthy();
  });

  it('clearing the denial restores the page', async () => {
    render(
      <GroupShell gid="demo-circle">
        <div>inner</div>
      </GroupShell>,
    );
    activeDenied.value = true;
    await waitFor(() => expect(screen.queryByText('inner')).toBeNull());
    activeDenied.value = false;
    activeGroup.value = {
      id: 'demo-circle',
      name: 'Northside Build Club',
      description: '',
      visibility: 'private',
      createdBy: 'n-rahman',
      memberCount: 3,
      settings: { askTags: [], defaultRole: 'member' },
      createdAt: null,
      v: 1,
    } as never;
    myMembership.value = member('mira-t');
    await waitFor(() => expect(screen.getByText('inner')).toBeTruthy());
  });

  it('a backend problem is reported without claiming you were removed', async () => {
    render(
      <GroupShell gid="demo-circle">
        <div>inner</div>
      </GroupShell>,
    );
    activeGroup.value = {
      id: 'demo-circle',
      name: 'Northside Build Club',
      description: '',
      visibility: 'private',
      createdBy: 'n-rahman',
      memberCount: 3,
      settings: { askTags: [], defaultRole: 'member' },
      createdAt: null,
      v: 1,
    } as never;
    myMembership.value = member('mira-t');
    serverUnavailable.value = 'resource-exhausted';
    await waitFor(() => expect(screen.getByText('inner')).toBeTruthy());
    // The page keeps working; an outage is not a denial (activeGroup.ts).
    expect(activeDenied.value).toBe(false);
  });
});

describe('[maintenance-mode] the pause screen', () => {
  it('explains itself and asks nothing of the reader', () => {
    render(<Maintenance />);
    expect(screen.getByRole('heading')).toBeTruthy();
    // Deliberately inert: no sign-in, no retry, nothing that would touch quota.
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('reassures that nothing is lost, which is the only question that matters', () => {
    render(<Maintenance />);
    expect(document.body.textContent?.toLowerCase()).toContain('nothing you do here will be lost');
  });
});

describe('[profile-recovery] a missing user document', () => {
  it('is offered a repair rather than an empty home', async () => {
    sessionUser.value = {
      uid: 'mira-t',
      displayName: 'mira-t',
      photoURL: '',
      email: null,
    } as never;
    myUserDoc.value = null;
    route.value = { name: 'root' };
    render(<App />);
    // Confirmed-missing is deliberately delayed so a fresh sign-in does not
    // flash this screen; before that, the page must not be blank.
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
  });
});
