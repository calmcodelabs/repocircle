import { GhError, ghGet, ghSend } from './client';
import type { GhRepo } from './types';

/** The signed-in member's public repos they own, most recently pushed first (F-04). */
export async function listMyPublicRepos(): Promise<GhRepo[]> {
  const page1 = await ghGet<GhRepo[]>('/user/repos?visibility=public&affiliation=owner&sort=pushed&per_page=100');
  if (page1.length < 100) return page1;
  const page2 = await ghGet<GhRepo[]>('/user/repos?visibility=public&affiliation=owner&sort=pushed&per_page=100&page=2');
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

  let issue: GhIssue | null = null;
  try {
    issue = await ghSend<GhIssue>('POST', `/repos/${fullName}/issues`, {
      ...payload,
      labels: ['collab-request'],
    });
  } catch (e) {
    if (!(e instanceof GhError) || e.kind !== 'forbidden') throw e;
    issue = await ghSend<GhIssue>('POST', `/repos/${fullName}/issues`, payload, { immediate: true });
  }
  if (!issue) throw new Error('unexpected empty issue response');
  return issue;
}

/** Send the actual GitHub collaborator invitation (owner token). */
export async function inviteCollaborator(fullName: string, username: string): Promise<void> {
  await ghSend('PUT', `/repos/${fullName}/collaborators/${encodeURIComponent(username)}`, {});
}

export async function closeIssueWithComment(fullName: string, issueNumber: number, comment: string): Promise<void> {
  await ghSend('POST', `/repos/${fullName}/issues/${issueNumber}/comments`, { body: comment });
  await ghSend('PATCH', `/repos/${fullName}/issues/${issueNumber}`, { state: 'closed' });
}
