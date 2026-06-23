export interface RedactionResult {
  text: string;
  count: number;
  types: string[];
}

interface Pattern {
  type: string;
  regex: RegExp;
}

/**
 * Conservative secret detection. Agent context frequently contains tokens,
 * keys, and credentials; it is far better to over-redact in a *shared* store
 * than to leak a secret to teammates. Extend these patterns as needed.
 */
const PATTERNS: Pattern[] = [
  {
    type: "private-key",
    regex: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
  },
  {
    type: "github-token",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g,
  },
  { type: "aws-access-key", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { type: "slack-token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  {
    type: "jwt",
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  { type: "bearer-token", regex: /\b[Bb]earer\s+[A-Za-z0-9._-]{16,}\b/g },
  {
    // KEY=value / KEY: value where the key name looks sensitive.
    type: "env-secret",
    regex:
      /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*[:=]\s*["']?([^\s"']{6,})["']?/gi,
  },
];

export function redactSecrets(input: string): RedactionResult {
  let text = input;
  let count = 0;
  const types = new Set<string>();

  for (const { type, regex } of PATTERNS) {
    text = text.replace(regex, (_match, ...groups) => {
      count += 1;
      types.add(type);
      // For KEY=value matches, keep the key name but redact the value.
      if (type === "env-secret") {
        return `${groups[0]}=[REDACTED:${type}]`;
      }
      return `[REDACTED:${type}]`;
    });
  }

  return { text, count, types: [...types] };
}
