# Copilot instructions — shared-agent-context

This repo is a hackathon starter that lets collaborators **share AI/agent context**
with each other. When one developer wraps up or hits a breakthrough, their agent
**commits** a snapshot of their working context to a shared store; teammates'
agents **pull** those snapshots to start already caught up instead of rediscovering.

## Architecture

- `packages/server` — a small **Express REST API** that persists "context commits"
  to a JSON file (`data/commits.json`). It exposes commit / log / pull / vote /
  delete. `pull` is a feed: it returns commits from *other* teammates created
  since the caller last pulled (tracked per `projectId::author`).
- `packages/mcp` — a **Model Context Protocol (MCP) server** (stdio) that any MCP
  client (VS Code Copilot, Claude, Cursor) connects to. It exposes the tools
  `pull_context`, `commit_context`, `context_log`, `vote_commit`, and
  `forget_commit`, which call the REST API. The shared `projectId` and the author
  are auto-derived from the git repo (`src/git.ts`).

A "context commit" is a session snapshot:
`{ summary, details, highlights[], whereILeftOff, nextSteps[], files[], tags[],
branch, kind, author, createdAt, votes, pullCount }`, scoped to a `projectId`
(the shared team namespace, normally the normalized git remote).

## Agent usage protocol

This server exists so collaborators' agents share working context. Use it
proactively, without waiting to be asked:

- **At the start of a session** on this repo, call `pull_context` to catch up on
  what teammates shared since the last pull, and factor it into your work.
- **When you make a breakthrough, finish a chunk of work, or wrap up for the day**,
  call `commit_context` with a concise snapshot a teammate could resume from
  (summary, highlights, where you left off, next steps). *You* assemble this from
  the session — don't make the user write it.
- Use `context_log` to browse history and `vote_commit` to mark snapshots helpful.

## Conventions

- TypeScript, ESM (`"type": "module"`), `module`/`moduleResolution` = `NodeNext`.
  **Relative imports must use the `.js` extension** (e.g. `import { api } from "./api.js"`).
- The MCP server speaks the protocol over **stdout**, so it must never `console.log`.
  All logging in `packages/mcp` goes to **stderr** (`console.error`).
- Secrets are redacted before anything is written to the shared store
  (`packages/mcp/src/redact.ts`). Prefer over-redacting.
- MCP tools are defined with the v1 SDK `server.registerTool(name, config, handler)`
  API, with `inputSchema` as a Zod raw shape.

## MCP SDK references

- TypeScript SDK (use the stable **v1.x** API): https://github.com/modelcontextprotocol/typescript-sdk
- v1 API docs: https://ts.sdk.modelcontextprotocol.io/
- Protocol docs: https://modelcontextprotocol.io/docs
- Spec: https://modelcontextprotocol.io/specification/latest

## Running

1. `npm install`
2. `npm run build`
3. Start the backend: `npm run start:server`
4. The MCP server is launched by the MCP client via `.vscode/mcp.json`
   (or run standalone with `npm run start:mcp`).
