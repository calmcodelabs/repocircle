import type { ComponentChildren } from 'preact';

/** Every empty list gets one instructional line and, where possible, an action (PRD F-13). */
export function EmptyState({ line, action }: { line: string; action?: ComponentChildren }) {
  return (
    <div class="empty">
      <span>{line}</span>
      {action}
    </div>
  );
}
