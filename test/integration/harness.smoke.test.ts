import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { doc, getDoc } from 'firebase/firestore';
import {
  appDb,
  assertEmulators,
  clearData,
  closeHarness,
  seedSize,
  signInAs,
  signOutNow,
} from './harness.ts';

describe('[infrastructure] the integration harness reaches the emulators as a real user', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('signs in as a specific uid and reads through the real rules', async () => {
    const s = await seedSize('minimal');
    await signInAs(s.facts.adminUid);
    const snap = await getDoc(doc(appDb(), `groups/${s.gid}`));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.name).toBe(s.facts.groupName);
  });

  it('denies a non-member, proving rules are actually applied', async () => {
    const s = await seedSize('minimal');
    await signInAs('mallory-not-a-member');
    await expect(getDoc(doc(appDb(), `groups/${s.gid}`))).rejects.toThrow();
    await signOutNow();
  });
});
