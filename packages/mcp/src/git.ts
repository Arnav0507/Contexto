import { execFileSync } from "node:child_process";
import { basename } from "node:path";

function git(args: string[], cwd: string): string | null {
  try {
    const out = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export interface RepoInfo {
  /** Normalized shared namespace, e.g. "github.com/acme/widget". */
  projectId: string | null;
  branch: string;
  /** git config user.name, if set. */
  userName: string | null;
  remote: string | null;
}

/**
 * Derive the shared project namespace + identity from the git repo at `cwd`, so
 * teammates on the same repo automatically share a context pool with no config.
 */
export function resolveRepo(cwd: string): RepoInfo {
  const remote = git(["config", "--get", "remote.origin.url"], cwd);
  const topLevel = git(["rev-parse", "--show-toplevel"], cwd);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd) ?? "";
  const userName = git(["config", "user.name"], cwd);

  let projectId: string | null = null;
  if (remote) projectId = normalizeRemote(remote);
  else if (topLevel) projectId = basename(topLevel).toLowerCase();

  return { projectId, branch, userName, remote };
}

/**
 * Turn a git remote URL into a stable, host-qualified id. Handles both SSH
 * (git@github.com:acme/widget.git) and HTTPS (https://github.com/acme/widget.git).
 */
export function normalizeRemote(url: string): string {
  let s = url.trim().replace(/\.git$/i, "");
  s = s.replace(/^git@([^:]+):/i, "$1/"); // ssh form -> host/path
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ""); // strip scheme://
  s = s.replace(/^[^/@]+@/, ""); // strip leftover user@
  return s.toLowerCase();
}
