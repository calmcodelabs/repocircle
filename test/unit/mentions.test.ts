import { describe, it, expect } from 'vitest';
import { extractMentions, extractRepoRefs, isSafeUrl, tokenizeComment } from '../../src/util/mentions';

describe('tokenizeComment', () => {
  it('splits mentions, repo refs and links out of plain text', () => {
    const t = tokenizeComment('hey @ishvak look at #pocket-journal https://example.com/x done');
    expect(t.find((x) => x.kind === 'mention')?.value).toBe('ishvak');
    expect(t.find((x) => x.kind === 'repo')?.value).toBe('pocket-journal');
    expect(t.find((x) => x.kind === 'link')?.value).toBe('https://example.com/x');
    expect(t.map((x) => x.value).join('')).toContain('done');
  });

  it('never loses or invents characters', () => {
    const body = 'a @b #c https://d.e f';
    const rebuilt = tokenizeComment(body)
      .map((t) => (t.kind === 'mention' ? `@${t.value}` : t.kind === 'repo' ? `#${t.value}` : t.value))
      .join('');
    expect(rebuilt).toBe(body);
  });

  it('leaves markup as inert text', () => {
    const t = tokenizeComment('<img src=x onerror=alert(1)>');
    expect(t.every((x) => x.kind === 'text')).toBe(true);
  });
});

describe('extractMentions / extractRepoRefs', () => {
  const members = ['ishvak', 'calmcodelabs'];
  const repos = ['pocket-journal', 'score-keeper'];

  it('keeps only real circle members and repos', () => {
    expect(extractMentions('@ishvak and @stranger', members)).toEqual(['ishvak']);
    expect(extractRepoRefs('#pocket-journal vs #nope', repos)).toEqual(['pocket-journal']);
  });

  it('is case-insensitive but stores the canonical name', () => {
    expect(extractMentions('@ISHVAK', members)).toEqual(['ishvak']);
    expect(extractRepoRefs('#Score-Keeper', repos)).toEqual(['score-keeper']);
  });

  it('dedupes and caps at ten', () => {
    expect(extractMentions('@ishvak @ishvak', members)).toEqual(['ishvak']);
  });
});

describe('isSafeUrl', () => {
  it('allows only http(s)', () => {
    expect(isSafeUrl('https://x.com')).toBe(true);
    expect(isSafeUrl('http://x.com')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeUrl('//evil.com')).toBe(false);
  });
});
