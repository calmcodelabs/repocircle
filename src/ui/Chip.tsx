import type { ComponentChildren } from 'preact';

export function Chip({
  children,
  tone = 'default',
}: {
  children: ComponentChildren;
  tone?: 'default' | 'accent' | 'warn' | 'danger';
}) {
  const cls = tone === 'default' ? 'chip' : `chip chip--${tone}`;
  return <span class={cls}>{children}</span>;
}
