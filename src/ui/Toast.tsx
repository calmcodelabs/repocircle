import { signal } from '@preact/signals';

type ToastMsg = { id: number; text: string; error?: boolean };
const toasts = signal<ToastMsg[]>([]);
let nextId = 1;

export function toast(text: string, opts: { error?: boolean } = {}): void {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, text, error: opts.error }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, 4200);
}

export function ToastRegion() {
  if (toasts.value.length === 0) return null;
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={t.error ? 'toast toast--error' : 'toast'}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
