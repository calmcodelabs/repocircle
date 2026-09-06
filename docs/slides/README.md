# RepoCircle — slide deck

Thirteen 3840×2160 slides built to be strung into a short product video for the
repo README. Source is `slides.html` (regenerate any time); `crops/` holds the
zoomed regions of the screenshots each slide features.

**All data shown is fabricated.** Every person, project and conversation belongs
to a fictional engineering community, *Meridian Labs* — see
`../screenshots/README.md` for the cast.

## Order and suggested timing

Sized for **~60 seconds**, which is roughly the attention a new repo gets before
someone decides whether to keep reading.

| # | File | Beat | Secs |
|---|---|---|---|
| 1 | `00-title.png` | See what your circle is building | 4 |
| 2 | `01-problem.png` | Everyone is building; nobody can see it | 5 |
| 3 | `02-circle-home.png` | One page for the whole group | 5 |
| 4 | `03-matcher.png` | Work that wants what you're good at | 5 |
| 5 | `04-idea.png` | Pitch it before you build it | 5 |
| 6 | `05-germinate.png` | And when it becomes real | 5 |
| 7 | `06-journey.png` | Every project remembers how it started | 5 |
| 8 | `07-together.png` | The moment it works | 4 |
| 9 | `08-asks.png` | Ask, claim, credit the answer | 5 |
| 10 | `09-people.png` | Who they are, and what they bring | 5 |
| 11 | `10-inbox.png` | What happened while you were away | 4 |
| 12 | `11-private.png` | Invite only. Public repos only | 4 |
| 13 | `12-outro.png` | RepoCircle · repo link | 4 |

## Build the video

Each slide held for its listed time, with half-second cross-fades:

```bash
# in docs/slides — writes repocircle-demo.mp4 at 1080p
ffmpeg -f lavfi -i color=c=0x0e1011:s=1920x1080:r=30 -loop 1 -t 4 -i 00-title.png \
  -loop 1 -t 5 -i 01-problem.png  # …and so on; see build-video.sh
```

`build-video.sh` in this folder does the whole thing in one command, including
the fades, and outputs both 1080p (for GitHub) and 4K.

## Embedding in the README

GitHub does not autoplay MP4s in a README, so either upload the MP4 to a
release or an issue and paste the returned URL (GitHub renders it as a player),
or convert to GIF for inline playback:

```bash
ffmpeg -i repocircle-demo.mp4 -vf "fps=12,scale=1000:-1:flags=lanczos" \
  -c:v gif -loop 0 repocircle-demo.gif
```

The MP4 route keeps the text legible; a GIF at 1000px is softer but plays
inline without a click.

## Regenerating

```bash
python3 -  # rebuild slides.html (see git history for the generator)
node shoot-slides.mjs   # renders each <section> to PNG over CDP
```

Design notes, if you edit: one idea per slide, alternating which side the
screenshot sits on, the app's own palette and typeface, and the UI zoomed to
the single block being talked about — a whole-page screenshot shrinks to
illegibility at video scale.
