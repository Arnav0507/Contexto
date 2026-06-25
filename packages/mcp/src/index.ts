import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api } from "./api.js";
import { config } from "./config.js";
import { redactSecrets } from "./redact.js";
import type { ContextCommit } from "./types.js";

const server = new McpServer({
  name: "shared-agent-context",
  version: "0.2.0",
});

// ---------- formatting helpers ----------

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function bullets(items: string[]): string {
  return items.map((i) => `  - ${i}`).join("\n");
}

function formatCommit(c: ContextCommit): string {
  const meta = [
    `[${c.kind}]`,
    `by ${c.author}`,
    relativeTime(c.createdAt),
    c.branch ? `branch ${c.branch}` : null,
    `id ${c.id}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const parts = [`### ${c.summary}`, meta];
  if (c.details) parts.push(`\n${c.details}`);
  if (c.highlights.length) parts.push(`\nHighlights:\n${bullets(c.highlights)}`);
  if (c.whereILeftOff) parts.push(`\nWhere I left off: ${c.whereILeftOff}`);
  if (c.nextSteps.length) parts.push(`\nNext steps:\n${bullets(c.nextSteps)}`);
  if (c.files.length) parts.push(`\nFiles: ${c.files.join(", ")}`);
  if (c.tags.length) parts.push(`Tags: ${c.tags.join(", ")}`);
  return parts.join("\n");
}

function redactList(items: string[] | undefined): {
  values: string[];
  count: number;
} {
  let count = 0;
  const values = (items ?? []).map((i) => {
    const r = redactSecrets(i);
    count += r.count;
    return r.text;
  });
  return { values, count };
}

// ---------- tools ----------

server.registerTool(
  "pull_context",
  {
    title: "Pull team context",
    description:
      "Run this at the START of a session on this project (or when returning to it) to catch up on what your teammates have shared since you last pulled. Returns their context snapshots — what they did, where they left off, and next steps — so you start already up to speed instead of asking around.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .positive()
        .max(25)
        .optional()
        .describe("Max snapshots to return (default 10)"),
    },
  },
  async ({ limit }) => {
    const { commits, since, firstPull } = await api.pull(
      config.projectId,
      config.author,
      limit ?? 10
    );

    if (commits.length === 0) {
      const when = firstPull ? "" : ` since ${relativeTime(since!)}`;
      return {
        content: [
          {
            type: "text",
            text: `You're up to date on "${config.projectId}" — no new teammate context${when}.`,
          },
        ],
      };
    }

    const header = firstPull
      ? `Welcome to "${config.projectId}". Here ${
          commits.length === 1 ? "is" : "are"
        } the ${commits.length} most recent team context snapshot(s):`
      : `${commits.length} new update(s) from your team on "${config.projectId}" since you last pulled:`;

    const body = commits.map(formatCommit).join("\n\n---\n\n");
    return {
      content: [{ type: "text", text: `${header}\n\n${body}` }],
    };
  }
);

