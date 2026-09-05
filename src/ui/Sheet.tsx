import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/** Bottom sheet on mobile, centered dialog on desktop. Esc + backdrop close. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>('input, textarea, button');
    (first ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);

  return (
    <>
      <div class="sheet-backdrop" onClick={onClose} />
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title} ref={panel} tabindex={-1}>
        <h2 class="sheet__title">{title}</h2>
        {children}
      </div>
    </>
  );
}
