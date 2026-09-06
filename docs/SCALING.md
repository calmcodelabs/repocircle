# RepoCircle — Scaling plan

What holds at 300 people, what breaks, and what to do about it. Written
2026-09-06 after a day of heavy use exhausted the Firestore free tier and took
the app down — the failure was real, and it is a design problem rather than an
accident.

**One-line summary:** hosting is fine and stays where it is; the database read
pattern is the thing that breaks, and it breaks on any per-operation billing.
Fix the reads before considering a platform change.

---

## 1. Where the cost actually lives

Two layers, two completely different cost curves.

| Layer | Billed on | Grows with | Verdict |
|---|---|---|---|
| GitHub Pages | bytes shipped | number of visits | **Comfortable — no action** |
| Cloud Firestore | document reads | visits **×** how much the circle has accumulated | **Breaks at target scale** |

That second multiplication is the whole problem. More members means more
documents on every page *and* more people loading pages.

### Hosting: measured, not assumed

A cold visit downloads **312 KB** (app 41 KB, Firebase SDK 137 KB, lazy chunk
29 KB, CSS 6 KB, Inter 97 KB — all gzipped). Repeat visits cost roughly nothing:
the service worker serves cached, content-hashed assets.

- Pages' soft bandwidth limit is **100 GB/month** ≈ **335,000 cold loads**
- 300 members loading cold five times a month ≈ **457 MB — 0.4% of the limit**

There is no scale argument for leaving GitHub Pages. Reasons to move are all
about capability, not capacity — see §5.

### Database: the read amplification — measured before and after

`GroupHome` used to mount **seven live listeners, three of which read entire
collections** (`repos`, `members`, `ideas`), and every group-scoped page paid
for the member list a second time to find one membership document.

| Circle | Reads per home visit — **before M16** | **after M16** |
|---|---|---|
| 20 members, ~30 repos | ~130 | ~125 |
| 100 members, ~300 repos | ~450 | ~130 |
| **200 members, ~600 repos** | **~900** | **~130** |
| 1,000 members, ~3,000 repos | ~4,000 | ~130 |

The number after M16 is the point, and it is not the size of the number: **the
cost stopped scaling with the circle.** Every read is now either one document
or a bounded query, so a circle can grow without the bill following it. That
also means the remaining ~130 is a fixed budget to spend down, rather than a
slope to outrun.

Where it goes for a fully-unlocked member: open asks 25, recent discussion 12,
your activity 12, accepted collaborations 12, the five repo blocks 34, recent
members 8, ideas 10, the unblocked count up to 50 (throttled to once a minute
per tab), and 3 for the group, membership and summary documents.

**M16.5 is what spends it down.** Most of those blocks do not render for most
members; gating them at the listener rather than the markup takes a day-one
member to roughly 45 and a typical member well below the ~130 ceiling. The
under-30 target belongs to M16.5, not here — see PLAN §5c.

Found during the M16 review sweep and worth stating separately, because it was
larger than the problem this milestone set out to fix: **the polling engine
read every non-archived repo every fifteen minutes, in every open tab.** At 600
repos that is 2,400 reads an hour per tab. It now takes the twenty stalest
repos per cycle, ordered by `poll.lastPolledAt`, which still covers everything
over successive cycles because least-recently-polled always sorts first.

---

## 2. The fix — **done in M16**

Platform-independent. Every one of these helps just as much on Postgres.

1. **Paginate repos.** `limit(25)` plus "load more", ordered by `lastEventAt`.
   Single biggest win: ~600 reads → 25.
2. **A circle summary document.** One doc per circle holding member count, repo
   count, the few "new this week" entries and the activity totals, updated on
   write. Home reads *one* document instead of hundreds.
3. **Stop re-reading on snapshot.** Several blocks re-derive from a full
   collection each time any listener ticks; derive once and memoize.
4. **Scope members to what's shown.** The avatar strip needs eight members, not
   two hundred; the full list belongs on the Members page behind pagination.

