export function StatusDot({ tone = 'idle' }: { tone?: 'idle' | 'accent' | 'warn' }) {
  const cls = tone === 'idle' ? 'dot' : `dot dot--${tone}`;
  return <span class={cls} aria-hidden="true" />;
}
