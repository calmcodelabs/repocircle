#!/usr/bin/env bash
# Build the RepoCircle demo video from the slide PNGs.
# Usage: ./build-video.sh   (needs ffmpeg)
set -euo pipefail
cd "$(dirname "$0")"

SLIDES=(00-title:4 01-problem:5 02-circle-home:5 03-matcher:5 04-idea:5 \
        05-germinate:5 06-journey:5 07-together:4 08-asks:5 09-people:5 \
        10-inbox:4 11-private:4 12-outro:4)
FADE=0.5

rm -rf .parts && mkdir -p .parts
inputs=(); filters=(); n=0
for entry in "${SLIDES[@]}"; do
  name="${entry%%:*}"; secs="${entry##*:}"
  inputs+=(-loop 1 -t "$secs" -i "$name.png")
  filters+=("[$n:v]scale=1920:1080:flags=lanczos,setsar=1,fps=30,format=yuv420p[v$n];")
  n=$((n+1))
done

# chain cross-fades
chain=""; prev="v0"; offset=0
first_secs="${SLIDES[0]##*:}"; offset=$(echo "$first_secs - $FADE" | bc -l)
for ((i=1;i<n;i++)); do
  out="x$i"
  chain+="[$prev][v$i]xfade=transition=fade:duration=$FADE:offset=$offset[$out];"
  prev="$out"
  secs="${SLIDES[$i]##*:}"
  offset=$(echo "$offset + $secs - $FADE" | bc -l)
done
chain="${chain%;}"

ffmpeg -y "${inputs[@]}" \
  -filter_complex "$(IFS=; echo "${filters[*]}")$chain" \
  -map "[$prev]" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  repocircle-demo.mp4

echo "wrote repocircle-demo.mp4"
echo "GIF for inline README playback:"
echo "  ffmpeg -i repocircle-demo.mp4 -vf 'fps=12,scale=1000:-1:flags=lanczos' -c:v gif -loop 0 repocircle-demo.gif"
