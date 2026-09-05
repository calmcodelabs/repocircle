<!-- Converted from Group-Repo-Hub-PRD.docx (v1.0, September 2026). Source of truth for product scope. Do not edit product content here without a product decision. -->

Product Requirements Document

Group Repo Hub

A collaboration space for small developer groups built on public GitHub repositories

Version 1.0  ·  September 2026  ·  Status: Draft for engineering review

Working title only. Product name to be decided.

Purpose of this document. This PRD captures the full product concept, the design principles that constrain it, the information architecture, a prioritised feature specification, core workflows, a proposed data model, GitHub integration details, and a phased delivery plan. It is written for the engineer who will build the first version and is intended to be sufficient to start work without further product input on Phase 1.

## Contents

## 1. Executive summary

Group Repo Hub is a private, invite-only space where a small group of developers — a friend circle, a college coding club, a hackathon cohort — can register their public GitHub repositories and see, at a glance, what the group is building, where the activity is, and who needs help. Its core loop is simple: a member posts an "ask" or flags that they are stuck, another member claims it, and the app removes friction from becoming a collaborator on GitHub.

The product deliberately avoids the social-network and chat-product traps that have sunk similar attempts. It does not build its own chat; it integrates with Discord and Slack. It does not rank, score, or judge members; every signal in the app is framed at the group level and oriented toward helping, not competing. It presents a very small surface on first use and reveals depth progressively.

Primary users: college students and early-career developers working in groups of roughly 5 to 50 people.

Primary value: "See what your group is building. Ask to join in."

Phase 1 scope: GitHub sign-in, groups, repo registry, an unranked activity view, asks and stuck-flags, collaborator requests, a GitHub-webhook activity feed, and a Discord/Slack bot. Everything else is layered on after weekly retention has been observed with one or two real groups.

## 2. Background and market context

Research into existing tools found that every component of this product exists somewhere, but nothing combines them for a bounded friend group:

- GitHub Organizations — solve membership, permissions and collaborator invitations. We will not rebuild these; we will drive them through the API.
- Discord / Slack with the official GitHub app — solve chat and commit/PR notifications. We will integrate, not compete.
- Open-source contributor leaderboards — (ohcnetwork/leaderboard, RocketChat Opensource-Contribution-Leaderboard, github-dashing) track contributors for one organisation but are ranking-oriented and lack any "ask for help" workflow.
- daily.dev Squads — provide developer communities, but discussion is anchored to articles, not repositories.
- Hackathon team finders — (HackBud, DevMatchups, Devpost team finder) match people by skill for events but have no ongoing project awareness.
- Previous "dev social network" attempts — (Flashcoll, Driwwwle) tried to combine showcase, chat and social features. Both stalled — a signal that the generic social layer is not where value lives.
The open gap is: repository-anchored, group-scoped, help-oriented, with GitHub as the system of record and existing chat tools as the communication layer.

## 3. Product principles

These principles are constraints on every feature decision. Where a feature idea conflicts with a principle, the principle wins.

- Collaboration, not competition. No leaderboards, rankings, points, badges, levels, scores, judging or voting anywhere in the product. Activity is shown as a signal ("where is the energy"), never as a standing ("who is winning"). Metrics are group-level.
- GitHub is the source of truth. Repositories, commits, PRs, issues and collaborator status live on GitHub. The app reads from and writes to GitHub; it never duplicates state it can derive.
- Integrate chat, do not build it. Real-time chat is delivered via Discord/Slack integration. In-app discussion is limited to threaded, asynchronous comments scoped to a repository or an ask.
- Two disclosure layers, then settings. Home must feel complete on its own. Every other feature is one tap away or lives in settings. No feature is more than two levels deep.
- First success in under a minute. No product tour. Sign in with GitHub, join a group, and the feed is already populated.
- Respect student time. Notifications are quiet by default. Availability status ("on exams") is a first-class concept.
- Helping others is the behaviour we make visible. Asks answered, PRs reviewed, repos shipped together — these get surface area. Solo commit volume does not.

## 4. Target users and scenarios

### 4.1 Personas

