// Minimal GitHub REST client (server only). Token: GITHUB_REPO_TOKEN.
export const repo = () => process.env.GITHUB_REPO || "robaetem/menu-planner";

export class GithubError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function gh<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.GITHUB_REPO_TOKEN;
  if (!token) throw new GithubError(500, "GITHUB_REPO_TOKEN ontbreekt");
  const res = await fetch(`https://api.github.com/repos/${repo()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new GithubError(res.status, `GitHub ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Start a workflow on main. */
export async function dispatchWorkflow(file: string, inputs: Record<string, string>): Promise<void> {
  await gh(`/actions/workflows/${file}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs }),
  });
}
