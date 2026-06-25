import { Router, type RequestHandler } from "express";
import type { ContextStore } from "./store.js";
import type { CreateCommitInput } from "./types.js";

export function createRouter(
  store: ContextStore,
  authMiddleware: RequestHandler
): Router {
  const router = Router();

  // Open: liveness probe, no auth required.
  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Everything below requires a valid API key (when auth is enabled).
  router.use(authMiddleware);

  // Commit a context snapshot.
  router.post("/commits", (req, res) => {
    const body = (req.body ?? {}) as Partial<CreateCommitInput>;
    if (typeof body.summary !== "string" || body.summary.trim() === "") {
      return res.status(400).json({ error: "summary is required" });
    }
    const commit = store.commit({
      projectId: (body.projectId ?? "default").toString(),
      author: (body.author ?? "unknown").toString(),
      summary: body.summary,
      details: typeof body.details === "string" ? body.details : undefined,
      highlights: asStringArray(body.highlights),
      whereILeftOff:
        typeof body.whereILeftOff === "string" ? body.whereILeftOff : undefined,
      nextSteps: asStringArray(body.nextSteps),
      files: asStringArray(body.files),
      tags: asStringArray(body.tags),
      branch: typeof body.branch === "string" ? body.branch : undefined,
      kind: body.kind,
    });
    res.status(201).json(commit);
  });

  // The project timeline (like `git log`), newest first.
  router.get("/commits", (req, res) => {
    const projectId = (req.query.projectId ?? "default").toString();
    const limit = clampLimit(req.query.limit, 10);
    res.json({ commits: store.log(projectId, limit) });
  });

  // Pull: teammates' commits since the caller last pulled.
  router.post("/commits/pull", (req, res) => {
    const body = (req.body ?? {}) as { projectId?: string; author?: string; limit?: number };
    const projectId = (body.projectId ?? "default").toString();
    const author = (body.author ?? "unknown").toString();
    const limit = clampLimit(body.limit, 10);
    res.json(store.pull(projectId, author, limit));
  });

  // Curation: upvote (delta=1) or downvote (delta=-1).
  router.post("/commits/:id/vote", (req, res) => {
    const delta = Number((req.body as { delta?: unknown })?.delta);
    if (delta !== 1 && delta !== -1) {
      return res.status(400).json({ error: "delta must be 1 or -1" });
    }
    const commit = store.vote(req.params.id, delta);
    if (!commit) return res.status(404).json({ error: "not found" });
    res.json(commit);
  });

  router.delete("/commits/:id", (req, res) => {
    const ok = store.delete(req.params.id);
    if (!ok) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  });

  return router;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(String);
}

function clampLimit(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 50);
}