| Persona | Context | What they need from the app |
|---|---|---|
| Club member (student) | Second/third-year CS student in a college coding club of 20–40 people. Has 2–3 half-finished repos. | See what peers are building, find someone to help with a blocker, get help without feeling judged. |
| Club lead | Senior student or faculty adviser running the club. | Know which projects are alive, which members are stuck, and show the club's work publicly for recruitment. |
| Friend group builder | Working developer sharing side projects with 5–10 friends. | Lightweight awareness and easy "can I join this?" without setting up an org. |
| Hackathon cohort | Temporary team of 3–5 for a 48-hour event. | Sub-team space, sprint goals, demo-day feedback, then archive. |
| Mentor / alumnus | Ex-member who still wants to help occasionally. | Read-only visibility plus pings only when an ask sits unanswered. |

### 4.2 Key scenarios

- Scenario A — I am stuck — Priya hits a Docker networking bug at 11pm. She flags "stuck" on her repo with one line. The flag appears on Home and in the group Discord. Rahul, who listed Docker under "can help with", claims it and attaches a Live Share link. Flag clears when Priya marks it resolved.
- Scenario B — I want to join — Arjun sees an active repo on Home, taps "Request to collaborate", writes a one-line note. The app opens a GitHub issue on the repo and DMs the owner. Owner taps Accept; the app sends the collaborator invitation via the GitHub API.
- Scenario C — Club demo day — Lead creates a Demo Day event. Presenters rotate, each gets a timer, and members leave structured feedback (what I liked / what I would try). No scores.
- Scenario D — Newcomer — A first-year joins via invite link. Home shows three things. A five-item checklist unlocks Members, Reviews and Events as she completes it. Repo owners have marked "first contribution" issues she can see.

## 5. Information architecture

The app follows progressive disclosure with a hard limit of two layers plus settings. Usability research consistently finds that disclosure deeper than two levels causes navigation confusion, and that front-loaded feature tours are skipped. The structure below should be treated as a constraint, not a suggestion.

### 5.1 Layer 0 — First run

- One sentence of value, one action: Sign in with GitHub.
- Create group or join via invite link.
- Public repos are imported automatically; the activity view is pre-populated from GitHub data so Home is never empty on first load.
- A 4–5 item onboarding checklist replaces any tour. Each completed item unlocks one Layer 2 area.
- Empty states are instructional ("No asks yet — post the first one"), never blank.

### 5.2 Layer 1 — Home

Exactly three content blocks and one primary action. This screen is the whole product for most users most of the time.

- Active this week — unordered set of repos with an activity spark. Not a numbered list.
- Open asks and stuck flags — what needs help right now.
- Your activity — your repos, asks you posted, asks you claimed.
- Primary action — "Post an ask" (secondary: "Add repo").

### 5.3 Layer 2 — Modules (one tap from Home)

| Module | Purpose | Unlocked by |
|---|---|---|
| Members | Who is in the group, what they can help with, availability, office hours, teammate finder | Checklist: follow a member |
| Repos | Full repo registry with cards, resources, setup notes, threads, first-contribution paths | Always visible |
| Reviews | Group-wide PR queue, review requests, repo health | Checklist: review or answer an ask |
| Events | Calendar, sprints, sub-teams, demo days, retros, walkthroughs | Checklist: connect calendar or join an event |
| Group | Shipped-this-week, shipped-together, spotlight, dependency map, snippet library, public page | Checklist: add a repo |

### 5.4 Layer 3 — Settings, integrations, admin

Everything that configures rather than does: Discord/Slack, GitLab, notification granularity, roles, sub-team management, moderation, archiving, analytics for leads. Admin items render only for admins.

### 5.5 Discovery mechanics

- Contextual nudges triggered by behaviour: after a member's third PR review, surface the Reviews tab; when two repos go stale, offer the archive tool.
- Command palette (Ctrl/Cmd-K) to reach any feature without cluttering navigation.
- In-app "What's new" changelog instead of upfront feature announcements.
- Placement test for any new feature: does it belong on Home? If not, which Layer 2 module, or is it a setting? If the answer cannot be given in one sentence, the feature is cut.

## 6. Feature specification

