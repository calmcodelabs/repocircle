/**
 * Fills the local Firestore emulator with a circle big enough to be worth
 * clicking through.
 *
 * The circle itself is defined once, in test/fixtures/scenarios.ts, and shared
 * with every test layer — a dev seed that drifts from the test fixtures means
 * the thing you click through is not the thing CI proves (TESTING.md §4). Node
 * strips the types, so this plain .mjs consumes the TypeScript library directly.
 *
 * Emulator only. It reaches Firestore through the rules-testing harness with
 * rules disabled, which cannot talk to a real project — there is no path from
 * here to production data.
 *
 * Sign in with any account against the Auth emulator, then open
 *   #/join/demo-circle/devtoken
 * to walk the real join flow (including the M17 questions) into the circle.
 *
 * SIZE=minimal|demo|windowed (default demo) picks how much to seed.
 */
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { buildScenario } from '../test/fixtures/scenarios.ts';
import { writeScenario } from '../test/fixtures/write.ts';

const size = process.env.SIZE ?? 'demo';
if (!['minimal', 'demo', 'windowed'].includes(size)) {
  console.error(`Unknown SIZE "${size}" — use minimal, demo or windowed.`);
  process.exit(1);
}

// Real wall-clock, so a freshly seeded circle looks fresh when you open it.
// Tests pin `now` instead; that difference is the whole point of the option.
const scenario = buildScenario(size, { now: Date.now(), gid: 'demo-circle' });

const env = await initializeTestEnvironment({
  projectId: process.env.GCLOUD_PROJECT ?? 'repocircle-3e9a6',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
});

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  await writeScenario(ctx.firestore(), scenario);
});
await env.cleanup();

const { counts, gid, inviteToken } = scenario.facts;
console.info(
  `Seeded ${gid} (${size}): ${counts.members} members, ${counts.repos} repos, ` +
    `${scenario.facts.askIds.length} asks, ${scenario.facts.ideaIds.length} ideas, ` +
    'a session, a poll and an announcement.\n' +
    `Sign in against the Auth emulator, then open #/join/${gid}/${inviteToken}`,
);
