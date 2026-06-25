import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

interface KeyEntry {
  key: string;
  /** projectId this key is scoped to, or null for any project. */
  projectId: string | null;
}

export interface AuthConfig {
  enabled: boolean;
  entries: KeyEntry[];
}

/**
 * Parse CONTEXT_API_KEYS into key entries. Each comma-separated entry is either:
 *   - `someKey`                  -> unscoped, may access any project
 *   - `someKey:github.com/x/y`   -> scoped, may only access that projectId
 *
 * If the variable is empty, auth is disabled (zero-config local dev). When you
 * deploy a shared backend, set it to require keys.
 */
export function parseApiKeys(raw: string | undefined): AuthConfig {
  const entries: KeyEntry[] = [];
  for (const part of (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const idx = part.indexOf(":");
    if (idx === -1) {
      entries.push({ key: part, projectId: null });
    } else {
      entries.push({
        key: part.slice(0, idx).trim(),
        projectId: part.slice(idx + 1).trim() || null,
      });
    }
  }
  return { enabled: entries.length > 0, entries };
}

function extractKey(req: Request): string | null {
  const auth = req.header("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim();
  }
  const x = req.header("x-api-key");
  return x ? x.trim() : null;
}

/** The projectId a request targets, if any (from query or JSON body). */
function requestProjectId(req: Request): string | null {
  const fromQuery =
    typeof req.query.projectId === "string" ? req.query.projectId : null;
  const body = req.body as { projectId?: unknown } | undefined;
  const fromBody = typeof body?.projectId === "string" ? body.projectId : null;
  return fromQuery ?? fromBody ?? null;
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Express middleware enforcing API keys. No-op when auth is disabled. When a
 * matched key is project-scoped, requests that target a different project are
 * rejected with 403 (project isolation).
 */
export function createAuthMiddleware(config: AuthConfig): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.enabled) return next();

    const presented = extractKey(req);
    if (!presented) {
      return res.status(401).json({ error: "missing API key" });
    }

    const matches = config.entries.filter((e) =>
      constantTimeEquals(e.key, presented)
    );
    if (matches.length === 0) {
      return res.status(401).json({ error: "invalid API key" });
    }

    const target = requestProjectId(req);
    if (target) {
      const allowed = matches.some(
        (e) => e.projectId === null || e.projectId === target
      );
      if (!allowed) {
        return res
          .status(403)
          .json({ error: "API key not authorized for this project" });
      }
    }

    next();
  };
}
