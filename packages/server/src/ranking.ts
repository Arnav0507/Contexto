import type { Learning } from "./types.js";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "for", "to", "of",
  "in", "on", "at", "by", "with", "is", "are", "was", "were", "be", "been",
  "being", "it", "this", "that", "these", "those", "i", "we", "you", "they",
  "he", "she", "as", "from", "into", "about", "how", "do", "does", "did", "can",
  "could", "should", "would", "will", "my", "our", "your",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScoreParams {
  queryTokens: string[];
  queryTags: string[];
  now: number;
}

export interface ScoredLearning {
  /** Textual relevance: keyword overlap + explicit tag matches. Must be > 0 for
   * a learning to count as a match for a query. */
  match: number;
  /** Overall ranking score: match plus recency/votes/usage boosts. */
  score: number;
}

/**
 * Heuristic relevance score. Intentionally simple and transparent so it is easy
 * to demo and reason about. This is the "moat" surface: swap it for embeddings /
 * vector search later without changing the REST API.
 *
 * Returns both a textual `match` (so callers can exclude irrelevant items) and a
 * boosted `score` (used for ordering). Recency/votes/usage only ever *re-rank*
 * items that already match the query — they never make an unrelated item match.
 */
export function scoreLearning(
  learning: Learning,
  params: ScoreParams
): ScoredLearning {
  const { queryTokens, queryTags, now } = params;

  const titleTf = termFrequency(tokenize(learning.title));
  const contentTf = termFrequency(tokenize(learning.content));
  const tagTokens = learning.tags.map((t) => t.toLowerCase());

  // Keyword overlap: title matches weigh more than body matches.
  let keywordScore = 0;
  const seen = new Set<string>();
  for (const qt of queryTokens) {
    if (seen.has(qt)) continue;
    seen.add(qt);
    keywordScore += (titleTf.get(qt) ?? 0) * 3;
    keywordScore += Math.min(contentTf.get(qt) ?? 0, 3);
    if (tagTokens.includes(qt)) keywordScore += 2;
  }

  // Explicit tag filter boost.
  let tagScore = 0;
  for (const tag of queryTags) {
    if (tagTokens.includes(tag.toLowerCase())) tagScore += 4;
  }

  // Recency: gentle exponential decay over ~30 days.
  const ageDays = Math.max(
    0,
    (now - new Date(learning.updatedAt).getTime()) / DAY_MS
  );
  const recencyScore = Math.exp(-ageDays / 30) * 2;

  // Curation signals.
  const voteScore = learning.votes * 1.5;
  const usageScore = Math.log1p(learning.usageCount);

  const match = keywordScore + tagScore;
  return {
    match,
    score: match + recencyScore + voteScore + usageScore,
  };
}
