export interface Learning {
  id: string;
  projectId: string;
  author: string;
  title: string;
  content: string;
  kind: string;
  tags: string[];
  files: string[];
  createdAt: string;
  updatedAt: string;
  votes: number;
  usageCount: number;
}

export interface SearchResult {
  learning: Learning;
  score: number;
}
