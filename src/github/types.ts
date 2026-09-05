/** Subset of the GitHub REST repo payload that RepoCircle consumes. */
export type GhRepo = {
  id: number;
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  owner: { login: string; avatar_url: string };
  pushed_at: string | null;
  fork: boolean;
  archived: boolean;
  private: boolean;
  default_branch: string;
};
