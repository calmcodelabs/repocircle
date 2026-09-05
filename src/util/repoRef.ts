/**
 * Parse user input naming a GitHub repo: "owner/name", a github.com URL
 * (with optional .git, trailing slash, deep path), or garbage → null.
 */
export function parseRepoRef(input: string): { owner: string; name: string } | null {
  const s = input.trim();
  if (!s) return null;
  const urlMatch = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  const bareMatch = urlMatch ? null : s.match(/^([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+)$/);
  const m = urlMatch ?? bareMatch;
  if (!m || !m[1] || !m[2]) return null;
  const owner = m[1];
  let name = m[2];
  if (name.endsWith('.git')) name = name.slice(0, -4);
  if (!owner || !name || owner.startsWith('.') || name.startsWith('.')) return null;
  return { owner, name };
}
