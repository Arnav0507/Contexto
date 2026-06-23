export type LearningKind =
  | "gotcha"
  | "decision"
  | "howto"
  | "convention"
  | "other";

export interface Learning {
  id: string;
  /** Logical team/project namespace. Collaborators share the same projectId. */
  projectId: string;
  author: string;
  title: string;
  content: string;
  kind: LearningKind;
  tags: string[];
  files: string[];
  createdAt: string;
  updatedAt: string;
  /** Net helpful score from teammate votes. Used for curation + ranking. */
  votes: number;
  /** How many times this learning has been recalled. */
  usageCount: number;
}

export interface CreateLearningInput {
  projectId: string;
  author: string;
  title: string;
  content: string;
  kind?: LearningKind;
  tags?: string[];
  files?: string[];
}

export interface SearchResult {
  learning: Learning;
  score: number;
}
