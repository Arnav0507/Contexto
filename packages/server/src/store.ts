import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CommitKind, ContextCommit, CreateCommitInput } from "./types.js";

const VALID_KINDS: CommitKind[] = ["eod", "breakthrough", "handoff", "note"];

interface StoreData {
  commits: ContextCommit[];
  /** `${projectId}::${author}` -> ISO timestamp of that person's last pull. */
  pulls: Record<string, string>;
}

export interface PullResult {
  commits: ContextCommit[];
  /** The timestamp the caller had last pulled at (null on first pull). */
  since: string | null;
  /** Whether this was the caller's first pull on this project. */
  firstPull: boolean;
}

/**
 * JSON-file backed store for context commits. Zero native dependencies so it
 * "just runs" anywhere for the demo; the interface is DB-shaped so it can be
 * swapped for SQLite/Postgres + a hosted deployment later.
 */
export class ContextStore {
  private data: StoreData = { commits: [], pulls: {} };

  constructor(private readonly filePath: string) {
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(
        readFileSync(this.filePath, "utf8")
      ) as Partial<StoreData>;
      this.data = {
        commits: parsed.commits ?? [],
        pulls: parsed.pulls ?? {},
      };
    } catch {
      // Corrupt file — start fresh rather than crash.
      this.data = { commits: [], pulls: {} };
    }
  }

  private persist(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }

  commit(input: CreateCommitInput): ContextCommit {
    const kind: CommitKind =
      input.kind && VALID_KINDS.includes(input.kind) ? input.kind : "note";
    const commit: ContextCommit = {
      id: randomUUID(),
      projectId: input.projectId,
      author: input.author,
      summary: input.summary.trim(),
      details: (input.details ?? "").trim(),
      highlights: cleanList(input.highlights),
      whereILeftOff: (input.whereILeftOff ?? "").trim(),
      nextSteps: cleanList(input.nextSteps),
      files: cleanList(input.files),
      tags: cleanList(input.tags),
      branch: (input.branch ?? "").trim(),
      kind,
      createdAt: new Date().toISOString(),
      votes: 0,
      pullCount: 0,
    };
    this.data.commits.push(commit);
    this.persist();
    return commit;
  }

  get(id: string): ContextCommit | undefined {
    return this.data.commits.find((c) => c.id === id);
  }

  delete(id: string): boolean {
    const before = this.data.commits.length;
    this.data.commits = this.data.commits.filter((c) => c.id !== id);
    const changed = this.data.commits.length !== before;
    if (changed) this.persist();
    return changed;
  }

  vote(id: string, delta: number): ContextCommit | undefined {
    const commit = this.get(id);
    if (!commit) return undefined;
    commit.votes += delta;
    this.persist();
    return commit;
  }

  /** The recent timeline for a project (like `git log`), newest first. */
  log(projectId: string, limit: number): ContextCommit[] {
    return this.data.commits
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  /**
   * Return commits from *other* teammates created since this caller last pulled,
   * then advance their pull pointer. On first pull, returns the most recent
   * `limit` commits so they get caught up.
   */
  pull(projectId: string, author: string, limit: number): PullResult {
    const key = `${projectId}::${author}`;
    const since = this.data.pulls[key] ?? null;
    const firstPull = since === null;

    const commits = this.data.commits
      .filter((c) => c.projectId === projectId && c.author !== author)
      .filter((c) => (since ? c.createdAt > since : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);

    for (const c of commits) c.pullCount += 1;
    this.data.pulls[key] = new Date().toISOString();
    this.persist();

    return { commits, since, firstPull };
  }
}

function cleanList(arr: string[] | undefined): string[] {
  return [...new Set((arr ?? []).map((s) => s.trim()).filter(Boolean))];
}
