// Language → CSS class for the color dot. Class-based because our CSP has no
// 'unsafe-inline' for styles (style attributes are blocked by design).
const KNOWN = new Set([
  'typescript', 'javascript', 'python', 'go', 'rust', 'java', 'kotlin', 'swift',
  'c', 'cpp', 'csharp', 'ruby', 'php', 'html', 'css', 'shell', 'dart', 'vue', 'svelte',
]);

export function langClass(language: string | null): string {
  if (!language) return 'lang--none';
  const key = language.toLowerCase().replace('c++', 'cpp').replace('c#', 'csharp').replace(/[^a-z]/g, '');
  return KNOWN.has(key) ? `lang--${key}` : 'lang--other';
}
