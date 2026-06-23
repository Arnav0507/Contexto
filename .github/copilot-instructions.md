# Copilot instructions — shared-agent-context

This repo is a hackathon starter that lets collaborators **share AI/agent context**
with each other. When one developer's agent learns something non-obvious about the
project, it captures that learning to a shared store; teammates' agents can then
recall it instead of rediscovering it.

## Architecture

- `packages/server` — a small **Express REST API** that persists "learnings" to a
  JSON file (`data/learnings.json`). It exposes create / search / vote / delete and
  ranks search results by relevance (`src/ranking.ts`).
- `packages/mcp` — a **Model Context Protocol (MCP) server** (stdio) that any MCP
  client (VS Code Copilot, Claude, Cursor) connects to. It exposes the tools
  `remember_learning`, `recall_context`, `list_recent_learnings`, `vote_learning`,
  and `forget_learning`, which call the REST API.

A "learning" = `{ title, content, kind, tags, files, author, votes, usageCount }`,
scoped to a `projectId` (the shared team namespace).

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
