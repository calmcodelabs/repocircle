import { describe, it, expect } from 'vitest';
import {
  isNarrowed,
  isSettledIn,
  SETTLING_IN_MS,
  visibleBlocks,
  type HomeGateInput,
} from '../../src/util/homeBlocks';

const dayOne: HomeGateInput = {
  hasSkills: false,
  repoCount: 12,
  hasActivity: false,
  membershipAgeMs: 3_600_000,
  checklistDone: 0,
  showAll: false,
};

describe('isSettledIn', () => {
  it('is false in the first hours with nothing done', () => {
    expect(isSettledIn(dayOne)).toBe(false);
  });

  it('becomes true once the settling-in window passes', () => {
    expect(isSettledIn({ ...dayOne, membershipAgeMs: SETTLING_IN_MS + 1 })).toBe(true);
  });

  it('becomes true early for someone who has moved around the circle', () => {
    expect(isSettledIn({ ...dayOne, checklistDone: 3 })).toBe(true);
  });

  it('is true whenever they asked for the whole page', () => {
    expect(isSettledIn({ ...dayOne, showAll: true })).toBe(true);
  });

  it('does not guess from an unknown membership age', () => {
    expect(isSettledIn({ ...dayOne, membershipAgeMs: null })).toBe(false);
  });
});

describe('visibleBlocks', () => {
  it('gives a day-one member the essentials only', () => {
    const b = visibleBlocks(dayOne);
    expect(b).toMatchObject({
      matcher: false,
      ideas: false,
      together: false,
      discussion: false,
      yourActivity: false,
    });
    // What is left is what a new member actually came for.
    expect(b.newThisWeek).toBe(true);
    expect(b.wantsAHand).toBe(true);
    expect(b.arrivals).toBe(true);
  });

  it('gives a settled member everything', () => {
    const b = visibleBlocks({
      ...dayOne,
      hasSkills: true,
      hasActivity: true,
      membershipAgeMs: SETTLING_IN_MS * 10,
    });
    expect(Object.values(b).every(Boolean)).toBe(true);
  });

  it('shows everything the moment it is asked for, however new they are', () => {
    const b = visibleBlocks({ ...dayOne, showAll: true });
    expect(b.ideas && b.together && b.discussion && b.yourActivity).toBe(true);
  });

  // showAll must not invent a matcher that has nothing to match on.
  it('still hides the matcher when there are no skills to match', () => {
    expect(visibleBlocks({ ...dayOne, showAll: true }).matcher).toBe(false);
  });

  it('hides the repo blocks only when the circle provably has no repos', () => {
    expect(visibleBlocks({ ...dayOne, repoCount: 0 }).newThisWeek).toBe(false);
    expect(visibleBlocks({ ...dayOne, repoCount: 0 }).wantsAHand).toBe(false);
  });

  // Class A: an unloaded summary is not evidence of an empty circle.
  it('does not hide the repo blocks while the count is unknown', () => {
    expect(visibleBlocks({ ...dayOne, repoCount: null }).newThisWeek).toBe(true);
  });

  // Class A: checklist flags are best-effort writes and can be missing.
  it('shows your activity to a settled member even if the flag never landed', () => {
    const b = visibleBlocks({ ...dayOne, hasActivity: false, checklistDone: 3 });
    expect(b.yourActivity).toBe(true);
  });

  it('shows your activity as soon as there is any', () => {
    expect(visibleBlocks({ ...dayOne, hasActivity: true }).yourActivity).toBe(true);
  });
});

describe('isNarrowed', () => {
  it('is true while the conversational blocks are held back', () => {
    expect(isNarrowed(visibleBlocks(dayOne))).toBe(true);
  });

  it('is false once the page is whole', () => {
    expect(isNarrowed(visibleBlocks({ ...dayOne, showAll: true }))).toBe(false);
  });
});