Priorities: P0 = Phase 1 launch; P1 = Phase 2, after retention is observed; P2 = Phase 3 and later; P3 = backlog. IDs are stable and should be used in tickets.

### 6.1 Foundation and Home (Layer 0–1)

| ID | Feature | Description / behaviour | Priority |
|---|---|---|---|
| F-01 | GitHub OAuth sign-in | Sign in with GitHub. Minimum scopes: read:user, user:email, public_repo. Additional scopes (repo invitations, issue creation) requested contextually when first needed. | P0 |
| F-02 | Groups | Create a group; join via invite link. A user may belong to multiple groups. Group is the tenancy boundary for all data. | P0 |
| F-03 | Invite links with roles | Admin / member / guest-viewer. Links expire and can be revoked. | P0 |
| F-04 | Repo registry | Members register any public repo they own or contribute to. Auto-import of the member's own public repos on first sign-in with opt-out. | P0 |
| F-05 | Active this week | Unordered set of repos with activity in the last 7 days, each with a small sparkline. Computed from commits, PRs, issues. Explicitly not sorted by score; default order is most-recent-event. | P0 |
| F-06 | Asks | A help-wanted post attached to a repo or free-standing. Fields: title, one-line detail, tags (frontend, ML, docs, testing, devops, design, custom), optional link. States: open, claimed, resolved. | P0 |
| F-07 | Stuck flags | A lightweight variant of an ask: one line, attached to a repo or issue, stays on Home until claimed or cleared by the owner. | P0 |
| F-08 | Claim an ask | Any member can claim. Claim notifies the poster and posts to the linked chat channel. Multiple claimers allowed. | P0 |
| F-09 | Collaborator request | Button on any repo. Writes a short note, opens a GitHub issue on the repo (labelled collab-request), notifies owner. Owner accepts in-app; app calls the GitHub collaborators API to send the invitation. | P0 |
| F-10 | Project status | Per repo: idea / building / paused / done. Set by owner; "paused" and "done" repos drop out of Active this week. | P0 |
| F-11 | Your activity | Own repos, asks posted, asks claimed, pending collaborator requests. | P0 |
| F-12 | Onboarding checklist | Add a repo, follow a member, post or answer an ask, connect Discord/Slack, set availability. Each item unlocks a module. | P0 |
| F-13 | Instructional empty states | Every empty list has a one-line instruction and, where applicable, an action. | P0 |
| F-14 | Member ↔ repo map | Visual or tabular view of which members contribute to which repos, derived from GitHub contributor data plus in-app claims. | P1 |

### 6.2 Members module

| ID | Feature | Description / behaviour | Priority |
|---|---|---|---|
| M-01 | Tech-stack profile | Languages and frameworks inferred from the member's GitHub language statistics. Display only; no ranking. | P1 |
| M-02 | Can help with / learning | Self-described free-text tags. No automatic skill levels. | P1 |
| M-03 | Availability status | Heads down / free to help / on exams / custom, with optional end date. Shown next to name everywhere. | P1 |
| M-04 | Office hours | Recurring slots a member offers ("Tue 8pm, Docker/DevOps"). Others book; booking creates a calendar event. | P1 |
| M-05 | Find a teammate | Filter members by help-with tags, languages, availability. | P1 |
| M-06 | Pair-up suggestions | Non-AI rule: if member A lists X under "learning" and repo R has an open ask tagged X, suggest R to A. | P2 |
| M-07 | Newcomer buddy | Opt-in on both sides; pairs a new member with an existing one for the first week. | P2 |
| M-08 | Mentor role | Role that receives a ping only when an ask has been unanswered for 24 hours. | P2 |
| M-09 | Alumni mode | Read-only membership that remains visible in the member list. | P2 |
| M-10 | whois lookup | "Who knows Rust?" search over help-with tags and language stats. Also exposed as a chat slash command. | P1 |

### 6.3 Repos module

