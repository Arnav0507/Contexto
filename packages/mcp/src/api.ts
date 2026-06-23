import { config } from "./config.js";
import type { Learning, SearchResult } from "./types.js";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${config.serverUrl}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
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

export interface CreateInput {
  projectId: string;
  author: string;
  title: string;
  content: string;
  kind?: string;
  tags?: string[];
  files?: string[];
}

export interface SearchInput {
  projectId: string;
  q?: string;
  tags?: string[];
  limit?: number;
  markUsed?: boolean;
}

export const api = {
  health: () => request<{ ok: boolean }>("/api/health"),

  create: (input: CreateInput) =>
    request<Learning>("/api/learnings", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  search: (params: SearchInput) => {
    const qs = new URLSearchParams();
    qs.set("projectId", params.projectId);
    if (params.q) qs.set("q", params.q);
    if (params.tags?.length) qs.set("tags", params.tags.join(","));
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.markUsed) qs.set("markUsed", "true");
    return request<{ results: SearchResult[] }>(
      `/api/learnings?${qs.toString()}`
    );
  },

  vote: (id: string, delta: 1 | -1) =>
    request<Learning>(`/api/learnings/${id}/vote`, {
      method: "POST",
      body: JSON.stringify({ delta }),
    }),

  remove: (id: string) =>
    request<void>(`/api/learnings/${id}`, { method: "DELETE" }),
};
