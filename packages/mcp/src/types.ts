export type CommitKind = "eod" | "breakthrough" | "handoff" | "note";

export interface ContextCommit {
  id: string;
  projectId: string;
  author: string;
  summary: string;
  details: string;
  highlights: string[];
  whereILeftOff: string;
  nextSteps: string[];
  files: string[];
  tags: string[];
  branch: string;
  kind: CommitKind;
  createdAt: string;
  votes: number;
  pullCount: number;
}

export interface PullResult {
  commits: ContextCommit[];
  since: string | null;
  firstPull: boolean;
}
