# RepoCircle — Design System & Phase-1 UI Spec

Direction set by the project owner with reference imagery (dark node-editor, dark
ops dashboard, dark smart-home app). The shared language of those references, adopted
here as **the RepoCircle look**:

> A calm, near-black canvas. Soft rounded cards with hairline borders. Lots of air.
> One restrained accent used for life-signs, one for attention. Big, light-weight
> numerals beside small muted labels. Pill-shaped controls. Data drawn quietly —
> sparklines and dots, never chart-junk. An occasional soft glow, used like seasoning.

Minimalistic, clean, beautiful — and it happens to align perfectly with the PRD's
"calm, non-competitive" principles: quiet by default, nothing shouting for status.

**Reference DNA (2026-09-05, distilled from the 11 images in `design-refs/`):**
1. *One luminous object per screen* — a gradient panel, a glass card, a glowing FAB.
   Everything else stays matte. Glow is rationed, never ambient on buttons.
2. *Type does the luxury* — huge tight-tracked headlines with a period and exactly one
   gradient-tinted word; two-tone numerals (value bright, unit/decimal dim) over tiny
   uppercase labels.
3. *Every datum is a chip* — language, topics, times, counts each get a small
   outlined pill, never loose text.
4. *Depth by layering* — canvas → panel → glass; ONE inverted (near-white on dark)
   element marks the active thing (nav pill).
5. *Signature gradient* — lime→mint (Haven), used on: sign-in hero panel, big CTAs,
   the FAB, section marks, tinted words. Nowhere else.
6. Landing treatment (sign-in) ≠ product treatment (dense, chips, sectionheads).
Rejected from refs: photography/3D centerpieces, cinematic backdrops, star ratings
(anti-principle), light-first.

## 1. Foundations

### Color tokens (dark is the default and primary theme)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0E0F12` | App canvas |
| `--bg-raised` | `#16181D` | Cards |
| `--bg-overlay` | `#1D2026` | Sheets, menus, inputs |
| `--line` | `rgba(255,255,255,.07)` | Hairline borders (1px) |
| `--line-strong` | `rgba(255,255,255,.14)` | Focused/hover borders |
| `--text` | `#EDEEF0` | Primary text |
| `--text-dim` | `#9CA3AD` | Secondary text, labels |
| `--text-faint` | `#5C6370` | Timestamps, placeholders |
| `--accent` | `#3ECF8E` | Life: activity, claims, resolved, primary buttons |
| `--accent-soft` | `rgba(62,207,142,.12)` | Accent chip/tint backgrounds |
| `--warn` | `#F5A524` | Stuck flags, expiring invites |
| `--danger` | `#F0565E` | Destructive only (never decorative) |
| `--info` | `#6E9BF5` | Links, informational chips |

Glows: a single `radial-gradient` of `--accent` at 6–8% opacity behind hero/empty
states only. Never behind lists. Light theme: Phase-2 token flip (`prefers-color-scheme`
supported from day one in token structure; dark ships first).

Accessibility gate: every text/background pair ≥ WCAG AA (4.5:1); `--text-dim` on
`--bg-raised` is 5.2:1 — verified in M7 with tooling, not eyeballs.

### Type

- Family: **Inter variable** (self-hosted woff2, `font-display: swap`); `ui-monospace`
  for repo names, tags, and numbers-in-tables.
- Scale (px): 12 label-caps · 13 secondary · 15 body · 17 card-title · 22 section ·
  28–40 **light (300)** display numerals (the dashboard-reference look: big thin
  number, tiny muted label underneath).
- Line-height 1.5 body, 1.2 display. No font size below 12.

### Geometry & motion

- Spacing on a 4px grid; card padding 16/20; screen gutters 16 (mobile) / 24 (desktop).
- Radii: 16 cards · 12 inputs · 999 pills/chips/buttons. Borders always 1px `--line`.
- Elevation = border + slight bg lift; shadows barely-there (`0 8px 24px rgba(0,0,0,.35)`)
  on overlays only.
- Motion: 150–200 ms ease-out on enter/hover; respect `prefers-reduced-motion`;
  skeleton shimmer for loading — **never spinners on content areas**.

### Core components (built once in `src/ui/`, M0)

`Card` · `Pill` (button) · `Chip` (tag/status) · `AvatarStack` · `Spark` (SVG
sparkline, 1.5px `--accent` stroke, no axes) · `StatusDot` (accent=active,
warn=stuck, faint=idle) · `Sheet` (bottom sheet mobile / centered modal desktop) ·
`EmptyState` (icon + one instructional line + optional action — F-13 demands one for
every list) · `Field` (label-above input) · `Toast` · `SegmentedControl` · `Skeleton`.

## 2. Layout frame

- **Mobile (< 720px)**: single column; top bar (group name ⌄ switcher · avatar);
  bottom tab bar appears *only after* modules unlock (F-12): Home · Repos · Members ·
  Group. Primary action = floating **"+ Ask"** pill, bottom-right, always reachable
  by thumb (N-04 spirit).
- **Desktop (≥ 720px)**: centered 1040px max content; left rail nav (icons + labels,
  collapsible); same cards, 2-col where natural (Home blocks).
- Every screen ≤ 2 taps from Home (PRD §5 hard limit). Settings behind the avatar.

