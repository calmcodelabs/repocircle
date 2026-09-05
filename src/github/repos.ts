import { GhError, ghGet, ghSend } from './client';
import type { GhRepo } from './types';

/** The signed-in member's public repos they own, most recently pushed first (F-04). */
export async function listMyPublicRepos(): Promise<GhRepo[]> {
  const page1 = await ghGet<GhRepo[]>(
    '/user/repos?visibility=public&affiliation=owner&sort=pushed&per_page=100',
  );
  if (page1.length < 100) return page1;
  const page2 = await ghGet<GhRepo[]>(
    '/user/repos?visibility=public&affiliation=owner&sort=pushed&per_page=100&page=2',
  );
  return [...page1, ...page2]; // 200-repo cap is plenty for the import picker
}

export async function getRepoByFullName(owner: string, name: string): Promise<GhRepo> {
  return ghGet<GhRepo>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
}

// --- Mutations (public_repo scope; ghSend enforces 30s spacing) ---

export type GhIssue = { number: number; html_url: string };

/**
 * Open the collaboration-request issue (PRD §7.3).
 * GitHub rejects `labels` from users without push access with a 403 — which is
 * exactly who sends these — so the label is attempted once and dropped on refusal.
 */
export async function createCollabIssue(
  fullName: string,
  requesterLogin: string,
  note: string,
  backlink: string,
): Promise<GhIssue> {
  const body = [
    note,
    '',
    '---',
    `_Sent via [RepoCircle](${backlink}) — @${requesterLogin} would like to collaborate on this repo._`,
  ].join('\n');
  const payload = { title: `Collaboration request from @${requesterLogin}`, body };

  let issue: GhIssue | null;
  try {
    issue = await ghSend<GhIssue>('POST', `/repos/${fullName}/issues`, {
      ...payload,
      labels: ['collab-request'],
    });
  } catch (e) {
    if (!(e instanceof GhError) || e.kind !== 'forbidden') throw e;
    issue = await ghSend<GhIssue>('POST', `/repos/${fullName}/issues`, payload, {
      immediate: true,
    });
  }
  if (!issue) throw new Error('unexpected empty issue response');
  return issue;
}

/** Send the actual GitHub collaborator invitation (owner token). */
export async function inviteCollaborator(fullName: string, username: string): Promise<void> {
  await ghSend('PUT', `/repos/${fullName}/collaborators/${encodeURIComponent(username)}`, {});
}

export async function closeIssueWithComment(
  fullName: string,
  issueNumber: number,
  comment: string,
): Promise<void> {
  await ghSend('POST', `/repos/${fullName}/issues/${issueNumber}/comments`, { body: comment });
  await ghSend('PATCH', `/repos/${fullName}/issues/${issueNumber}`, { state: 'closed' });
}

/**
 * README text for the idea preview. Most idea-repos have a decent README and
 * little else, so this is often the only way to judge what something is.
 * Returns plain markdown source, trimmed to the first meaningful chunk.
 */
export async function fetchReadme(fullName: string): Promise<string | null> {
  try {
    const res = await ghGet<{ content?: string; encoding?: string }>(`/repos/${fullName}/readme`);
    if (!res.content || res.encoding !== 'base64') return null;
    const binary = atob(res.content.replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null; // no README, or private/missing — not worth surfacing as an error
  }
}

/** GitHub renders a social preview card for every repo; free visual for an idea. */
export function socialPreviewUrl(fullName: string): string {
  return `https://opengraph.githubassets.com/1/${fullName}`;
}
