import { describe, it, expect } from 'vitest';
import { dayKey, idGreater, normalizeEvent } from '../../src/poll/normalize';

const REPO = 'alice/proj';
const base = { actor: { login: 'alice', avatar_url: 'https://a' }, created_at: '2026-09-05T10:00:00Z' };

describe('normalizeEvent', () => {
  it('push → commits with branch summary', () => {
    const n = normalizeEvent(
      { ...base, id: '1', type: 'PushEvent', payload: { ref: 'refs/heads/main', distinct_size: 3 } },
      REPO,
    )!;
    expect(n.type).toBe('push');
    expect(n.summary).toBe('3 commits to main');
    expect(n.counters.commits).toBe(3);
    expect(n.url).toContain('/commits/main');
  });

  it('empty push is skipped', () => {
    expect(normalizeEvent({ ...base, id: '2', type: 'PushEvent', payload: { distinct_size: 0 } }, REPO)).toBeNull();
  });

  it('PR opened / merged / closed map distinctly', () => {
    const pr = { number: 7, title: 'Add thing', html_url: 'https://github.com/alice/proj/pull/7' };
    const opened = normalizeEvent({ ...base, id: '3', type: 'PullRequestEvent', payload: { action: 'opened', pull_request: pr } }, REPO)!;
    const merged = normalizeEvent({ ...base, id: '4', type: 'PullRequestEvent', payload: { action: 'closed', pull_request: { ...pr, merged: true } } }, REPO)!;
    const closed = normalizeEvent({ ...base, id: '5', type: 'PullRequestEvent', payload: { action: 'closed', pull_request: pr } }, REPO)!;
    expect(opened.counters.prsOpened).toBe(1);
    expect(merged.type).toBe('pr_merged');
    expect(merged.counters.prsMerged).toBe(1);
    expect(closed.type).toBe('pr_closed');
    expect(closed.counters).toEqual({});
  });

  it('issues, release published, branch create, fork', () => {
    expect(
      normalizeEvent({ ...base, id: '6', type: 'IssuesEvent', payload: { action: 'opened', issue: { number: 2, title: 'Bug', html_url: 'https://x' } } }, REPO)!
        .counters.issuesOpened,
    ).toBe(1);
    expect(
      normalizeEvent({ ...base, id: '7', type: 'ReleaseEvent', payload: { action: 'published', release: { tag_name: 'v1.0', html_url: 'https://r' } } }, REPO)!.summary,
    ).toBe('Release v1.0');
    expect(normalizeEvent({ ...base, id: '8', type: 'ReleaseEvent', payload: { action: 'created' } }, REPO)).toBeNull();
    expect(normalizeEvent({ ...base, id: '9', type: 'CreateEvent', payload: { ref_type: 'branch', ref: 'feat/x' } }, REPO)!.type).toBe('branch_created');
    expect(normalizeEvent({ ...base, id: '10', type: 'CreateEvent', payload: { ref_type: 'tag', ref: 'v1' } }, REPO)).toBeNull();
    expect(normalizeEvent({ ...base, id: '11', type: 'ForkEvent', payload: { forkee: { html_url: 'https://f' } } }, REPO)!.summary).toBe('forked by @alice');
    expect(normalizeEvent({ ...base, id: '12', type: 'WatchEvent', payload: {} }, REPO)).toBeNull();
  });
});

describe('idGreater / dayKey', () => {
  it('compares digit strings by magnitude', () => {
    expect(idGreater('100', '99')).toBe(true);
    expect(idGreater('99', '100')).toBe(false);
    expect(idGreater('12345678901234567890', '9999999999999999999')).toBe(true);
  });
  it('dayKey is UTC date', () => {
    expect(dayKey(new Date('2026-09-05T23:59:59Z'))).toBe('2026-09-05');
    expect(dayKey(new Date('2026-09-05T00:00:01Z'))).toBe('2026-09-05');
  });
});