| ID | Feature | Description / behaviour | Priority |
|---|---|---|---|
| R-01 | Repo cards | Name, description, status, owner, contributors, demo link, screenshots, last activity. | P0 |
| R-02 | Resource board | Links per repo: design docs, Figma, deployed URL, references. | P1 |
| R-03 | Setup checklist | Editable per-repo doc: env vars, run commands, common gotchas. Shown prominently to new collaborators. | P1 |
| R-04 | Decision log | Short dated entries: "why we chose X". Append-only. | P2 |
| R-05 | Weekly plan post | "This week I am doing X" per repo. Collected into the weekly digest. | P1 |
| R-06 | How I built this | Long-form writeup attached to a repo. Markdown. | P2 |
| R-07 | First-contribution path | Owner marks 2–3 issues as first-contribution and attaches a setup guide. Visible in a newcomer-only view. | P1 |
| R-08 | Good-first-issue aggregation | Pulls issues labelled good-first-issue or help-wanted across all group repos. | P1 |
| R-09 | Threads | Threaded asynchronous discussion per repo and per ask. Markdown, code blocks, embeds. This is the only in-app "chat" surface. | P1 |
| R-10 | Q&A with accepted answer | Thread type where the poster can mark one reply as the answer. | P2 |
| R-11 | Cross-repo issue linking | Link an issue to another group repo; optional one-click mirror creates a corresponding issue there. | P2 |
| R-12 | Fork lineage | Shows forks within the group as a tree. | P2 |
| R-13 | Fork-and-adopt | A paused repo can be adopted by another member with the owner's approval; ownership in-app transfers, GitHub transfer is initiated by the owner. | P2 |
| R-14 | Handoff notes | Template a departing contributor fills in: state, next steps, known issues. | P2 |
| R-15 | Demo health ping | Periodic HTTP check on the demo URL; card shows up/down. | P2 |
| R-16 | Live pairing links | Attach VS Code Live Share / Codespaces / Gitpod link to an ask or stuck flag. | P1 |
| R-17 | Explainer requests | "Walk me through this file" request with a video reply attached (external hosting link; no in-app video storage in v1). | P3 |

### 6.4 Reviews module

| ID | Feature | Description / behaviour | Priority |
|---|---|---|---|
| V-01 | PR review queue | All open PRs across group repos, sorted by age, with reviewer status pulled from GitHub. | P1 |
| V-02 | Review request pings | Request a review from the group; optionally suggest members who have touched the same paths (from commit history). | P1 |
| V-03 | Reviewer buddy | Voluntary pairing so every PR from a newer member gets a second pair of eyes. No hierarchy or levels. | P2 |
| V-04 | 24-hour nudge | Group-level banner: "3 asks and 2 PRs have waited more than a day." Never attributed to an individual. | P1 |
| V-05 | Repo health card | README present, licence, CI status, last release, open issue count. Informational, not scored. | P1 |

### 6.5 Events module

| ID | Feature | Description / behaviour | Priority |
|---|---|---|---|
| E-01 | Group calendar | Demo days, sprints, meetups, hackathon deadlines. iCal feed per group. | P1 |
| E-02 | Sprint tracker | Two-week window; repos opt in with a goal; progress shown as done/not done against stated goals. | P2 |
| E-03 | Sub-teams | Named subsets of a group (batches, tracks, hackathon squads) with their own Home filter and channel. | P1 |
| E-04 | Team profiles | A sub-team can have a page: members, repos, current goal. | P2 |
| E-05 | Demo day mode | Rotating presenter list, per-presenter timer, structured feedback form (what I liked / what I would try). No numeric fields. | P2 |
| E-06 | Mentor rooms | Assign a mentor to a sub-team; a dedicated thread for Q&A. | P3 |
| E-07 | Submission template | Standard project submission: demo link, video, stack, team, README excerpt. Used for demo days and hackathons. | P2 |
| E-08 | Retro threads | Post-sprint or post-event thread with prompts: what worked, what to change. | P2 |
| E-09 | Code walkthroughs | Scheduled session where an owner narrates a repo; recording link pinned to the repo. | P3 |
| E-10 | Pairing board | "Free this weekend, want to pair on X" posts with a time window. | P2 |
| E-11 | Calendar sync | Google / Outlook two-way sync for events and booked office hours. | P2 |

### 6.6 Group module

