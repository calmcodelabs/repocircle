// Line icons — 24×24 grid, currentColor, 1.75 stroke. Replaces emoji everywhere:
// pictographs read as informal and render differently per platform, which the
// design language can't tolerate. Keep this set small and consistent.

export type IconName =
  | 'ask'
  | 'flag'
  | 'check'
  | 'plus'
  | 'arrow-right'
  | 'repo'
  | 'commit'
  | 'branch'
  | 'pull-request'
  | 'issue'
  | 'release'
  | 'fork'
  | 'handshake'
  | 'users'
  | 'inbox';

const PATHS: Record<IconName, string> = {
  ask: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z',
  flag: 'M4 21V4m0 1h11l-1.6 3.4L15 12H4',
  check: 'm4.5 12.5 5 5 10-11',
  plus: 'M12 5v14M5 12h14',
  'arrow-right': 'M4 12h15m-6-6 6 6-6 6',
  repo: 'M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14H7.5A2.5 2.5 0 0 0 5 19.5zM5 19.5A2.5 2.5 0 0 1 7.5 17H19v4H7.5A2.5 2.5 0 0 1 5 19.5Z',
  commit: 'M3 12h6m6 0h6M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  branch:
    'M7 4v10m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0-10a3 3 0 1 1 0 0Zm10 3a3 3 0 1 0 0 0Zm0 3c0 4-3 4.5-6 5.5',
  'pull-request':
    'M7 7v10m0-13a3 3 0 1 0 0 0Zm0 16a3 3 0 1 0 0 0Zm10-3V9a3 3 0 0 0-3-3h-3m0 0 3-3m-3 3 3 3m0 8a3 3 0 1 0 0 0Z',
  issue: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  release:
    'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 3 12.2V5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8ZM7.5 7.5h.01',
  fork: 'M7 7a3 3 0 1 0 0 0Zm10 0a3 3 0 1 0 0 0Zm-5 13a3 3 0 1 0 0 0Zm0-3v-2a4 4 0 0 0-4-4H7m5 6v-2a4 4 0 0 1 4-4h1',
  handshake: 'm8 12 3-3 3 3 3-3m-9 3 3 3 3-3M3 9l4-4h10l4 4-6.5 8.5a2 2 0 0 1-3 0L3 9Z',
  users:
    'M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 20v-1.5a4 4 0 0 0-3-3.9M15.5 3.9a4 4 0 0 1 0 7.7',
  inbox: 'M3 12h5l1.5 3h5L16 12h5M3 12l3-7h12l3 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z',
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
