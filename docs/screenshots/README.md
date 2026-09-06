# RepoCircle — screenshot showcase

Captions and context for the product screenshots, keyed by filename. Drop the
images in this folder and lift the copy straight into the repo README or a
landing page.

**All data shown is fabricated for the demo.** Every person, repository, idea
and comment in these screenshots belongs to a fictional engineering community
called *Meridian Labs* — no real accounts, projects or conversations appear.

**The cast:** Noor Rahman (`n-rahman`, admin — the signed-in viewer), Mira
Tandon (`mira-t`, design + frontend), Devang Anand (`dev-anand`, ML), Sana
Qureshi (`s-qureshi`, backend), Arjun K V (`arjun-kv`, full-stack), Felix Weber
(`felix-w`, frontend, joined yesterday). Their projects: `pgmirror`,
`latency-lab`, `inferbench`, `tokensmith`, `flagpole`, `driftwatch`.

Capture settings: 1360 px CSS width at 2× device pixel ratio (so 2720 px wide
files), full page, dark theme — the app's only theme.

Two notes on the images. The signed-in viewer's avatar in the top-right corner
has been replaced with a neutral initial tile, because the capture ran through
a real GitHub account and no real person should appear in demo material. The
fictional members show GitHub's default avatar, since their handles have no
account behind them.

---

## 01-circle-home.png — The circle at a glance

**Route:** `#/g/:gid` · **Headline feature:** everything the app is for, on one screen.

> Six engineers, six repositories, and one page that answers "what is everyone
> building, and where could I help?" — without opening a single timeline.

Shows, top to bottom: **Wants what you're good at** — the matcher. Noor works
on backend and ML, so `driftwatch`, `inferbench` and `flagpole` surface, and so
do two *ideas* that have no code yet, marked with an `idea` chip. Then **New in
the circle** (Felix joined yesterday, introduced by what he brings rather than a
bare name), **Ideas brewing**, **New this week**, **Building together** (repos
where two members are collaborating), **Wants a hand**, **Active this week**
with real activity sparklines, an open stuck-flag, and **Recent discussion**
across every project — including a rendered `@n-rahman` mention chip.

It is a tall image (2720 × 6892). For a README hero, crop to the top third —
the header through the matcher — and use the other screenshots for the rest.

Talking point: nothing here is a leaderboard. There are no scores, no streaks,
no rankings anywhere in the product — by design.

## 02-personal-home.png — While you were away

**Route:** `#/` · **Headline feature:** your own loops, across every circle.

> Come back after a few days and see exactly what happened *to you* — replies,
> mentions, and people who raised a hand for your work.

The inbox is a visit-time digest, not a notification system: a reply from Felix
on the `pgmirror` cutover script and a raised hand from Mira, alongside the
repos you chose to watch, your own projects, and your open asks and claims.

## 03-repo-journey.png — A project's story, told from facts

**Route:** `#/g/:gid/repo/:id` (`tokensmith`) · **Headline feature:** the journey.

> Born as an idea by @arjun-kv → the idea became this repo → started by
> @mira-t → two people raised a hand → v0.2 shipped.

Every line is a stored fact, never a synthesised summary, and none of it is
aggregated into a score. Note the **"from an idea by @arjun-kv"** credit in the
header: Arjun pitched it, Mira built it, and the app remembers both.

Also visible: peer discussion on the code, the raised-hand row, and GitHub
activity pulled in automatically.

## 04-idea-germinated.png — An idea that became real

**Route:** `#/g/:gid/idea/idea-tokens` · **Headline feature:** germination.

> "It's real now — mira-t/tokensmith · built by @mira-t"

Arjun pitched *"Design tokens straight from the Figma file."* Mira said she
wanted to build it, and did. The idea keeps its original discussion and the
three people who backed it; it links forward to the repository, and the
repository links back. **Nothing is migrated or deleted** — the idea remains
the historical record of where the project came from.

The person who builds an idea does not have to be the person who had it. That
is the moment the product exists for.

## 05-idea-open.png — An idea still looking for its builder

**Route:** `#/g/:gid/idea/idea-oncall` · **Headline feature:** pitching without code.

> "On-call handovers that write themselves" — two people would build this.

An idea needs no repository to exist. It has a pitch, what kind of help it
wants, a discussion thread, and a one-tap **"I'd build this."** Ideas with a
declared need also appear in other members' matcher, so the right person finds
it without anyone having to broadcast.

## 06-ask-resolved.png — Asking, and crediting the answer

**Route:** `#/g/:gid/ask/ask-pool` · **Headline feature:** asks with credit.

> "Connection pool exhaustion under load — pgbouncer or app side?"
> **Resolved — @s-qureshi had the answer.**

Someone hit a wall, someone claimed it, and the resolution names who helped.
One fact on one ask — deliberately never counted, ranked or totalled into a
reputation score.

## 07-repos-grid.png — Everything the circle is building

**Route:** `#/g/:gid/repos` · **Headline feature:** the registry, plus ideas.

Repositories with their pitch, language, what help they want and live activity,
filterable by *needs help* and *new*. Above them sits **"Ideas — no code yet"**,
so work that hasn't started yet is visible in the same place as work that has.

## 08-member-profile.png — Who is this person?

**Route:** `#/g/:gid/m/:uid` (Mira) · **Headline feature:** identity that earns trust.

> Can help with **design, frontend** · learning **WebGPU** · works in
> **TypeScript**

In a community of a few hundred, a comment from a stranger means nothing
without context. A profile shows what someone offers (declared), what they are
learning (an invitation to pull them in), and what they actually work in —
**derived from the languages in their repositories, not self-reported.**
Group-scoped by design: no cross-community identity, no follower counts.

## 09-members.png — The circle

**Route:** `#/g/:gid/members` · **Headline feature:** people, with what they bring.

Every member with their availability and skills, so "who knows Rust and is free
this week" is answerable at a glance rather than by asking around.

## 10-ask-open.png — An open stuck flag

**Route:** `#/g/:gid/ask/ask-musl` · **Headline feature:** the claim loop.

> "Rust build fails on the musl target in CI, passes locally"

Anyone can claim it with a note. Claiming is a signal to the asker that help is
coming — not an assignment.

---

## Optional extras

| Filename | Route | Shows |
|---|---|---|
## 11-invite.png — The first thing an invited person sees

**Route:** `#/join/:gid/:token`, signed out · **Headline feature:** the invite.

> "You're invited to a circle. Sign in with GitHub to see who, and what they're
> building."

Invite links are private: the circle's contents stay hidden until the person
signs in. The card underneath is the app's own illustration of the core loop —
someone's repository, and a teammate joining in.

## 12-share-sheet.png — Two ways to put something in front of the circle

**Route:** any circle page → **+ Share** · **Headline feature:** the entry point.

> **An idea** — no repo yet; pitch it and see who'd build it with you.
> **An ask** — you need a hand with something you're building.

The distinction matters: an idea is looking for a builder, an ask is looking for
an answer. Both are first-class.

## 13-signin.png — Sign-in

**Route:** `#/`, signed out · **Headline feature:** the promise, up front.

GitHub sign-in, and the line that sets expectations: **reads public repos
only.** No private repository access is ever requested.
