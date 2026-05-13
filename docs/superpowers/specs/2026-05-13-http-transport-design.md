# HTTP Transport Migration Design

**Date:** 2026-05-13
**Status:** Approved

## Context

Both MCP servers currently use `StdioServerTransport`. Claude Code spawns them as child processes and communicates via stdin/stdout. This causes macOS TCC permission errors when Claude Code lacks read access to `~/Documents`. The preferred workflow is to run servers manually (`pnpm start:dev`) and point Claude to a URL.

## Goal

Replace stdio transport with `StreamableHTTPServerTransport` so both servers run as persistent HTTP processes and Claude connects via `http://localhost:PORT/mcp`.

## Port Assignments

| App | Role | Port |
|-----|------|------|
| `mcp-task-hub` | MCP HTTP | 3010 |
| `api-crm` | REST API | 3011 |
| `api-crm` | MCP HTTP | 3012 |

## Architecture

### Transport swap

`McpService.start()` in each app currently does:

```ts
const transport = new StdioServerTransport();
await this.server.connect(transport);
```

It becomes:

```ts
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
await this.server.connect(transport);
return transport; // caller mounts it on the HTTP server
```

`sessionIdGenerator: undefined` means stateless sessions — correct for local dev and Docker deployments where each request is independent.

### HTTP server in main.ts

Each `main.ts` creates a bare `node:http` server after NestJS DI init:

```ts
const transport = await mcpService.start();
const httpServer = http.createServer(async (req, res) => {
  if (req.url === '/mcp') {
    await transport.handleRequest(req, res);
  } else {
    res.writeHead(404).end();
  }
});
httpServer.listen(PORT);
```

NestJS remains `createApplicationContext` (DI container only, no HTTP listener from Nest). The raw `http.createServer` owns the port.

### api-crm: two entry points retained

- `main.ts` — REST server, port 3011, no change except port number
- `main-mcp.ts` — MCP HTTP server, port 3012, transport swap + http.createServer

### StderrLogger stays

stdout belongs to the process output stream. Even with HTTP transport, NestJS logs must not pollute stdout (or any other shared stream). `StderrLogger` remains unchanged.

## Dev Scripts

### Root package.json

Add `concurrently` as root devDependency. New script:

```json
"start:dev": "concurrently -n task-hub,crm-rest,crm-mcp -c blue,green,yellow \"pnpm --filter mcp-task-hub start:dev\" \"pnpm --filter api-crm start:dev\" \"pnpm --filter api-crm start:mcp-dev\""
```

### Per-app scripts

`mcp-task-hub/package.json`:
- `start:dev` — already exists (`ts-node src/main.ts`), no change needed

`api-crm/package.json`:
- `start:dev` — already exists for REST (`ts-node src/main.ts`)
- `start:mcp-dev` — new, `ts-node src/main-mcp.ts`

## Claude Code Registration

Replace `claude mcp add` commands in README:

```bash
claude mcp add --transport http lqc-mock-task-hub http://localhost:3010/mcp
claude mcp add --transport http lqc-mock-crm http://localhost:3012/mcp
```

## README Updates

- Replace "Connecting to Claude Code" section with new HTTP commands
- Add "Quick start (dev)" section: install → `pnpm start:dev` → `claude mcp add` × 2
- Update port table to 3010/3011/3012
- Update Design Notes: replace "Why stdio?" with "Why HTTP transport?"

## Files Changed

| File | Change |
|------|--------|
| `apps/mcp-task-hub/src/main.ts` | Add `http.createServer`, listen on 3010 |
| `apps/mcp-task-hub/src/mcp/mcp.service.ts` | Swap `StdioServerTransport` → `StreamableHTTPServerTransport`, return transport |
| `apps/api-crm/src/main.ts` | Change port 3001 → 3011 |
| `apps/api-crm/src/main-mcp.ts` | Add `http.createServer`, listen on 3012 |
| `apps/api-crm/src/mcp/mcp.service.ts` | Same transport swap as task-hub |
| `apps/api-crm/package.json` | Add `start:mcp-dev` script |
| `package.json` (root) | Add `concurrently` devDep + `start:dev` script |
| `README.md` | Update ports, Claude registration commands, quick-start section |
| `spec/deploy.prd.md` | New — deployment strategy phases 1–3 |
