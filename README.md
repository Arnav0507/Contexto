# shared-agent-context

**Share AI/agent context between collaborators so teammates' agents stop
rediscovering the same things.**

When a developer makes a breakthrough or wraps up for the day, their agent
**commits** a snapshot of their working context — what they did, where they left
off, and what's next. Teammates' agents **pull** those snapshots at the start of
their own sessions, so they begin already caught up instead of asking around.

> Like `git`, but for the *context* around the code. The shared project and your
> identity are auto-derived from the git repo, so teammates on the same repo
> share a context pool with zero setup.

## How it works

```mermaid
flowchart LR
    A[Alice's agent] -- commit_context --> M1[MCP server]
    M2[MCP server] -- pull_context --> B[Bob's agent]
    M1 -- HTTP --> S[(Shared REST store)]
    S -- HTTP --> M2
```

- **`packages/mcp`** — a Model Context Protocol (MCP) server that any MCP client
  (VS Code Copilot, Claude, Cursor) connects to over stdio. It exposes five tools:
  | Tool | When the agent uses it |
  | --- | --- |
  | `pull_context` | At the **start of a session** — catch up on teammates' commits since your last pull |
  | `commit_context` | On a **breakthrough or end of day** — share a session snapshot (secrets auto-redacted) |
  | `context_log` | Browse the recent timeline, like `git log` |
  | `vote_commit` | Up/down-vote to keep the timeline curated |
  | `forget_commit` | Delete a stale or incorrect commit |
- **`packages/server`** — a small Express REST API that stores commits and serves
  `pull` as a per-person feed (commits from *other* teammates since you last pulled).

A **context commit** is scoped to a `projectId` — normally the normalized git
remote (e.g. `github.com/acme/widget`), so everyone on the repo shares one pool
automatically.

## Quickstart

```bash
npm install
npm run build

# 1. Start the shared backend (keep this running)
npm run start:server      # http://localhost:4000

# 2. The MCP server is launched automatically by your MCP client via
#    .vscode/mcp.json. To run it standalone for testing:
npm run start:mcp
```

In VS Code, open the Chat view, switch to **Agent** mode, and the
`shared-agent-context` server from `.vscode/mcp.json` will provide the tools.
(Re-run `npm run build` after changing MCP server code, since the client launches
the compiled `dist/`.)

## Demo script (the "wow")

1. **Alice** finishes for the day. Her agent calls `commit_context` with a
   snapshot it assembled from the session — summary *"wired up auth middleware"*,
   where she left off, and next steps (*"token refresh still TODO"*).
2. **Bob** starts the next morning. His agent calls `pull_context` and immediately
   sees Alice's snapshot — what changed, where she stopped, what's next — with no
   standup and no Slack archaeology.
3. Bob's agent calls `vote_commit(helpful: true)`, then commits his own context at
   the end of his session. The loop continues.

## Configuration

Copy `.env.example` and adjust. Key variables (set per MCP client in
`.vscode/mcp.json` → `env`):

| Variable | Where | Default | Meaning |
| --- | --- | --- | --- |
| `PORT` | server | `4000` | Port for the REST backend |
| `SAC_DATA_FILE` | server | `./data/commits.json` | Where context commits persist |
| `CONTEXT_API_KEYS` | server | _(empty)_ | Required keys; empty = auth off. `key` or `key:projectId` (scoped), comma-separated |
| `CONTEXT_SERVER_URL` | mcp | `http://localhost:4000` | How the MCP server reaches the backend |
| `CONTEXT_API_KEY` | mcp | _(empty)_ | Key sent to a hosted backend (must match one on the server) |
| `CONTEXT_PROJECT_DIR` | mcp | process cwd | Repo to derive the shared id + identity from (set to the workspace in `mcp.json`) |
| `CONTEXT_PROJECT_ID` | mcp | git remote | Override the shared namespace (normally auto-derived) |
| `CONTEXT_AUTHOR` | mcp | git user.name | Override attribution (normally auto-derived) |

## Deploy (share it with your team)

Until it's hosted, sharing is single-machine. To let teammates on different
machines share one pool:

1. **Run the backend somewhere both can reach.** With Docker (from the repo root):
   ```bash
   docker build -t sac-server .
   docker run -p 4000:4000 -v sac-data:/data \
     -e CONTEXT_API_KEYS=team-secret:github.com/acme/widget sac-server
   ```
   Or deploy that image to Render/Railway/Fly — or, for a quick hackathon share,
   tunnel a local server with `ngrok http 4000`.
2. **Point each teammate's MCP server at it** via `.vscode/mcp.json` → `env`:
   set `CONTEXT_SERVER_URL` to the hosted URL and `CONTEXT_API_KEY` to the team key.
3. Everyone on the same repo shares one pool automatically (project id = git remote).

> Persistence: the JSON store lives at `SAC_DATA_FILE` (the `/data` volume in
> Docker). Mount a volume so commits survive restarts; swap for a real DB in prod.

## Security notes

- Agent context often contains secrets. The MCP server **redacts** common
  credential patterns (`packages/mcp/src/redact.ts`) before sending anything to
  the shared store. It deliberately over-redacts.
- The backend supports **API-key auth with project-scoped keys** (`CONTEXT_API_KEYS`);
  with auth off it's open for local dev. It still stores plaintext JSON, so for
  production add TLS, a real datastore, and key rotation/audit.

## Extending (where to take it next)

- **Durable datastore:** the API-key auth + Docker deploy are in place; next swap
  the JSON file for SQLite/Postgres and add key rotation, audit logging, and rate limits.
- **Relevance-filtered pull:** let `pull_context` take what you're about to work
  on and rank teammates' commits by relevance, not just recency.
- **Richer auto-capture:** have the agent assemble commits from the full session
  (files changed, decisions made) with even less prompting.

## Project layout

```
packages/
  server/   REST backend: context-commit store + per-person pull feed (JSON)
  mcp/      MCP stdio server (tools) + git scoping + secret redaction + HTTP client
.vscode/mcp.json          registers the MCP server for VS Code
.github/copilot-instructions.md   conventions + agent usage protocol
```
