import os from "node:os";

/**
 * Runtime config, all overridable via environment variables in the MCP client
 * config (e.g. .vscode/mcp.json). Collaborators sharing context point at the
 * same CONTEXT_SERVER_URL and use the same CONTEXT_PROJECT_ID.
 */
export const config = {
  serverUrl: (process.env.CONTEXT_SERVER_URL ?? "http://localhost:4000").replace(
    /\/+$/,
    ""
  ),
  projectId: process.env.CONTEXT_PROJECT_ID ?? "default",
  author:
    process.env.CONTEXT_AUTHOR?.trim() ||
    safeUsername() ||
    "unknown",
};

function safeUsername(): string | undefined {
  try {
    return os.userInfo().username;
  } catch {
    return undefined;
  }
}