| ID | Feature | Description / behaviour | Priority |
|---|---|---|---|
| G-01 | Public group page | Opt-in, read-only page listing the group, active repos and shipped items. Intended for club recruitment and placements. | P1 |
| G-02 | Shipped this week | Releases, merged PRs and deploy tags across all repos, as a feed. | P1 |
| G-03 | Shipped together | Highlights repos where two or more members contributed in the period. Collaboration is what gets visibility. | P1 |
| G-04 | Rotating spotlight | One repo pinned per week, round-robin across all non-archived repos. Not activity-based. | P2 |
| G-05 | Unblocked counter | Asks resolved this week, group-wide. The metric is help given. | P1 |
| G-06 | Group heatmap | Contribution heatmap for the whole group. No per-member heatmaps or streaks. | P2 |
| G-07 | Group changelog | One feed of releases across all repos. | P2 |
| G-08 | Shared-dependency map | Parses manifests (package.json, requirements.txt, pyproject, go.mod, Cargo.toml) to show "4 repos use FastAPI". Surfaces natural helpers. | P2 |
| G-09 | Snippet library | Curated reusable pieces: auth boilerplate, CI configs, Dockerfiles. Markdown with code blocks; link to source repo. | P2 |
| G-10 | Weekly digest | Email and chat post: active repos, new members, open asks, weekly plans. Per-user opt-out. | P1 |
| G-11 | Kudos | A thank-you attached to a specific PR, answer or claim. Visible on that item only; never aggregated or counted on profiles. | P1 |
| G-12 | Portfolio card | Per-member card: repos, collaborations, asks answered. Exportable as image or text. | P2 |
| G-13 | Resume export | Generates LinkedIn/resume bullet text from group activity. | P3 |

### 6.7 Integrations (Layer 3)

| ID | Feature | Description / behaviour | Priority |
|---|---|---|---|
| I-01 | GitHub webhooks | Per registered repo: push, pull_request, issues, release, create. Drives the activity feed and Active this week. | P0 |
| I-02 | Discord bot | Posts asks, stuck flags, collaborator requests and shipped items to a configured channel. Slash commands: /active, /asks, /whois <tech>. | P0 |
| I-03 | Slack app | Same as Discord bot. | P1 |
| I-04 | GitLab | OAuth and API equivalents for registry, activity and collaborator flow. Many colleges use GitLab. | P2 |
| I-05 | Devfolio / Unstop import | Import hackathon events and team rosters. | P3 |
| I-06 | iCal feeds | Read-only calendar subscription per group. | P1 |

### 6.8 Notifications

| ID | Feature | Description / behaviour | Priority |
|---|---|---|---|
| N-01 | Follow | Follow specific repos or members in addition to group-wide events. | P1 |
| N-02 | Granularity | Per event type: instant / daily / weekly / off. | P1 |
| N-03 | Push (PWA) | Web push for asks, stuck flags and collaborator requests only. Everything else is digest. | P2 |
| N-04 | Mobile quick-actions | Claim an ask, set availability, send kudos in three taps or fewer. | P2 |

### 6.9 Group management and admin

| ID | Feature | Description / behaviour | Priority |
|---|---|---|---|
| A-01 | Roles | Admin / member / guest-viewer / mentor / alumnus. | P0 |
| A-02 | Group templates | Preset tags, rules and channel mapping for clubs and hackathons. | P2 |
| A-03 | Trust levels | Automatic: new members gain posting and light moderation rights through participation (days active, asks answered). No visible level label. | P3 |
| A-04 | Moderation | Report, hide, remove member. Admin audit log. | P1 |
| A-05 | Inactivity archive | Repos with no commits for 90 days are proposed for archive; owner confirms. | P2 |
| A-06 | Lead analytics | Group-level only: active members, repos started vs finished, asks resolved, cohort retention. No per-member rankings. | P2 |
| A-07 | Custom ask tags | Admin-defined tag set per group. | P1 |

### 6.10 Deferred

