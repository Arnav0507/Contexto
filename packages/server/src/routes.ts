import { Router } from "express";
import type { LearningStore } from "./store.js";
import type { CreateLearningInput } from "./types.js";

export function createRouter(store: LearningStore): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Create a learning.
  router.post("/learnings", (req, res) => {
    const body = (req.body ?? {}) as Partial<CreateLearningInput>;
    if (typeof body.title !== "string" || typeof body.content !== "string") {
      return res
        .status(400)
        .json({ error: "title and content are required strings" });
    }
    const learning = store.create({
      projectId: (body.projectId ?? "default").toString(),
      author: (body.author ?? "unknown").toString(),
      title: body.title,
      content: body.content,
      kind: body.kind,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      files: Array.isArray(body.files) ? body.files.map(String) : [],
    });
    res.status(201).json(learning);
  });

  // Search / list learnings, ranked by relevance.
  router.get("/learnings", (req, res) => {
    const projectId = (req.query.projectId ?? "default").toString();
    const query = (req.query.q ?? "").toString();
    const tags = parseTags(req.query.tags);
    const limit = clampLimit(req.query.limit);
    const markUsed = req.query.markUsed === "true";

    const results = store.search({ projectId, query, tags, limit });
    if (markUsed) store.markUsed(results.map((r) => r.learning.id));
    res.json({ results });
  });

  router.get("/learnings/:id", (req, res) => {
    const learning = store.get(req.params.id);
    if (!learning) return res.status(404).json({ error: "not found" });
    res.json(learning);
  });

  // Curation: upvote (delta=1) or downvote (delta=-1).
  router.post("/learnings/:id/vote", (req, res) => {
    const delta = Number((req.body as { delta?: unknown })?.delta);
    if (delta !== 1 && delta !== -1) {
      return res.status(400).json({ error: "delta must be 1 or -1" });
    }
    const learning = store.vote(req.params.id, delta);
    if (!learning) return res.status(404).json({ error: "not found" });
    res.json(learning);
  });

  router.delete("/learnings/:id", (req, res) => {
    const ok = store.delete(req.params.id);
    if (!ok) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  });

  return router;
}

function parseTags(value: unknown): string[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function clampLimit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 8;
  return Math.min(Math.floor(n), 50);
}
