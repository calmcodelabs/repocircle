import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  isNewSince,
  mergeInbox,
  parseSubjectPath,
  subjectHref,
  type InboxItem,
} from '../../src/util/inboxItems';

const t = (ms: number) => Timestamp.fromMillis(ms);

function item(over: Partial<InboxItem & { actorUid: string }>): InboxItem & { actorUid: string } {
  return {
    key: 'groups/g1/repos/1/comments/c1',
    kind: 'mention',
    gid: 'g1',
    actorUid: 'u2',
    actorLogin: 'arjun',
    href: '#/g/g1/repo/1',
    at: t(1000),
    isNew: false,
    ...over,
  };
}

describe('parseSubjectPath', () => {
  it('parses repo comment paths', () => {
    expect(parseSubjectPath('groups/g1/repos/42/comments/c9')).toEqual({
      gid: 'g1',
      kind: 'repo',
      subjectId: '42',
    });
  });
  it('parses ask interest-free paths', () => {
    expect(parseSubjectPath('groups/g1/asks/a7/comments/c1')).toEqual({
      gid: 'g1',
      kind: 'ask',
      subjectId: 'a7',
    });
  });
  it('rejects foreign shapes', () => {
    expect(parseSubjectPath('users/u1/watches/w1')).toBeNull();
    expect(parseSubjectPath('groups/g1/members/u1')).toBeNull();
  });
});

describe('subjectHref', () => {
  it('routes repos and asks', () => {
    expect(subjectHref({ gid: 'g', kind: 'repo', subjectId: '5' })).toBe('#/g/g/repo/5');
    expect(subjectHref({ gid: 'g', kind: 'ask', subjectId: 'a' })).toBe('#/g/g/ask/a');
  });
});

describe('mergeInbox', () => {
  it('drops my own actions', () => {
    expect(mergeInbox([item({ actorUid: 'me' })], 'me')).toEqual([]);
  });
  it('dedupes by path preferring reply over mention', () => {
    const merged = mergeInbox([item({ kind: 'mention' }), item({ kind: 'reply' })], 'me');
    expect(merged).toHaveLength(1);
    expect(merged[0]?.kind).toBe('reply');
  });
  it('sorts newest first and caps', () => {
    const merged = mergeInbox(
      [item({ key: 'a', at: t(1) }), item({ key: 'b', at: t(3) }), item({ key: 'c', at: t(2) })],
      'me',
      2,
    );
    expect(merged.map((m) => m.key)).toEqual(['b', 'c']);
  });
  it('strips actorUid from the result', () => {
    const merged = mergeInbox([item({})], 'me');
    expect('actorUid' in (merged[0] ?? {})).toBe(false);
  });
});

describe('isNewSince', () => {
  it('null timestamp is never new', () => {
    expect(isNewSince(null, t(5))).toBe(false);
  });
  it('no watermark → new', () => {
    expect(isNewSince(t(5), undefined)).toBe(true);
  });
  it('compares against the watermark', () => {
    expect(isNewSince(t(6), t(5))).toBe(true);
    expect(isNewSince(t(4), t(5))).toBe(false);
  });
});
