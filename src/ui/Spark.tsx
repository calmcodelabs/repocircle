/** Quiet 14-day sparkline — 1.5px accent stroke, no axes (UI.md). */
export function Spark({ series, width = 96, height = 24 }: { series: number[]; width?: number; height?: number }) {
  const max = Math.max(...series, 1);
  const step = width / Math.max(series.length - 1, 1);
  const pad = 2;
  const points = series
    .map((v, i) => `${(i * step).toFixed(1)},${(height - pad - (v / max) * (height - pad * 2)).toFixed(1)}`)
    .join(' ');
  const flat = series.every((v) => v === 0);
  return (
    <svg class="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={flat ? 'var(--text-faint)' : 'var(--accent)'}
        stroke-width="1.5"
        stroke-linejoin="round"
        stroke-linecap="round"
        opacity={flat ? 0.5 : 0.9}
      />
    </svg>
  );
}
