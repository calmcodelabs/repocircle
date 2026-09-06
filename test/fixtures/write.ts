/**
 * The one place a Scenario becomes Firestore documents.
 *
 * scenarios.ts deliberately knows nothing about firebase — that is what lets
 * the same library feed component tests, the .mjs dev seed and the emulator
 * suites. This module is the seam: it walks the plain documents and converts
 * the ISO timestamp markers into real Timestamps at the boundary.
 */
import { Timestamp, doc, setDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { isTimestamp, type Scenario, type SeedDoc } from './scenarios.ts';

/** Firestore batches cap at 500 operations; scenarios can exceed that. */
const BATCH_MAX = 400;

function hydrate(value: unknown): unknown {
  if (isTimestamp(value)) return Timestamp.fromDate(new Date(value.__ts));
  if (Array.isArray(value)) return value.map(hydrate);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = hydrate(v);
    return out;
  }
  return value;
}

export function hydrateDoc(d: SeedDoc): Record<string, unknown> {
  return hydrate(d.data) as Record<string, unknown>;
}

/** Write every document of a scenario. Caller supplies a rules-exempt handle. */
export async function writeScenario(db: Firestore, scenario: Scenario): Promise<void> {
  for (let i = 0; i < scenario.docs.length; i += BATCH_MAX) {
    const slice = scenario.docs.slice(i, i + BATCH_MAX);
    const batch = writeBatch(db);
    for (const d of slice) batch.set(doc(db, d.path), hydrateDoc(d));
    await batch.commit();
  }
}

/** Write a single ad-hoc document with the same timestamp conversion. */
export async function writeDoc(
  db: Firestore,
  path: string,
  data: Record<string, unknown>,
): Promise<void> {
  await setDoc(doc(db, path), hydrate(data) as Record<string, unknown>);
}
