import { EmptyState } from '../ui/EmptyState';

export function NotFound() {
  return (
    <div class="app">
      <EmptyState line="That page doesn’t exist." action={<a href="#/">Go home</a>} />
    </div>
  );
}