## 3. Screens (Phase 1)

### S1 · First run / sign-in (F-01, §7.1)
Centered card on a subtly glowing canvas: wordmark, one sentence — *"See what your
group is building. Ask to join in."* — one button: **Continue with GitHub**. Below,
12px links: privacy note ("reads public repos only") + what-we-access sheet. With an
invite token in the URL, the card shows the group name + inviter avatar first:
"Mahesh invited you to **CS Club Builds**".

### S2 · Create / join group (F-02)
Two stacked cards: "Create a group" (name, description) / "Have an invite link?"
(paste field). After create → S3.

### S3 · Repo import picker (F-04)
"Add your repos" — list of the member's public repos (name mono, description dim,
last-push relative time), **preselected checkboxes**, deselect freely (auto-import
with opt-out, as specified). Footer: "Add N repos" pill + "Skip for now".

### S4 · Home (F-05, F-06, F-07, F-11, F-12, F-13) — the product
Order, exactly three blocks + checklist card while incomplete (§5.2):
1. **Onboarding checklist card** (dismissible) — 5 rows, checkmarks fill in accent;
   each completed row unlocks its module tab with a small "unlocked" toast (F-12).
2. **Active this week** — repo cards in a horizontal snap-scroll (mobile) / 2-col grid
   (desktop): name (mono 15), StatusDot, 14-day Spark, "last: 3 commits to main · 2h"
   in `--text-dim`. Unordered beyond most-recent-event; **no ranks, no numbers race**.
3. **Needs help right now** — open asks + stuck flags. Stuck = warn StatusDot + warn
   left hairline; ask = neutral card: title (17), detail (13 dim, 2-line clamp), tag
   Chips, author avatar + relative time; **Claim** pill on the card (F-08 in one tap).
4. **Your activity** — compact rows: your repos, asks you posted (state chip), asks
   you claimed, pending collab requests with state.
Empty states per F-13, e.g. asks: *"No asks yet — post the first one"* + "+ Ask" action.

### S5 · Ask composer (F-06/F-07) — Sheet
Segmented: **Ask** | **Stuck**. Fields: title (required, counter to 120), detail
(≤ 500, hidden for Stuck), repo picker (optional, defaults to your most recent),
tag chips (group's tag set), pairing link (optional URL). Footer note: *"Posts to
#dev-help on Discord"* when integration is on. Submit = accent pill.

### S6 · Ask detail — Sheet/route `#/g/:gid/ask/:id`
Full text, tags, repo link, claims list (avatars + notes), timeline (posted/claimed/
resolved). Actions by state & role: Claim / Unclaim / Mark resolved (author, admin).
Resolved shows a quiet accent check + "Unblocked" (G-05 counts these — group-level only).

### S7 · Repo card & detail (R-01, F-10)
Card: mono name, owner avatar, description (2-line clamp), language dot + Chips
(topics ≤ 3), status Chip (idea/building/paused/done — owner-editable inline), Spark,
demo link icon (↗, `noopener`), **Request to collaborate** pill (hidden for own repos).
Detail route adds: recent events list (icon + summary + relative time), contributors
AvatarStack, register/deregister (owner/admin), archived state.

### S8 · Collaborator request (F-09, §7.3)
From S7: Sheet with one note field (≤ 280) + explainer line *"Opens a public issue on
the repo and pings the owner"*. Owner side: badge on Home "Your activity" + list row
with **Accept** (accent) / **Decline** (ghost) pills; both fire the GitHub calls
(ARCHITECTURE §6) with progress + error surfaced honestly (e.g. "GitHub said no:
token missing scope — reconnect?").

### S9 · Members (minimal in Phase 1)
Rows: avatar, name, login mono dim, role Chip (admin only shown), availability
StatusDot + text ("away until Jun 3" — M-03 early, neutral not student-specific). Admin: overflow menu → change
role / remove (confirm sheet, audit-logged).

### S10 · Group settings (Layer 3)
Sections: **Profile** (name, description) · **Invites** (create with role+expiry
presets, list with label/expiry/uses, revoke) · **Integrations** (Discord webhook URL
field admin-only, event toggles, test-post button) · **Tags** (A-07 custom ask tags)
· **Danger** (leave group; delete group disabled w/ "Phase 2" note).

### S11 · Diagnostics `#/diag` (hidden)
Auth state, granted scopes, rate-limit headroom, last poll per repo, error ring
buffer. Text-only, mono, no styling love needed.

## 4. PWA & platform polish

- Manifest: name RepoCircle, short_name RepoCircle, `display: standalone`,
  `background_color/theme_color: #0E0F12`, maskable 192/512 icons (circle-of-nodes
  mark echoing the wordmark).
- iOS: `apple-touch-icon`, splash meta, safe-area insets (`env(safe-area-inset-*)`)
  for the bottom tab bar and "+ Ask" pill.
- Keyboard: full tab order, visible `:focus-visible` rings (2px `--accent` offset 2),
  `Esc` closes sheets, `/` focuses future palette (P2). WCAG AA pass in M7.

## 5. Voice

Sentence case everywhere. Short, warm, specific. Never gamified ("3 asks waiting"
not "🔥 3 hot asks!"). Errors say what happened + what to do, in one line each.
