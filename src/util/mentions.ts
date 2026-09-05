/**
 * Comment text is stored raw and rendered as text nodes — never as markup
 * (SECURITY §6). These helpers only *locate* mentions, repo references and links
 * so the UI can print them as separate, styled spans.
 */

export type Token =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; value: string }
  | { kind: 'repo'; value: string }
  | { kind: 'link'; value: string };

const PATTERN = /(@[A-Za-z0-9][A-Za-z0-9-]{0,38})|(#[A-Za-z0-9._-]{1,100})|(https?:\/\/[^\s<>"']+)/g;

export function tokenizeComment(body: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of body.matchAll(PATTERN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: 'text', value: body.slice(last, at) });
    if (m[1]) out.push({ kind: 'mention', value: m[1].slice(1) });
    else if (m[2]) out.push({ kind: 'repo', value: m[2].slice(1) });
    else if (m[3]) out.push({ kind: 'link', value: m[3] });
    last = at + m[0].length;
  }
  if (last < body.length) out.push({ kind: 'text', value: body.slice(last) });
  return out;
}

/** Logins mentioned, restricted to people actually in the circle. */
export function extractMentions(body: string, memberLogins: string[]): string[] {
  const known = new Map(memberLogins.map((l) => [l.toLowerCase(), l]));
  const found = new Set<string>();
  for (const t of tokenizeComment(body)) {
    if (t.kind !== 'mention') continue;
    const hit = known.get(t.value.toLowerCase());
    if (hit) found.add(hit);
  }
  return [...found].slice(0, 10);
}

/** Repo short-names referenced with #, restricted to repos in this circle. */
export function extractRepoRefs(body: string, repoNames: string[]): string[] {
  const known = new Map(repoNames.map((n) => [n.toLowerCase(), n]));
  const found = new Set<string>();
  for (const t of tokenizeComment(body)) {
    if (t.kind !== 'repo') continue;
    const hit = known.get(t.value.toLowerCase());
    if (hit) found.add(hit);
  }
  return [...found].slice(0, 10);
}

/** Only ever linkify http(s) — no javascript:, data: or scheme-relative URLs. */
export function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
