import os from "node:os";
import { resolveRepo } from "./git.js";

/**
 * Runtime config. The whole point of the workflow is *zero config*: the shared
 * namespace and your identity are derived from the git repo you're working in,
 * so teammates on the same repo share a context pool automatically. Everything
 * can still be overridden by env vars in the MCP client config (.vscode/mcp.json).
 */
const projectDir = process.env.CONTEXT_PROJECT_DIR?.trim() || process.cwd();
const repo = resolveRepo(projectDir);

export const config = {
  serverUrl: (process.env.CONTEXT_SERVER_URL ?? "http://localhost:4000").replace(
    /\/+$/,
    ""
  ),
  /** Optional API key for a hosted/shared backend (sent as a Bearer token). */
  apiKey: process.env.CONTEXT_API_KEY?.trim() || undefined,
  projectDir,
  /** Shared namespace: env override → git remote → repo folder → "default". */
  projectId: process.env.CONTEXT_PROJECT_ID?.trim() || repo.projectId || "default",
  /** Who is committing: env override → git user.name → OS user → "unknown". */
  author:
    process.env.CONTEXT_AUTHOR?.trim() ||
    repo.userName ||
    safeUsername() ||
    "unknown",
  branch: repo.branch,
  remote: repo.remote,
};

function safeUsername(): string | undefined {
  try {
    return os.userInfo().username;
  } catch {
    return undefined;
  }
}
