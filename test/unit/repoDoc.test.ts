import { describe, it, expect } from 'vitest';
import { toRepoDoc } from '../../src/data/repos';
import type { GhRepo } from '../../src/github/types';

const me = { uid: 'u1', login: 'Alice', name: 'Alice', avatarUrl: '' };

function gh(overrides: Partial<GhRepo> = {}): GhRepo {
  return {
    id: 99,
    full_name: 'alice/proj',
    name: 'proj',
    description: 'desc',
    html_url: 'https://github.com/alice/proj',
    homepage: null,
    language: 'TypeScript',
    topics: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    owner: { login: 'alice', avatar_url: '' },
    pushed_at: '2026-09-01T00:00:00Z',
    fork: false,
    archived: false,
    private: false,
    default_branch: 'main',
    ...overrides,
  };
}

describe('toRepoDoc', () => {
  it('clamps description to the rules limit and caps topics', () => {
    const d = toRepoDoc(gh({ description: 'x'.repeat(900) }), me);
    expect(d.description!.length).toBe(500);
    expect(d.topics.length).toBe(6);
  });
  it('keeps https homepage as demoUrl, drops http', () => {
    expect(toRepoDoc(gh({ homepage: 'https://demo.app' }), me).demoUrl).toBe('https://demo.app');
    expect(toRepoDoc(gh({ homepage: 'http://demo.app' }), me).demoUrl).toBeNull();
    expect(toRepoDoc(gh({ homepage: '' }), me).demoUrl).toBeNull();
  });
  it('matches ownerUid case-insensitively against my login', () => {
    expect(toRepoDoc(gh(), me).ownerUid).toBe('u1');
    expect(toRepoDoc(gh({ owner: { login: 'someone-else', avatar_url: '' } }), me).ownerUid).toBeNull();
  });
  it('seeds lastEventAt from pushed_at, null-safe', () => {
    expect(toRepoDoc(gh(), me).lastEventAt).not.toBeNull();
    expect(toRepoDoc(gh({ pushed_at: null }), me).lastEventAt).toBeNull();
  });
});