- AI-generated plain-language weekly summaries of repo changes.
- Cross-group discovery (club A finds club B's projects).
- Full real-time in-app chat — only if users request it after the Discord/Slack integration is live.

### 6.11 Explicitly out of scope

The following were considered and rejected because they conflict with the collaboration principle. They must not be reintroduced without a product decision:

- Leaderboards, rankings, "top contributor" or "most helpful" awards
- Points, XP, badges, levels, or automatic skill placement
- Judging, scoring, community voting
- Personal streaks or per-member heatmaps
- Aggregated kudos counts on profiles
- Any ordered "top N" presentation of repos or members

## 7. Core workflows

### 7.1 Sign-in and first run

- User taps "Sign in with GitHub"; OAuth with minimal scopes.
- App fetches profile and public repos; creates User record; caches repo list.
- If arriving via invite link: validate link, create Membership with the link's role, land on Home. Otherwise: create-group screen (name, optional description), then Home.
- Background job fetches the last 30 days of events for registered repos so Active this week is populated before the user scrolls.
- Checklist card is shown at the top of Home until complete or dismissed.

### 7.2 Post and claim an ask

- Member taps "Post an ask"; chooses repo (optional), enters title, one-line detail, tags, optional pairing link.
- Ask is created (state: open), appears on Home and in the linked Discord/Slack channel.
- Another member taps Claim; state becomes claimed; poster notified; chat thread updated.
- Poster marks resolved; Unblocked counter increments; optional kudos prompt for the claimer.
- If unclaimed for 24 hours, the group-level nudge banner includes it and mentors (if any) are pinged once.

### 7.3 Collaborator request

- Member taps "Request to collaborate" on a repo card; writes a note.
- App creates a GitHub issue on the repo titled "Collaboration request from @user" with the note, labelled collab-request (label created if missing). Requires public_repo scope from the requester.
- Owner is notified in-app and via chat. Owner taps Accept or Decline.
- On Accept, app calls PUT /repos/{owner}/{repo}/collaborators/{username} using the owner's token (requires the owner to have granted repo scope; prompt contextually if missing). Issue is closed with a comment.
- On Decline, issue is closed with a polite templated comment. Requester is notified.

### 7.4 Activity ingestion

- On repo registration, app installs a webhook (or, if the registering user lacks admin rights on the repo, falls back to polling via the Events API every 15 minutes).
- Webhook events are validated (HMAC), deduplicated by delivery ID, and written to an activity_events table.
- A scheduled job (hourly) recomputes per-repo 7-day activity and the sparkline series.
- Active this week is a query over the last 7 days, filtered by project status, ordered by most recent event.

## 8. Data model

Proposed core entities. Field lists are indicative; the engineer should finalise them.

| Entity | Key fields | Notes |
|---|---|---|
| User | id, github_id, login, name, avatar_url, email, oauth_token (encrypted), scopes, created_at | One per GitHub account. |
| Group | id, name, slug, description, visibility (private/public_page), settings JSON, created_by | Tenancy boundary. |
| Membership | user_id, group_id, role, availability_status, availability_until, help_with[], learning[], joined_at | Composite key (user_id, group_id). |
| InviteLink | id, group_id, role, token, expires_at, revoked, created_by |  |
| SubTeam | id, group_id, name, description | Members via SubTeamMembership. |
| Repo | id, group_id, github_repo_id, full_name, owner_user_id, status, demo_url, description, registered_by, webhook_id, archived | One row per (group, repo). Same GitHub repo may appear in multiple groups. |
| RepoResource | id, repo_id, kind (link/setup/decision/writeup), title, body_md, url, created_by | Covers R-02, R-03, R-04, R-06. |
| Ask | id, group_id, repo_id (nullable), author_id, kind (ask/stuck), title, detail, tags[], pairing_url, state, resolved_at |  |
| AskClaim | ask_id, user_id, claimed_at |  |
| CollabRequest | id, repo_id, requester_id, note, github_issue_number, state (pending/accepted/declined), decided_by, decided_at |  |
| Thread / Post | thread: id, group_id, subject_type (repo/ask/event), subject_id, title. post: id, thread_id, author_id, body_md, parent_post_id, accepted_answer | Covers R-09, R-10, E-08. |
| ActivityEvent | id, repo_id, github_delivery_id, type, actor_login, payload JSON, occurred_at | Append-only. Index on (repo_id, occurred_at). |
| RepoActivityDaily | repo_id, date, commits, prs_opened, prs_merged, issues, releases | Materialised for sparklines. |
| Event | id, group_id, sub_team_id, type (demo/sprint/meetup/office_hours/deadline), title, starts_at, ends_at, recurrence, created_by |  |
| OfficeHourSlot / Booking | slot: id, host_user_id, group_id, recurrence, topic. booking: slot_id, occurrence_at, booked_by |  |
| Kudos | id, group_id, from_user_id, to_user_id, subject_type, subject_id, message, created_at | Never aggregated in any query surfaced to users. |
| Integration | id, group_id, kind (discord/slack), config JSON (channel ids, webhook url), created_by |  |
| NotificationPref | user_id, group_id, event_type, mode (instant/daily/weekly/off) |  |
| Follow | user_id, subject_type (repo/user), subject_id |  |
| AuditLog | id, group_id, actor_id, action, subject, created_at | Moderation and admin actions. |

## 9. GitHub integration details

### 9.1 Authentication and scopes

- Use a GitHub OAuth App for sign-in. Consider a GitHub App for webhooks and installation-level tokens in Phase 2; it avoids per-user webhook limits and gives cleaner permission prompts.
- Initial scopes: read:user, user:email, public_repo. Request repo (or the GitHub App equivalent) only when a user first needs to accept a collaborator request on a repo they own.
- Store tokens encrypted at rest. Never log tokens. Support token revocation.

### 9.2 Data sources

| Need | Source | Notes |
|---|---|---|
| User profile, repo list | REST /user, /user/repos | Cache 1 hour. |
| Language stats | GraphQL repository.languages | Batch per user nightly. |
| Commits, PRs, issues, releases | Webhooks (primary); REST /repos/{r}/events (fallback polling) | Events API is limited to 90 days and 300 events; sufficient for a 7-day window. |
| Contributor list | REST /repos/{r}/contributors | Drives member ↔ repo map. Refresh daily. |
| Collaborator invite | PUT /repos/{r}/collaborators/{u} | Owner token. Returns 201 with invitation. |
| Issue creation | POST /repos/{r}/issues | Requester token, public_repo scope. |
| Good-first-issues | GraphQL search or REST issues?labels= | Daily. |
| Dependency manifests | REST contents API for known manifest paths | Parse server-side; weekly. |

### 9.3 Rate limits and caching

- Authenticated REST: 5,000 requests/hour per user token. GraphQL: 5,000 points/hour. A group of 40 members with 100 repos is well within limits if polling is limited to repos without webhooks.
- Use conditional requests (ETag / If-None-Match) for all polling; 304 responses do not count against the limit.
- Cache all read-through data in the database; the UI must never call GitHub synchronously on page load.

### 9.4 Webhook handling

- Verify X-Hub-Signature-256 on every delivery.
- Deduplicate on X-GitHub-Delivery.
- Enqueue and return 200 within 10 seconds; process asynchronously.
- Handle repo rename, transfer and deletion events by updating or archiving the Repo record.

## 10. Chat integration

### 10.1 Discord (P0)

- Bot with a single slash-command group. Group admin connects via OAuth and picks a channel.
- Outbound: asks, stuck flags, claims, collaborator requests and decisions, shipped items, weekly digest. Each post links back to the item in-app.
- Inbound slash commands: /active (repos active this week), /asks (open asks), /whois <tech> (members whose help-with or languages match).
- Optional: thread-per-ask in Discord, mirrored to the in-app thread (Phase 2).

### 10.2 Slack (P1)

- Feature parity with Discord via a Slack app with incoming webhooks and slash commands.

### 10.3 In-app threads

- Asynchronous, threaded, Markdown with syntax-highlighted code blocks and link embeds. No presence, no typing indicators, no real-time transport beyond simple polling or SSE for new posts. This is a deliberate ceiling.

## 11. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Home renders in under 1.5 s on a mid-range Android device over 4G. All GitHub data is served from cache. |
| Availability | Single-region deployment is acceptable for Phase 1. Webhook receiver must be independently scalable from the web app. |
| Security | Tokens encrypted at rest; HMAC-verified webhooks; per-group authorisation on every query; rate limiting on public endpoints; CSRF protection. |
| Privacy | Only public repository data is read in Phase 1. The public group page is opt-in and shows only repos whose owners opted in. Members can leave a group and have their in-app content anonymised. |
| Accessibility | Keyboard navigable; WCAG AA contrast; command palette exposes all navigation. |
| Mobile | Responsive PWA. Home, asks, claim and availability must work well on a phone; Layer 2 modules may be tablet/desktop-first initially. |
| Observability | Structured logs, error tracking, webhook delivery metrics, GitHub rate-limit headroom alerts. |
| Data retention | ActivityEvent rows older than 180 days may be rolled up into RepoActivityDaily and deleted. |

## 12. Suggested technical approach

The engineer has final say on stack. The following is offered as a reasonable default for a small team optimising for speed and low operating cost.

- Web app — Next.js (App Router) or SvelteKit, TypeScript, Tailwind. Server-rendered Home for fast first paint; PWA manifest and service worker for push.
- API and jobs — Same codebase with route handlers, plus a separate worker process for webhook processing and scheduled jobs (BullMQ on Redis, or a hosted queue).
- Database — PostgreSQL. Row-level tenancy by group_id enforced in the data layer.
- Auth — NextAuth/Auth.js with the GitHub provider, or a hand-rolled OAuth flow; store scopes per user.
- Hosting — Any managed platform with a persistent worker (Railway, Fly.io, Render) and a managed Postgres. Keep the webhook endpoint on a stable public URL from day one.
- Chat — discord.js for the bot; Slack Bolt for Slack.
- Manifest parsing — Small server-side parsers for package.json, requirements.txt / pyproject.toml, go.mod, Cargo.toml; extend as needed.

## 13. Delivery plan

| Phase | Scope | Exit criterion |
|---|---|---|
| Phase 1 — Core loop | F-01 to F-13, R-01, I-01, I-02, A-01. Deploy to one or two real groups. | Members return weekly without prompting. Asks are being posted and claimed. |
| Phase 2 — Depth | Members module (M-01 to M-05, M-10), Reviews (V-01, V-02, V-04, V-05), Repos (R-02, R-03, R-05, R-07, R-08, R-09, R-16), Group (G-01, G-02, G-03, G-05, G-10, G-11), Events (E-01, E-03), Slack, notifications N-01/N-02, A-04, A-07. | Two or more Layer 2 modules used weekly by more than half of active members. |
| Phase 3 — Community | Remaining P2 items: sprints, demo day, sub-team profiles, dependency map, snippet library, spotlight, heatmap, GitLab, calendar sync, archive, lead analytics, push. | Groups run an event end-to-end in the app. |
| Phase 4 — Backlog | P3 items and deferred: mentor rooms, walkthroughs, explainers, trust levels, resume export, imports, AI summaries, cross-group discovery. | Driven by user requests. |

Phase 1 effort estimate: roughly 3–5 weeks for one experienced full-stack engineer, assuming the stack above and no custom design system. The collaborator-request flow and webhook ingestion are the riskiest pieces and should be built first.

## 14. Success metrics

All metrics are group-level and non-comparative between members, consistent with the product principles.

- Weekly active members as a share of group size (target: above 50% after four weeks).
- Asks posted per week and share resolved within 48 hours.
- Collaborator requests sent and share accepted.
- Repos with two or more group contributors (the "shipped together" rate).
- Share of members who have set availability and help-with tags.
- Chat integration connected for the group (yes/no) and posts per week originating from the app.
Explicitly not tracked as product metrics: per-member commit counts, per-member rankings of any kind.

## 15. Open questions for the engineer

- OAuth App vs GitHub App for Phase 1 — trade off faster setup against cleaner webhook management.
- Fallback when a member registers a repo they do not administer (no webhook rights): polling only, or prompt the owner to join?
- Should a repo be allowed in multiple groups, and if so how are asks and threads scoped?
- Discord thread mirroring — worth doing in Phase 1 or hold for Phase 2?
- Whether to support GitHub Enterprise / self-hosted GitLab for college instances.
- Product name and domain.
End of document.

