export type CommitKind = "eod" | "breakthrough" | "handoff" | "note";

/**
 * A "context commit" — a point-in-time snapshot of one person's working context
 * on a project, captured when they make a breakthrough or wrap up for the day.
 * Teammates "pull" these to get caught up. Think `git commit`, but for the
 * mental state around the code rather than the code itself.
 */
export interface ContextCommit {
  id: string;
  /** Shared namespace, normally derived from the git remote so teammates on the
   * same repo automatically share a context pool. */
  projectId: string;
  author: string;
  /** One-line headline: what this session was about / the breakthrough. */
  summary: string;
  /** Fuller narrative: decisions made, what was tried, why. */
  details: string;
  /** Key breakthroughs / decisions, as bullets. */
  highlights: string[];
  /** Current state — where a teammate should resume from. */
  whereILeftOff: string;
  /** Concrete next actions and/or open questions and blockers. */
  nextSteps: string[];
  /** Files touched this session. */
  files: string[];
  tags: string[];
  /** Git branch the work happened on, for context. */
  branch: string;
  kind: CommitKind;
  createdAt: string;
  votes: number;
  /** How many times teammates have pulled this commit. */
  pullCount: number;
}

export interface CreateCommitInput {
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
  kind?: CommitKind;
}
