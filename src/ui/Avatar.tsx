import { useState } from 'preact/hooks';

/** GitHub avatar with a text fallback. Never renders foreign HTML. */
export function Avatar({ src, login, large }: { src?: string; login: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const cls = large ? 'avatar avatar--lg' : 'avatar';
  if (!src || failed) {
    return (
      <span class={`${cls} row`} aria-hidden="true">
        {login.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      class={cls}
      src={src}
      alt={`@${login}`}
      referrerpolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
