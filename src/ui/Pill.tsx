import type { ComponentChildren } from 'preact';

type Props = {
  children: ComponentChildren;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  big?: boolean;
  disabled?: boolean;
  busy?: boolean;
  type?: 'button' | 'submit';
  ariaLabel?: string;
};

export function Pill({ children, onClick, variant = 'default', big, disabled, busy, type = 'button', ariaLabel }: Props) {
  const cls = [
    'pill',
    variant !== 'default' && `pill--${variant}`,
    big && 'pill--big',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type}
      class={cls}
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={ariaLabel}
      aria-busy={busy}
    >
      {busy ? '…' : children}
    </button>
  );
}
