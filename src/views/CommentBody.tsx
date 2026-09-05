import { tokenizeComment, isSafeUrl } from '../util/mentions';

/**
 * Renders a comment as text nodes with mentions, repo references and links as
 * separate spans. Remote text is never turned into markup (SECURITY §6).
 */
export function CommentBody({
  body,
  onRepo,
}: {
  body: string;
  onRepo?: (name: string) => string | undefined;
}) {
  return (
    <p class="comment__body">
      {tokenizeComment(body).map((t, i) => {
        if (t.kind === 'mention') {
          return (
            <span key={i} class="chip chip--accent comment__mention">
              @{t.value}
            </span>
          );
        }
        if (t.kind === 'repo') {
          const href = onRepo?.(t.value);
          return href ? (
            <a key={i} class="chip comment__ref" href={href}>
              {t.value}
            </a>
          ) : (
            <span key={i}>#{t.value}</span>
          );
        }
        if (t.kind === 'link' && isSafeUrl(t.value)) {
          return (
            <a key={i} href={t.value} target="_blank" rel="noopener noreferrer nofollow">
              {t.value.replace(/^https?:\/\//, '').slice(0, 48)}
            </a>
          );
        }
        return <span key={i}>{t.value}</span>;
      })}
    </p>
  );
}
