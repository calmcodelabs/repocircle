/**
 * M16.5 — which Home blocks a member sees, and therefore which listeners mount.
 *
 * Gating markup alone would be theatre: the read is paid when the listener
 * attaches, so a hidden block has to be an unrendered component (ADR-022).
 * That makes this function the read budget as much as the layout.
 *
 * The rule is *can this block mean anything to this member yet* — never "have
 * they done their chores". The onboarding checklist stays what it has always
 * been, a guide and not a gate (F-12): every input below can only ever *widen*
 * the page, never close it, and `showAll` overrides all of it.
 */
export type HomeBlocks = {
  matcher: boolean;
  arrivals: boolean;
  newThisWeek: boolean;
  wantsAHand: boolean;
  ideas: boolean;
  together: boolean;
  discussion: boolean;
  yourActivity: boolean;
};

export type HomeGateInput = {
  /** They have said what they can help with, so the matcher has a key to join on. */
  hasSkills: boolean;
  /** Circle repo count from the summary; null while unknown. */
  repoCount: number | null;
  /** They have posted or claimed something here. */
  hasActivity: boolean;
  /** Time since they joined, in ms; null while unknown. */
  membershipAgeMs: number | null;
  /** Onboarding steps completed — evidence of settling in, never a requirement. */
  checklistDone: number;
  /** They asked for the whole page. Wins over everything. */
  showAll: boolean;
};

export const SETTLING_IN_MS = 48 * 3_600_000;
const SETTLED_STEPS = 3;

/**
 * Past the first-run window. Either enough time has passed that "new here" has
 * stopped being true, or they have moved through the circle enough that the
 * quiet version of the page is no longer doing them a favour.
 */
export function isSettledIn(
  i: Pick<HomeGateInput, 'membershipAgeMs' | 'checklistDone' | 'showAll'>,
): boolean {
  if (i.showAll) return true;
  if (i.checklistDone >= SETTLED_STEPS) return true;
  return i.membershipAgeMs !== null && i.membershipAgeMs > SETTLING_IN_MS;
}

export function visibleBlocks(i: HomeGateInput): HomeBlocks {
  const settled = isSettledIn(i);
  // Unknown is not the same as zero: a circle whose summary has not loaded (or
  // predates M16) must not have its repo blocks hidden on a guess.
  const mayHaveRepos = i.repoCount === null || i.repoCount > 0;
  return {
    // Nothing to match against until they have said what they can do.
    matcher: i.hasSkills,
    // Shares the member listener the avatar strip needs, so it costs nothing.
    arrivals: true,
    newThisWeek: mayHaveRepos,
    wantsAHand: mayHaveRepos,
    // These three are the circle's ongoing conversation. On day one they are
    // noise around the question a new member actually has, which is "what is
    // being built here and what do I do next".
    ideas: settled,
    together: settled,
    discussion: settled,
    // Before you have done anything this block is, definitionally, empty. The
    // `settled` term keeps a failed checklist write (a mirror — Class A) from
    // hiding activity that really exists.
    yourActivity: i.showAll || i.hasActivity || settled,
  };
}

/** True when the page is deliberately narrower than it will later be. */
export function isNarrowed(b: HomeBlocks): boolean {
  return !(b.ideas && b.together && b.discussion);
}
