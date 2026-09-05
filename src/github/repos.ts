import { ghGet } from './client';
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
