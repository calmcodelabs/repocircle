<div align="center">

<img src="docs/screenshots/mark.svg" width="76" alt="">

# RepoCircle

**See what your circle is building. Ask to join in.**

A private space where a group of engineers shares what they're working on — and pulls each other in.

[Live app](https://calmcodelabs.github.io/repocircle/) · [How it works](#how-it-works) · [Documentation](#documentation) · [Run it yourself](#run-your-own)

[![ci](https://github.com/calmcodelabs/repocircle/actions/workflows/deploy.yml/badge.svg)](https://github.com/calmcodelabs/repocircle/actions/workflows/deploy.yml)
![tests](https://img.shields.io/badge/tests-117%20rules%20%2B%2080%20unit-3dd68c)
![license](https://img.shields.io/badge/license-MIT-6b7679)
![architecture](https://img.shields.io/badge/architecture-static%20PWA-6b7679)

</div>

<br>

![RepoCircle demo](docs/slides/repocircle-demo.gif)

<br>

## The problem

Everyone in a group is building something. Almost nobody knows what anyone else is building.

Work stays invisible until someone happens to mention it in a chat thread. Ideas stay in one person's head because pitching them feels like an interruption. And when someone *does* want help, the request goes out to a channel where it scrolls away in an hour.

RepoCircle is a small, shared window: your circle's repositories, the ideas that haven't become repositories yet, and a one-tap path from *"that looks interesting"* to *"I'm working on it with you."*

**There are no leaderboards, no streaks, and no counts of who contributed most.** Not as an oversight — as a rule. Nothing in the product ranks one member against another.

## What it does

### Work finds the person who can help

<img src="docs/slides/crops/matcher.png" width="620" align="right" alt="Wants what you're good at">

Say once what you can help with — frontend, backend, ML, design, or just review. Repositories and ideas that asked for exactly that appear on your home page.

No broadcasting into a channel, no volunteering blindly. The people who declared a need and the people who can meet it find each other.

<br clear="right">

### Ideas count, before there is any code

<img src="docs/slides/crops/idea-open.png" width="620" align="left" alt="An open idea">

An idea doesn't need a repository to exist here. Give it a sentence and say what kind of help it wants, and the circle can discuss it, refine it, and raise a hand to build it.

When it becomes real, **germination** links the idea to the repository it became — and the repository credits whoever had the idea. The person who builds something doesn't have to be the person who thought of it.

<br clear="left">

### Every project remembers how it started

<img src="docs/slides/crops/journey.png" width="620" align="right" alt="The journey of a repository">

Born as an idea, taken up, joined, released. Assembled entirely from facts the app already stores — never scored, never aggregated into a ranking.

<br clear="right">

### Ask for help, and credit the answer

<img src="docs/slides/crops/ask-resolved.png" width="620" align="left" alt="A resolved ask">

Post what you're stuck on. Someone claims it. When it's resolved, the ask records who had the answer — one fact on one page, never a tally.

<br clear="left">

### And the rest

| | |
|---|---|
| **Live activity** | Public repository activity is polled client-side and drawn as sparklines — no webhooks to configure |
| **People, not usernames** | Each member shows what they can help with, what they're learning, and the languages they actually work in, derived from their repositories |
| **While you were away** | Replies, mentions and raised hands gathered when you visit — not pushed at you all day |
| **Collaborator requests** | One tap opens a real GitHub issue and, on acceptance, a real collaborator invitation |
| **Discord** | Optional outbound webhook so the circle's chat stays where it already is |
| **Installable** | A PWA that works on a phone and a laptop, with an offline app shell |

## How it works

RepoCircle is a static single-page app with no backend of its own.

```
Browser (Preact + TypeScript)
   ├── Firebase Auth ......... GitHub sign-in
   ├── Cloud Firestore ....... all data, behind per-circle security rules
   └── GitHub REST API ....... polled client-side with the signed-in user's token
```

**Only public repositories are ever read.** The app requests no private-repository scope, and the GitHub token is held in memory and `sessionStorage` — never written to the database.

Circles are private: every read and write is gated on membership, enforced in [`firestore.rules`](firestore.rules) and covered by an emulator test suite in CI.

Design decisions and their trade-offs are recorded as ADRs in [docs/DECISIONS.md](docs/DECISIONS.md).

## Run your own

```bash
git clone https://github.com/calmcodelabs/repocircle
cd repocircle
npm install
npm run dev          # Vite dev server
```

To point it at your own Firebase project, follow [docs/SETUP.md](docs/SETUP.md) — a GitHub OAuth app, a Firebase project, and one config file. Then:

```bash
npm run test         # unit tests
npm run test:rules   # security rules against the Firestore emulator (needs Java)
npm run deploy:rules # publish rules + indexes
npm run build        # static build → dist/
```

Pushing to `main` builds and deploys to GitHub Pages automatically.

## Documentation

| Document | What's in it |
|---|---|
| [POSITIONING.md](docs/POSITIONING.md) | Who this is for, who it isn't, and the reasoning |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, the polling engine, PWA strategy |
| [SECURITY.md](docs/SECURITY.md) | Threat model, token policy, CSP and XSS stance |
| [DATA-MODEL.md](docs/DATA-MODEL.md) | Every collection, field and index |
| [DECISIONS.md](docs/DECISIONS.md) | ADRs — why each decision was made, and what it cost |
| [REVIEW.md](docs/REVIEW.md) | Failure classes this codebase has hit, and the sweep run against every change |
| [PLAN.md](docs/PLAN.md) | Milestones, acceptance criteria, risk register |
| [UI.md](docs/UI.md) | The design system |
| [SETUP.md](docs/SETUP.md) | First-time Firebase and GitHub setup |

## License

[MIT](LICENSE) — use it, fork it, run your own circle.

## Status

In active development and deployed. Phase 1 is complete, plus profiles and skill matching, discussion, the idea lifecycle, and the collaboration history. The failure-class review in [REVIEW.md](docs/REVIEW.md) is run against every change.

Screenshots and the demo video use a fabricated community — no real accounts or projects appear in them. See [docs/screenshots/README.md](docs/screenshots/README.md).
