import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { scoreLearning, tokenize } from "./ranking.js";
import type {
  CreateLearningInput,
  Learning,
  LearningKind,
  SearchResult,
} from "./types.js";

const VALID_KINDS: LearningKind[] = [
  "gotcha",
  "decision",
  "howto",
  "convention",
  "other",
];

interface StoreData {
  learnings: Learning[];
}

/**
 * Tiny JSON-file backed store. Zero native dependencies so it "just runs" on any
 * machine for the demo. The interface is deliberately DB-shaped so it can be
 * swapped for SQLite/Postgres/a vector DB later.
 */
export class LearningStore {
  private data: StoreData = { learnings: [] };

  constructor(private readonly filePath: string) {
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(
        readFileSync(this.filePath, "utf8")
      ) as Partial<StoreData>;
      this.data = { learnings: parsed.learnings ?? [] };
    } catch {
      // Corrupt file — start fresh rather than crash the server.
      this.data = { learnings: [] };
    }
  }

  private persist(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }

  create(input: CreateLearningInput): Learning {
    const now = new Date().toISOString();
    const kind: LearningKind =
      input.kind && VALID_KINDS.includes(input.kind) ? input.kind : "other";
    const learning: Learning = {
      id: randomUUID(),
      projectId: input.projectId,
      author: input.author,
      title: input.title.trim(),
      content: input.content.trim(),
      kind,
      tags: dedupe((input.tags ?? []).map((t) => t.trim()).filter(Boolean)),
      files: dedupe((input.files ?? []).map((f) => f.trim()).filter(Boolean)),
      createdAt: now,
      updatedAt: now,
      votes: 0,
      usageCount: 0,
    };
    this.data.learnings.push(learning);
    this.persist();
    return learning;
  }

  get(id: string): Learning | undefined {
    return this.data.learnings.find((l) => l.id === id);
  }

  delete(id: string): boolean {
    const before = this.data.learnings.length;
    this.data.learnings = this.data.learnings.filter((l) => l.id !== id);
    const changed = this.data.learnings.length !== before;
    if (changed) this.persist();
    return changed;
  }

  vote(id: string, delta: number): Learning | undefined {
    const learning = this.get(id);
    if (!learning) return undefined;
    learning.votes += delta;
    learning.updatedAt = new Date().toISOString();
    this.persist();
    return learning;
  }

  markUsed(ids: string[]): void {
    let changed = false;
    for (const id of ids) {
      const learning = this.get(id);
      if (learning) {
        learning.usageCount += 1;
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  search(opts: {
    projectId: string;
    query: string;
    tags: string[];
    limit: number;
  }): SearchResult[] {
    const { projectId, query, tags, limit } = opts;
    const queryTokens = tokenize(query);
    const now = Date.now();

    const candidates = this.data.learnings.filter(
      (l) => l.projectId === projectId
    );

    // No query and no tags → most recent items.
    if (queryTokens.length === 0 && tags.length === 0) {
      return candidates
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map((learning) => ({ learning, score: 0 }));
    }

    return candidates
      .map((learning) => {
        const { match, score } = scoreLearning(learning, {
          queryTokens,
          queryTags: tags,
          now,
        });
        return { learning, match, score };
      })
      // Require an actual textual/tag match so unrelated queries return nothing.
      .filter((r) => r.match > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ learning, score }) => ({ learning, score }));
  }
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
