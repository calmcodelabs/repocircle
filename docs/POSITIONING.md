# RepoCircle — Positioning

Who this is for, who it is not for, and why. This supersedes the audience claim in
PRD §1/§2 ("groups of roughly 5 to 50"). Everything else in the PRD stands.

**Status: hypothesis, not validated.** Arrived at 2026-09-06 by pitching the product
to a deliberate skeptic and following the objections until they stopped. No real
community of this size has used it yet. Treat this as the direction to test, not a
finding.

---

## 1. The statement

RepoCircle is for a **bounded community of roughly 100–300 developers who share a
context but not friendships** — one CS department, one bootcamp cohort, one large
active Discord, one university's build club.

Not a friend group. Not the public.

## 2. Why not twenty friends

This is what we built first, and it is the weaker case. At twenty people who see each
other daily, **ambient awareness already exists.** They learn what everyone is
building in class, at lunch, in the group chat. An awareness product has nothing to
add to a group that is already fully aware of itself — so the app ends up competing
with WhatsApp, and WhatsApp wins.

That is not a missing feature. No amount of building fixes it.

One thing the app genuinely adds even at this size: **auto-sync removes the
self-promotion tax.** Nobody posts "hey, look at my new repo" in a group chat five
times a week — it reads as bragging, so people simply don't share and their work stays
invisible. Auto-sync makes sharing ambient and costless. That is a real unlock. It is
not, on its own, a reason to open an app.

## 3. Why not the public

The instinct to open this up is pointing at something real: **there is no
"looking for a collaborator" signal anywhere in the GitHub ecosystem.** Below some
fame threshold a repo gets zero contributors — not because nobody would help, but
because no channel exists. And there is a genuinely large population who want to build
and learn but have no idea what to build. Two real groups, no place to meet. r/INAT
and r/SideProject exist entirely because of this hole.

It still fails, but not where you would expect. **The failure is follow-through, not
discovery.** On those boards the pattern is relentless: someone signs up excited,
makes two commits, disappears. Their need — "something to build" — is satisfied by
*any* project, so nothing binds them to yours. And early on a learner is a **net cost
to the host**: explaining the codebase, reviewing rough PRs, hand-holding. On a
six-commit prototype the host frequently does more work than if they had built it
alone.

So the scarce resource is not repos and not willing people. It is **the host's
attention, and a contributor who ships.**

A public version could work, but its mechanics would have to be about proving
follow-through rather than enabling discovery: scoped starter tasks, one merged PR
before access, a visible record of what you finished versus what you signed up for and
abandoned. That is a different application, not a setting on this one.

## 4. The actual variable

Not public versus private. **How well the group already knows itself.**

| Group | Awareness | Accountability | Verdict |
|---|---|---|---|
| 20 close friends | Already free | High | App is redundant |
| 100–300 shared context | **Genuinely missing** | **Enough to matter** | The target |
| 3,000 strangers | Missing | None | Nobody follows through |

The middle band works because both halves hold at once: you cannot see what most of
these people are building, **and** you are not anonymous to them. Ghosting a project
still costs you something with people you will keep running into.

## 5. What this changes about the product

The primitives do not change — same repos, pitches, needs, comments, collaborator
flow. Who is in the room changes, and that has consequences:

> First bets shipped as M11 (see PLAN §5b, ADR-018): member profiles (item 2) and
> the helpWith→needs matcher (the personalised half of item 1). 3–6 remain open.

1. **Discovery inside the circle becomes the main surface.** At twenty members you can
   read everything; at two hundred you cannot. The M9 filters (needs, domain tags,
   new-this-week) graduate from decoration to primary navigation.
2. **Identity becomes load-bearing.** At twenty you know who posted. At two hundred,
   "who is this and what have they actually built" is a real question. Member profiles
   stop being optional.
3. **Accountability needs a surface.** The band only works if ghosting visibly costs
   something. A record of joined-and-shipped versus joined-and-vanished is what keeps
   it honest — and it is the same mechanic a public version would need.
4. **Joining cannot stay one-by-one.** Two hundred hand-made invites will not happen.
   This needs a durable community join link, gated by email domain or an admin
   approval queue.
5. **Moderation becomes a small but real job.** Not Reddit-scale, but non-zero:
   removing people, muting noise, handling repo spam.
6. **The feed problem inverts.** At twenty the risk is emptiness. At two hundred it is
   noise. Density, ranking-free ordering, and good defaults matter more than volume.

## 6. Explicitly not building

- Public or open-signup rooms
- Any ranking, leaderboard, score or star count (unchanged from PRD §3)
- A contribution marketplace with bounties or assigned tasks
- Our own chat

## 7. Deferred

Hosting and read cost at this scale. The current Firebase Spark setup is a dev-phase
choice, not a scaling decision — revisit before any real community launch.
