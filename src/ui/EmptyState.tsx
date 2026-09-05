import type { ComponentChildren } from 'preact';

/**
 * Every empty list gets one instructional line and, where possible, an action
 * (PRD F-13) — plus an icon tile so empties feel designed, not abandoned.
 */
export function EmptyState({
  line,
  action,
  icon,
}: {
  line: string;
  action?: ComponentChildren;
  icon?: string;
}) {
  return (
    <div class="empty">
      {icon && (
        <span class="tile tile--lg empty__tile" aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{line}</span>
      {action}
    </div>
  );
}
