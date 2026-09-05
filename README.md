# RepoCircle

**See what your group is building. Ask to join in.**

RepoCircle is a private, invite-only space where a small developer group — a friend
circle, a college coding club, a hackathon cohort — registers their public GitHub
repositories and sees, at a glance, what the group is building, where the energy is,
and who needs help. A member posts an **ask** or flags they're **stuck**; someone
claims it; the app removes the friction of becoming a collaborator on GitHub.

No leaderboards. No rankings. No chat product. GitHub stays the source of truth;
Discord/Slack stay the conversation. RepoCircle is the group's shared window.

> **Status: planning complete — development starting.** The full build plan lives in
> [`docs/`](docs/). Nothing below this line is live yet.

## How it's built and hosted

| Layer | Choice | Cost |
|---|---|---|
| Frontend | Static PWA (Preact + TypeScript + Vite), installable on phone & laptop | — |
| Hosting | GitHub Pages (this repo) at `https://calmcodelabs.github.io/repocircle/` | $0 |
| Auth | Firebase Authentication (GitHub provider) | $0 (Spark) |
| Data | Cloud Firestore with strict per-group security rules | $0 (Spark) |
| GitHub data | Client-side polling of the GitHub REST API with the signed-in user's token (ETag-cached) | $0 |
| Chat | Discord incoming webhook per group (outbound notifications) | $0 |

There is **no server**. No machine to patch, no secret to leak from a backend, nothing
to pay for. The design, and every trade-off it implies, is documented in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Documentation map

| Doc | What's in it |
|---|---|
| [docs/PRD.md](docs/PRD.md) | The product requirements document (source of truth for scope) |
| [docs/PLAN.md](docs/PLAN.md) | **The master build plan** — milestones M0–M8, tasks, acceptance criteria, risks |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flows, GitHub API budget, PWA/offline strategy |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | Every Firestore collection, field, index and quota calculation |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, full draft security rules, token policy, XSS/CSP policy, rules test plan |
| [docs/UI.md](docs/UI.md) | Design system (dark, minimal, calm) and screen-by-screen Phase-1 spec |
| [docs/DECISIONS.md](docs/DECISIONS.md) | ADRs — why each technical decision was taken |
| [docs/SETUP.md](docs/SETUP.md) | One-time Firebase/GitHub console runbook + local dev guide |

## Development (once M0 lands)

```bash
npm install
npm run dev        # Vite dev server
npm run test       # unit + Firestore rules tests (emulator)
npm run build      # static build → dist/
```

Deploys happen automatically: push to `main` → GitHub Actions builds → GitHub Pages.

---

*A CalmCode Labs project. License: not yet decided (all rights reserved until then).*
