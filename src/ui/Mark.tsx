/** The RepoCircle mark — a circle of three nodes. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg class="topbar__mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="26" fill="none" stroke="#3ECF8E" stroke-width="4" opacity="0.9" />
      <circle cx="32" cy="12" r="6.5" fill="#0E0F12" stroke="#3ECF8E" stroke-width="3.5" />
      <circle cx="49" cy="45" r="6.5" fill="#0E0F12" stroke="#3ECF8E" stroke-width="3.5" />
      <circle cx="15" cy="45" r="6.5" fill="#0E0F12" stroke="#3ECF8E" stroke-width="3.5" />
    </svg>
  );
}
