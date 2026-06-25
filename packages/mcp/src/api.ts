import { config } from "./config.js";
import type { ContextCommit, PullResult } from "./types.js";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${config.serverUrl}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw new Error(
      `Cannot reach the shared-context server at ${config.serverUrl}. ` +
        `Is it running? Start it with "npm run start:server". ` +
        `(${(err as Error).message})`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Shared-context server error ${res.status}: ${body || res.statusText}`
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface CommitPayload {
  projectId: string;
  author: string;
  summary: string;
  details?: string;
  highlights?: string[];
  whereILeftOff?: string;
  nextSteps?: string[];
  files?: string[];
  tags?: string[];
  branch?: string;
  kind?: string;
}

export const api = {
  health: () => request<{ ok: boolean }>("/api/health"),

  commit: (payload: CommitPayload) =>
    request<ContextCommit>("/api/commits", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  pull: (projectId: string, author: string, limit?: number) =>
    request<PullResult>("/api/commits/pull", {
      method: "POST",
      body: JSON.stringify({ projectId, author, limit }),
    }),

  log: (projectId: string, limit?: number) => {
    const qs = new URLSearchParams({ projectId });
    if (limit) qs.set("limit", String(limit));
    return request<{ commits: ContextCommit[] }>(`/api/commits?${qs.toString()}`);
  },

  vote: (id: string, delta: 1 | -1) =>
    request<ContextCommit>(`/api/commits/${id}/vote`, {
      method: "POST",
      body: JSON.stringify({ delta }),
    }),

  remove: (id: string) =>
    request<void>(`/api/commits/${id}`, { method: "DELETE" }),
};
