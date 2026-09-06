import type { HelpArea, Member, Repo } from '../data/types';

/**
 * Language → the help areas it is evidence for. Deliberately coarse: this only
 * seeds the edit sheet, the member confirms before anything is saved. Python is
 * ambiguous on purpose — for students it is as often ML as backend, and an
 * over-suggestion costs one untick. Nothing maps to 'design' or 'feedback';
 * those are claims code cannot make for you.
 */
const LANG_AREAS: Record<string, HelpArea[]> = {
  typescript: ['frontend'],
  javascript: ['frontend'],
  html: ['frontend'],
  css: ['frontend'],
  vue: ['frontend'],
  svelte: ['frontend'],
  swift: ['frontend'],
  kotlin: ['frontend'],
  dart: ['frontend'],
  python: ['backend', 'ml'],
  'jupyter notebook': ['ml'],
  r: ['ml'],
  go: ['backend'],
  rust: ['backend'],
  java: ['backend'],
  ruby: ['backend'],
  php: ['backend'],
  'c#': ['backend'],
  c: ['backend'],
  'c++': ['backend'],
  elixir: ['backend'],
  scala: ['backend'],
};

/** Does this circle repo belong to this member? Login matches case-insensitively. */
export function ownsRepo(r: Repo, m: Pick<Member, 'uid' | 'login'>): boolean {
  return r.ownerUid === m.uid || r.githubOwnerLogin.toLowerCase() === m.login.toLowerCase();
}

/**
 * Class F: who owns this repo in the circle, resolved against live members —
 * in-app ownership (uid) first, the GitHub author as fallback. The ONLY basis
 * for "is this repo ownerless?" decisions (mirrors like githubOwnerLogin alone
 * gave wrong answers after adoptions).
 */
export function circleOwner<M extends Pick<Member, 'uid' | 'login'>>(
  r: Repo,
  members: M[] | null | undefined,
): M | undefined {
  return (
    members?.find((m) => m.uid === r.ownerUid) ??
    members?.find((m) => m.login.toLowerCase() === r.githubOwnerLogin.toLowerCase())
  );
}

export type LanguageEvidence = { language: string; repos: number };

/**
 * The languages a member's circle repos are written in, most-used first — shown
 * on the profile as fact ("works in TypeScript"), derived, never self-declared.
 */
export function languageEvidence(ownRepos: Repo[]): LanguageEvidence[] {
  const counts = new Map<string, number>();
  for (const r of ownRepos) {
    if (!r.language) continue;
    counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([language, repos]) => ({ language, repos }))
    .sort((a, b) => b.repos - a.repos || a.language.localeCompare(b.language));
}

/** Pre-fill for an empty helpWith: what the member's own code suggests they do. */
export function suggestHelpWith(evidence: LanguageEvidence[]): HelpArea[] {
  const out: HelpArea[] = [];
  for (const e of evidence) {
    for (const area of LANG_AREAS[e.language.toLowerCase()] ?? []) {
      if (!out.includes(area)) out.push(area);
    }
  }
  return out;
}