Delivered, with one change of approach: the summary document holds **counts
only**, not mirrored lists. Firestore bills documents *returned* rather than
scanned, so an ordered `limit(6)` costs six reads against six hundred repos —
a bounded query is the same cost order as a mirror while returning whole,
current documents, where a mirror duplicates display fields that drift
(ADR-021). Counts survive because no bounded query can produce one.

Constant-cost is achieved; **under ~30 is M16.5's job** (progressive
disclosure), since the remaining budget is dominated by blocks that most
members should not be rendering at all.

Not yet worth doing: caching aggregates in a scheduled job (needs a server),
or Firestore bundles served from the CDN (real, but only after the above).

---

## 3. When to change database platform

Firestore is right for now. The triggers for revisiting, in order:

| Trigger | Response |
|---|---|
| Free tier exhausted **after** §2 is done | Enable Blaze; at this scale it is cents |
| Blaze bill exceeds ~$20/month | Re-examine the read pattern first — it is almost always the cause |
| Needing joins, aggregates or reporting across circles | Postgres genuinely fits better; start planning |
| Wanting SQL, migrations, row-level policies | Supabase |

### What the market actually does

Firestore bills **$0.06 per 100K reads**; the standard complaint is bill shock
from exactly the pattern above — one widely-cited case went from $500 to
$15,000/month after adding real-time views costing 10–15 reads each. Supabase
(Postgres) bills **compute and storage, not operations**: unlimited API requests
on free, $25/month Pro, and independent comparisons put it 3–5× cheaper on
read-heavy workloads. For new SaaS in 2026 the default recommendation is
Postgres-backed; Firebase still wins on mobile, offline sync and realtime.

**The migration is not cheap.** The authorization layer is 117 emulator-tested
security rules; on Postgres those become RLS policies written from scratch, plus
new realtime subscriptions and a new auth integration. Weeks, not days — and it
would be a mistake to pay that before fixing §2, because the fix is what
determines the bill on either platform.

---

## 4. Your own domain (`repocircle.dev` rather than `…github.io/repocircle`)

Supported on GitHub Pages, free, with automatic HTTPS. This does **not** require
leaving Pages. It also drops the `/repocircle/` path prefix, which simplifies a
few things.

Checklist, because several of these are easy to forget and each one breaks
sign-in on its own:

1. Buy the domain; add a `CNAME` file (or set it in repo Settings → Pages)
2. DNS: `CNAME` → `calmcodelabs.github.io` for a subdomain, or four `A` records
   to GitHub's IPs for an apex domain
3. Wait for the certificate, then tick **Enforce HTTPS**
4. `vite.config.ts` — change `base: '/repocircle/'` to `'/'`
5. Firebase console → Authentication → **Authorized domains** — add it
6. GitHub OAuth app → **Authorization callback URL** — update it
7. Check the service-worker scope and `BUILD_ID` stamping still resolve
8. Re-verify sign-in end to end before announcing the new address

A custom domain is also the moment to decide about hash routing (§5).

---

## 5. When hosting would need to change

None of these are about traffic:

| Want | Pages can? | Where to go |
|---|---|---|
| Custom domain + HTTPS | **Yes** | Stay |
| Clean URLs without `#/` | No — no SPA rewrites (ADR-003) | Cloudflare Pages, Netlify, Vercel |
| Real CSP/HSTS headers (currently a `<meta>` tag) | No | Same three |
| Any server-side code — cron, secrets, webhooks | No | Same three, or a small function host |
| Private repository | Not on free | Paid GitHub, or move |

Moving is genuinely easy — the output is a static `dist/`, so it is a config
change rather than a rewrite. The reason to do it would be clean URLs plus real
headers, most likely alongside the custom domain.

---

## 6. Decisions

- **Hosting stays on GitHub Pages.** Measured at 0.4% of its limit at target
  scale. Revisit only for the capability reasons in §5.
- **Database stays on Firestore** until §2 is done and measured. A platform
  change before then would move the bill, not remove it.
- **§2 is the next engineering milestone** after launch.
- **Read cost was deferred once already** (POSITIONING §7, 2026-09-06) on the
  grounds that the setup was a dev-phase choice. It is no longer — real people
  are about to use this.