server.registerTool(
  "commit_context",
  {
    title: "Commit your context",
    description:
      "Run this when you hit a breakthrough or finish for the day, to share your working context with teammates. Summarize THIS session into a snapshot another developer could resume from: what you did, key decisions/breakthroughs, where you left off, and next steps. Secrets are auto-redacted before sharing. The project and your identity are detected from the git repo automatically.",
    inputSchema: {
      summary: z
        .string()
        .describe("One-line headline of what this session was about"),
      details: z
        .string()
        .optional()
        .describe("Fuller narrative: what you tried, decisions and why"),
      highlights: z
        .array(z.string())
        .optional()
        .describe("Key breakthroughs or decisions, as short bullets"),
      whereILeftOff: z
        .string()
        .optional()
        .describe("Current state — where a teammate should resume from"),
      nextSteps: z
        .array(z.string())
        .optional()
        .describe("Concrete next actions, open questions, or blockers"),
      files: z
        .array(z.string())
        .optional()
        .describe("Files touched this session"),
      tags: z.array(z.string()).optional().describe("Topical tags"),
      kind: z
        .enum(["eod", "breakthrough", "handoff", "note"])
        .optional()
        .describe(
          "Why you're committing: end-of-day, a breakthrough, a handoff, or a quick note"
        ),
    },
  },
  async ({
    summary,
    details,
    highlights,
    whereILeftOff,
    nextSteps,
    files,
    tags,
    kind,
  }) => {
    const rSummary = redactSecrets(summary);
    const rDetails = redactSecrets(details ?? "");
    const rWhere = redactSecrets(whereILeftOff ?? "");
    const rHighlights = redactList(highlights);
    const rNext = redactList(nextSteps);
    const redactions =
      rSummary.count +
      rDetails.count +
      rWhere.count +
      rHighlights.count +
      rNext.count;

    const commit = await api.commit({
      projectId: config.projectId,
      author: config.author,
      summary: rSummary.text,
      details: rDetails.text || undefined,
      highlights: rHighlights.values,
      whereILeftOff: rWhere.text || undefined,
      nextSteps: rNext.values,
      files,
      tags,
      branch: config.branch || undefined,
      kind,
    });

    const note =
      redactions > 0
        ? `\nRedacted ${redactions} potential secret${
            redactions === 1 ? "" : "s"
          } before sharing.`
        : "";

    return {
      content: [
        {
          type: "text",
          text: `Committed your context to "${config.projectId}" as ${config.author}.\nid: ${commit.id}${note}\nTeammates will receive this next time they pull_context.`,
        },
      ],
    };
  }
);

server.registerTool(
  "context_log",
  {
    title: "Context log",
    description:
      "Show the recent timeline of team context commits for this project (like `git log`), without affecting your pull position. Useful to browse history or find a specific snapshot.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .positive()
        .max(50)
        .optional()
        .describe("Max commits to show (default 10)"),
    },
  },
  async ({ limit }) => {
    const { commits } = await api.log(config.projectId, limit ?? 10);
    if (commits.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No context committed for "${config.projectId}" yet.`,
          },
        ],
      };
    }
    const body = commits.map(formatCommit).join("\n\n---\n\n");
    return { content: [{ type: "text", text: body }] };
  }
);

server.registerTool(
  "vote_commit",
  {
    title: "Vote on a context commit",
    description:
      "Mark a teammate's context commit as helpful or not, to keep the shared timeline curated and trustworthy.",
    inputSchema: {
      id: z.string().describe("The commit id"),
      helpful: z.boolean().describe("true = upvote, false = downvote"),
    },
  },
  async ({ id, helpful }) => {
    const commit = await api.vote(id, helpful ? 1 : -1);
    return {
      content: [
        {
          type: "text",
          text: `Recorded ${helpful ? "upvote" : "downvote"} for "${
            commit.summary
          }" (net votes: ${commit.votes}).`,
        },
      ],
    };
  }
);

server.registerTool(
  "forget_commit",
  {
    title: "Forget a context commit",
    description:
      "Delete a stale or incorrect context commit so it stops being surfaced to the team.",
    inputSchema: {
      id: z.string().describe("The commit id to remove"),
    },
  },
  async ({ id }) => {
    await api.remove(id);
    return {
      content: [
        { type: "text", text: `Removed context commit ${id}.` },
      ],
    };
  }
);

async function main(): Promise<void> {
  // stdout is reserved for the MCP protocol, so all logging goes to stderr.
  try {
    await api.health();
  } catch (err) {
    console.error(`[sac] warning: ${(err as Error).message}`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[sac] shared-agent-context ready · project "${config.projectId}" · ` +
      `author "${config.author}"${config.branch ? ` · branch ${config.branch}` : ""} · ` +
      `backend ${config.serverUrl}`
  );
}

main().catch((err) => {
  console.error("[sac] fatal:", err);
  process.exit(1);
});
