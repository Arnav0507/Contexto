import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api } from "./api.js";
import { config } from "./config.js";
import { redactSecrets } from "./redact.js";
import type { Learning, SearchResult } from "./types.js";

const server = new McpServer({
  name: "shared-agent-context",
  version: "0.1.0",
});

function formatLearning(l: Learning, score?: number): string {
  const meta = [
    `id: ${l.id}`,
    `by ${l.author}`,
    l.kind,
    l.tags.length ? `tags: ${l.tags.join(", ")}` : null,
    l.files.length ? `files: ${l.files.join(", ")}` : null,
    `votes: ${l.votes}`,
    typeof score === "number" && score > 0 ? `score: ${score.toFixed(2)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `### ${l.title}\n${meta}\n\n${l.content}`;
}

server.registerTool(
  "remember_learning",
  {
    title: "Remember a learning",
    description:
      "Save a reusable learning (a gotcha, decision, how-to, or convention) to the team's shared context store so teammates' agents can benefit later. Secrets are automatically redacted before anything is shared. Call this whenever you discover something non-obvious about this project.",
    inputSchema: {
      title: z.string().describe("Short, searchable summary of the learning"),
      content: z
        .string()
        .describe("The full detail worth sharing with the team"),
      kind: z
        .enum(["gotcha", "decision", "howto", "convention", "other"])
        .optional()
        .describe("Type of learning"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Topical tags, e.g. ['build', 'auth']"),
      files: z
        .array(z.string())
        .optional()
        .describe("Related file paths this learning concerns"),
    },
  },
  async ({ title, content, kind, tags, files }) => {
    const redactedTitle = redactSecrets(title);
    const redactedContent = redactSecrets(content);
    const redactions = redactedTitle.count + redactedContent.count;

    const learning = await api.create({
      projectId: config.projectId,
      author: config.author,
      title: redactedTitle.text,
      content: redactedContent.text,
      kind,
      tags,
      files,
    });

    const note =
      redactions > 0
        ? `\n\nNote: redacted ${redactions} potential secret${
            redactions === 1 ? "" : "s"
          } before sharing.`
        : "";

    return {
      content: [
        {
          type: "text",
          text: `Saved to shared context for project "${config.projectId}".\nid: ${learning.id}${note}`,
        },
      ],
    };
  }
);

server.registerTool(
  "recall_context",
  {
    title: "Recall shared context",
    description:
      "Before starting a task — or whenever you hit something unfamiliar — retrieve the most relevant learnings your teammates have already captured for this project. Call this proactively to avoid rediscovering known gotchas and conventions.",
    inputSchema: {
      query: z
        .string()
        .describe(
          "What you're working on, e.g. 'setting up auth middleware' or 'why is the build failing'"
        ),
      tags: z
        .array(z.string())
        .optional()
        .describe("Optionally restrict to these tags"),
      limit: z
        .number()
        .int()
        .positive()
        .max(20)
        .optional()
        .describe("Max results (default 5)"),
    },
  },
  async ({ query, tags, limit }) => {
    const { results } = await api.search({
      projectId: config.projectId,
      q: query,
      tags,
      limit: limit ?? 5,
      markUsed: true,
    });

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No shared learnings found for "${query}" in project "${config.projectId}" yet. As you work, use remember_learning to capture useful findings for your teammates.`,
          },
        ],
      };
    }

    const body = results
      .map((r: SearchResult) => formatLearning(r.learning, r.score))
      .join("\n\n---\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} relevant learning(s) from your team:\n\n${body}`,
        },
      ],
    };
  }
);

server.registerTool(
  "list_recent_learnings",
  {
    title: "List recent learnings",
    description:
      "Browse the most recently captured shared learnings for this project.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .positive()
        .max(20)
        .optional()
        .describe("Max results (default 10)"),
    },
  },
  async ({ limit }) => {
    const { results } = await api.search({
      projectId: config.projectId,
      limit: limit ?? 10,
    });

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: "No learnings captured yet." }],
      };
    }

    const body = results
      .map((r: SearchResult) => formatLearning(r.learning))
      .join("\n\n---\n\n");

    return { content: [{ type: "text", text: body }] };
  }
);

server.registerTool(
  "vote_learning",
  {
    title: "Vote on a learning",
    description:
      "Mark a shared learning as helpful or not. Helpful learnings rank higher for everyone; unhelpful ones sink. This keeps the shared context curated and trustworthy.",
    inputSchema: {
      id: z.string().describe("The learning id"),
      helpful: z.boolean().describe("true = upvote, false = downvote"),
    },
  },
  async ({ id, helpful }) => {
    const learning = await api.vote(id, helpful ? 1 : -1);
    return {
      content: [
        {
          type: "text",
          text: `Recorded ${helpful ? "upvote" : "downvote"} for "${
            learning.title
          }" (net votes: ${learning.votes}).`,
        },
      ],
    };
  }
);

server.registerTool(
  "forget_learning",
  {
    title: "Forget a learning",
    description:
      "Delete a stale or incorrect learning from the shared store so it stops being surfaced to the team.",
    inputSchema: {
      id: z.string().describe("The learning id to remove"),
    },
  },
  async ({ id }) => {
    await api.remove(id);
    return {
      content: [
        { type: "text", text: `Removed learning ${id} from shared context.` },
      ],
    };
  }
);

async function main(): Promise<void> {
  // Probe the backend so we can log a friendly warning, but don't block startup
  // — individual tools report connection errors clearly when invoked.
  // NOTE: stdout is reserved for the MCP protocol, so all logging uses stderr.
  try {
    await api.health();
  } catch (err) {
    console.error(`[sac] warning: ${(err as Error).message}`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[sac] shared-agent-context MCP server ready ` +
      `(project "${config.projectId}", backend ${config.serverUrl}, author "${config.author}")`
  );
}

main().catch((err) => {
  console.error("[sac] fatal:", err);
  process.exit(1);
});
