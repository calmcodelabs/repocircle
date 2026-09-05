import { describe, it, expect } from 'vitest';
import { parseHash } from '../../src/router';

describe('parseHash', () => {
  it('maps the route table', () => {
    expect(parseHash('')).toEqual({ name: 'root' });
    expect(parseHash('#/')).toEqual({ name: 'root' });
    expect(parseHash('#/diag')).toEqual({ name: 'diag' });
    expect(parseHash('#/new')).toEqual({ name: 'new' });
    expect(parseHash('#/g/abc')).toEqual({ name: 'home', gid: 'abc' });
    expect(parseHash('#/g/abc/repos')).toEqual({ name: 'repos', gid: 'abc' });
    expect(parseHash('#/g/abc/members')).toEqual({ name: 'members', gid: 'abc' });
    expect(parseHash('#/g/abc/settings')).toEqual({ name: 'settings', gid: 'abc' });
    expect(parseHash('#/g/abc/ask/a1')).toEqual({ name: 'ask', gid: 'abc', askId: 'a1' });
    expect(parseHash('#/g/abc/m/u1')).toEqual({ name: 'profile', gid: 'abc', uid: 'u1' });
    expect(parseHash('#/join/g1/tok')).toEqual({ name: 'join', gid: 'g1', token: 'tok' });
  });

  it('rejects junk', () => {
    expect(parseHash('#/nope')).toEqual({ name: 'notfound' });
    expect(parseHash('#/g')).toEqual({ name: 'notfound' });
    expect(parseHash('#/g/abc/unknown')).toEqual({ name: 'notfound' });
    expect(parseHash('#/g/abc/m')).toEqual({ name: 'notfound' });
    expect(parseHash('#/join/onlygid')).toEqual({ name: 'notfound' });
  });

  it('decodes URI components safely', () => {
    expect(parseHash('#/g/a%20b')).toEqual({ name: 'home', gid: 'a b' });
  });
});
