/**
 * Reduce README markdown to a short plain-text preview.
 *
 * Deliberately NOT a markdown renderer: we never build HTML from remote content
 * (SECURITY §6 — everything renders as text nodes). This strips syntax so the
 * gist survives, and returns lines the UI prints verbatim.
 */
export function readmePreview(markdown: string, maxChars = 420): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let inFence = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^\s*<!--/.test(line)) continue;
    // Badge-only lines (shields.io etc.) carry no meaning without images.
    if (/^\s*(\[!\[|!\[)/.test(line)) continue;
    if (/^\s*[-*_]{3,}\s*$/.test(line)) continue;

    const text = line
      .replace(/^#{1,6}\s*/, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
      .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*[-*+]\s+/, '• ')
      .trim();

    if (!text) {
      if (out.length) out.push('');
      continue;
    }
    out.push(text);
    if (out.join(' ').length > maxChars) break;
  }

  const joined = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return joined.length > maxChars ? `${joined.slice(0, maxChars).trimEnd()}…` : joined;
}
