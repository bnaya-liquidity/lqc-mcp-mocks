# HTTP Transport Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `StdioServerTransport` with `StreamableHTTPServerTransport` in both MCP servers so they run as persistent HTTP processes on ports 3010 and 3012, with a single `pnpm start:dev` to start all three servers.

**Architecture:** Each `McpService.start()` creates a `StreamableHTTPServerTransport` (stateless, `sessionIdGenerator: undefined`) and returns it to `main.ts`, which mounts it on a bare `node:http` server. NestJS stays as `createApplicationContext` (DI only). `api-crm` REST server port moves from 3001 → 3011.

**Tech Stack:** `@modelcontextprotocol/sdk` v1.29.0 (`StreamableHTTPServerTransport` already shipped), `node:http`, `concurrently` (new root devDep), NestJS, TypeScript.

---

## File Map

| File | Change |
|------|--------|
| `apps/mcp-task-hub/src/mcp/mcp.service.ts` | Swap `StdioServerTransport` → `StreamableHTTPServerTransport`; `start()` returns the transport |
| `apps/mcp-task-hub/src/main.ts` | Create `http.createServer` routing `/mcp` to transport; listen on 3010 |
| `apps/api-crm/src/mcp/mcp.service.ts` | Same transport swap as task-hub |
| `apps/api-crm/src/main-mcp.ts` | Create `http.createServer` routing `/mcp` to transport; listen on 3012 |
| `apps/api-crm/src/main.ts` | Change port 3001 → 3011 |
| `apps/api-crm/package.json` | Add `start:mcp-dev` script |
| `package.json` (root) | Add `concurrently` devDep; replace old scripts with `start:dev` |
| `README.md` | Update ports, Claude registration commands, quick-start section, design notes |

---

## Task 1: Swap transport in `mcp-task-hub`

**Files:**
- Modify: `apps/mcp-task-hub/src/mcp/mcp.service.ts`

- [ ] **Step 1: Replace the import and update `start()`**

Open `apps/mcp-task-hub/src/mcp/mcp.service.ts`.

Replace the import line:
```ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
```
with:
```ts
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
```

Replace the `start()` method (lines 516–520):
```ts
async start(): Promise<StreamableHTTPServerTransport> {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await this.server.connect(transport);
  this.logger.log('MCP server connected via HTTP transport');
  return transport;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mcp-task-hub/src/mcp/mcp.service.ts
git commit -m "feat(task-hub): swap stdio for StreamableHTTPServerTransport"
```

---

## Task 2: Wire HTTP server in `mcp-task-hub/main.ts`

**Files:**
- Modify: `apps/mcp-task-hub/src/main.ts`

- [ ] **Step 1: Rewrite `main.ts`**

Replace the entire file content with:

```ts
import 'reflect-metadata';
import * as http from 'node:http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { McpService } from './mcp/mcp.service.js';
import { StderrLogger } from './stderr-logger.js';

const PORT = 3010;

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new StderrLogger(['log', 'warn', 'error']),
  });

  await app.init();

  const mcpService = app.get(McpService);
  const transport = await mcpService.start();

  const httpServer = http.createServer(async (req, res) => {
    if (req.url === '/mcp') {
      await transport.handleRequest(req, res);
    } else {
      res.writeHead(404).end('Not found');
    }
  });

  httpServer.listen(PORT, () => {
    process.stderr.write(`task-hub MCP server listening on http://localhost:${PORT}/mcp\n`);
  });

  const shutdown = async () => {
    httpServer.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch(err => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Build and smoke-test**

```bash
cd apps/mcp-task-hub && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mcp-task-hub/src/main.ts
git commit -m "feat(task-hub): start HTTP server on port 3010"
```

---

## Task 3: Swap transport in `api-crm` MCP service

**Files:**
- Modify: `apps/api-crm/src/mcp/mcp.service.ts`

- [ ] **Step 1: Replace the import and update `start()`**

Open `apps/api-crm/src/mcp/mcp.service.ts`.

Replace the import line:
```ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
```
with:
```ts
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
```

Replace the `start()` method (lines 624–628):
```ts
async start(): Promise<StreamableHTTPServerTransport> {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await this.server.connect(transport);
  this.logger.log('CRM MCP facade connected via HTTP transport');
  return transport;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-crm/src/mcp/mcp.service.ts
git commit -m "feat(api-crm): swap stdio for StreamableHTTPServerTransport"
```

---

## Task 4: Wire HTTP server in `api-crm/main-mcp.ts`

**Files:**
- Modify: `apps/api-crm/src/main-mcp.ts`

- [ ] **Step 1: Rewrite `main-mcp.ts`**

Replace the entire file content with:

```ts
import 'reflect-metadata';
import * as http from 'node:http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { CrmMcpService } from './mcp/mcp.service.js';
import { StderrLogger } from './stderr-logger.js';

const PORT = 3012;

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new StderrLogger(['log', 'warn', 'error']),
  });

  await app.init();

  const mcpService = app.get(CrmMcpService);
  const transport = await mcpService.start();

  const httpServer = http.createServer(async (req, res) => {
    if (req.url === '/mcp') {
      await transport.handleRequest(req, res);
    } else {
      res.writeHead(404).end('Not found');
    }
  });

  httpServer.listen(PORT, () => {
    process.stderr.write(`crm-mcp MCP server listening on http://localhost:${PORT}/mcp\n`);
  });

  const shutdown = async () => {
    httpServer.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch(err => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-crm/src/main-mcp.ts
git commit -m "feat(api-crm): start MCP HTTP server on port 3012"
```

---

## Task 5: Update `api-crm` REST port and scripts

**Files:**
- Modify: `apps/api-crm/src/main.ts`
- Modify: `apps/api-crm/package.json`

- [ ] **Step 1: Change REST port from 3001 to 3011**

In `apps/api-crm/src/main.ts`, replace:
```ts
  await app.listen(3001);
  console.log('CRM REST API running on http://localhost:3001/api');
```
with:
```ts
  await app.listen(3011);
  console.log('CRM REST API running on http://localhost:3011/api');
```

- [ ] **Step 2: Add `start:mcp-dev` script to `api-crm/package.json`**

In `apps/api-crm/package.json`, add `start:mcp-dev` to the `scripts` block:
```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/main.js",
    "start:mcp": "node dist/main-mcp.js",
    "start:dev": "ts-node -r tsconfig-paths/register src/main.ts",
    "start:dev:mcp": "ts-node -r tsconfig-paths/register src/main-mcp.ts",
    "start:mcp-dev": "ts-node -r tsconfig-paths/register src/main-mcp.ts",
    "start:inspect": "npx @modelcontextprotocol/inspector node dist/main-mcp.js"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api-crm/src/main.ts apps/api-crm/package.json
git commit -m "feat(api-crm): move REST to port 3011, add start:mcp-dev script"
```

---

## Task 6: Root `package.json` — add `concurrently` and `start:dev`

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Install `concurrently`**

```bash
pnpm add -D -w concurrently
```

Expected: `concurrently` appears in root `package.json` devDependencies and `pnpm-lock.yaml` updates.

- [ ] **Step 2: Replace root scripts**

In root `package.json`, replace the `scripts` block with:
```json
{
  "scripts": {
    "build": "pnpm -r run build",
    "start:dev": "concurrently -n task-hub,crm-rest,crm-mcp -c blue,green,yellow \"pnpm --filter mcp-task-hub run start:dev\" \"pnpm --filter api-crm run start:dev\" \"pnpm --filter api-crm run start:mcp-dev\""
  }
}
```

- [ ] **Step 3: Verify the command works**

```bash
pnpm start:dev
```

Expected: three labeled streams appear (`[task-hub]`, `[crm-rest]`, `[crm-mcp]`), each printing their listening URL to stderr within a few seconds. Ctrl-C should stop all three.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: add concurrently + start:dev to launch all servers"
```

---

## Task 7: Register servers with Claude Code

- [ ] **Step 1: Remove old stdio registrations (if present)**

```bash
claude mcp remove lqc-mock-task-hub --scope user 2>/dev/null || true
claude mcp remove lqc-mock-crm --scope user 2>/dev/null || true
claude mcp remove lqc-mock-task-hub --scope project 2>/dev/null || true
claude mcp remove lqc-mock-crm --scope project 2>/dev/null || true
```

- [ ] **Step 2: Add HTTP transport registrations**

With the servers running (`pnpm start:dev`), run:

```bash
claude mcp add --transport http --scope user lqc-mock-task-hub http://localhost:3010/mcp
claude mcp add --transport http --scope user lqc-mock-crm http://localhost:3012/mcp
```

- [ ] **Step 3: Verify**

```bash
claude mcp list
```

Expected output includes:
```
lqc-mock-task-hub: http://localhost:3010/mcp
lqc-mock-crm: http://localhost:3012/mcp
```

---

## Task 8: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README content**

Replace the entire `README.md` with:

````markdown
# lqc-mcp-mocks

NestJS monorepo with two MCP server demos. Each app shows a different integration pattern.

| App | Pattern | Port |
|-----|---------|------|
| `apps/mcp-task-hub` | Pure MCP server — tools, resources, and prompts with no underlying REST API | HTTP :3010 |
| `apps/api-crm` | NestJS REST API + MCP facade — existing HTTP API exposed via MCP protocol | REST :3011 + MCP :3012 |

All data is in-memory mock data. No database required.

---

## Project structure

```
lqc-mcp-mocks/
├── apps/
│   ├── mcp-task-hub/          # Pure MCP demo (task management)
│   │   └── src/
│   │       ├── main.ts        # HTTP MCP entry point (:3010)
│   │       ├── tasks/         # Business logic (TasksService)
│   │       └── mcp/           # McpService — tools, resources, prompts
│   └── api-crm/               # CRM REST API + MCP facade
│       └── src/
│           ├── main.ts        # HTTP server entry point (:3011)
│           ├── main-mcp.ts    # HTTP MCP entry point (:3012)
│           ├── customers/     # CustomersService + REST controller
│           ├── deals/         # DealsService + REST controller
│           ├── activities/    # ActivitiesService + REST controller
│           └── mcp/           # CrmMcpService — MCP facade over the services
├── spec/
│   └── deploy.prd.md          # Deployment strategy (local → Docker → K8s)
├── package.json               # pnpm workspaces root
├── pnpm-workspace.yaml        # pnpm workspace package globs
└── tsconfig.base.json         # Shared TypeScript config
```

---

## Quick start

```bash
# Install all dependencies
pnpm install

# Build both apps
pnpm run build

# Start all three servers concurrently (task-hub :3010, crm-rest :3011, crm-mcp :3012)
pnpm start:dev
```

Then register both MCP servers with Claude Code (run once):

```bash
claude mcp add --transport http --scope user lqc-mock-task-hub http://localhost:3010/mcp
claude mcp add --transport http --scope user lqc-mock-crm http://localhost:3012/mcp
```

Restart Claude Code after adding. Use `/mcp` in Claude Code to inspect the registered tools.

---

## mcp-task-hub

A task management MCP server demonstrating all three MCP primitives.

**Tools**

| Tool | Description | Annotations |
|------|-------------|-------------|
| `list_tasks` | List tasks with optional status / project / priority / assignee / tag filters | `readOnlyHint` |
| `get_task` | Fetch a single task by ID including full comment history | `readOnlyHint` |
| `create_task` | Create a new task | — |
| `update_task` | Update any field on an existing task | `idempotentHint` |
| `delete_task` | Permanently delete a task and its comments | `destructiveHint` |
| `add_comment` | Append a comment to a task | — |
| `get_stats` | Summary counts by status, overdue count, project list | `readOnlyHint` |

**Resources**

| URI | Description |
|-----|-------------|
| `tasks://all` | All tasks across every project |
| `tasks://overdue` | Tasks past due date that are not done/cancelled |
| `tasks://project/{name}` | Tasks filtered to one project (supports `list`) |

**Prompts**

| Name | Description |
|------|-------------|
| `daily_standup` | Structured standup report (yesterday / today / blockers). Optional `assignee` arg. |
| `sprint_review` | Sprint retrospective for a project. `project` + optional `sprintGoal` args. |

---

## api-crm

A CRM system with two entry points that share the same NestJS service layer.

### REST API (`main.ts` → port 3011)

```bash
pnpm --filter api-crm run start:dev
```

```
GET    /api/customers
GET    /api/customers/search?q=techcorp
GET    /api/customers/:id
POST   /api/customers
PATCH  /api/customers/:id

GET    /api/deals
GET    /api/deals/pipeline
GET    /api/deals/:id
POST   /api/deals
PATCH  /api/deals/:id/stage

GET    /api/activities
GET    /api/activities/:id
POST   /api/activities
```

### MCP facade (`main-mcp.ts` → port 3012)

The MCP facade wraps the same `CustomersService`, `DealsService`, and `ActivitiesService` that power the REST API — no duplication.

**Tools**

| Tool | Description | Annotations |
|------|-------------|-------------|
| `search_customers` | Search by name, email, company, or industry | `readOnlyHint` |
| `get_customer` | Full profile: customer + all deals + activity summary | `readOnlyHint` |
| `create_customer` | Create a new customer record | — |
| `list_pipeline` | All deals grouped by stage, with weighted pipeline value | `readOnlyHint` |
| `create_deal` | Create a deal linked to a customer | — |
| `move_deal_stage` | Advance or revert a deal's pipeline stage | `idempotentHint` |
| `log_activity` | Log a call / email / meeting / demo / note | — |
| `get_activity_summary` | Recent activity history for a customer | `readOnlyHint` |

**Resources**

| URI | Description |
|-----|-------------|
| `crm://pipeline` | Full pipeline snapshot grouped by stage |
| `crm://customers/{id}` | Customer record with deals and activity summary |

**Prompts**

| Name | Description |
|------|-------------|
| `customer_brief` | Pre-call briefing doc. `customerId` + optional `meetingPurpose`. |
| `pipeline_review` | Weekly pipeline health report. Optional `ownerId` and `focusStage`. |

---

## Connecting to Claude Code

Servers must be running before Claude Code can connect. Start them:

```bash
pnpm start:dev
```

Register with Claude Code (run once, servers must be up):

```bash
claude mcp add --transport http --scope user lqc-mock-task-hub http://localhost:3010/mcp
claude mcp add --transport http --scope user lqc-mock-crm http://localhost:3012/mcp
```

Verify:

```bash
claude mcp list
```

---

## Design notes

**Why HTTP transport?** Both MCP servers use `StreamableHTTPServerTransport`. This lets you run the servers yourself (`pnpm start:dev`) and point Claude to a URL, avoiding macOS TCC permission issues that affect stdio child-process spawning. HTTP transport is also the right choice for Docker and Kubernetes deployments (see `spec/deploy.prd.md`).

**Why stateless sessions?** `sessionIdGenerator: undefined` means each request is independent — no session affinity required. This is correct for local dev and allows horizontal scaling in Phase 3 (K8s).

**Why `StderrLogger`?** Even with HTTP transport, NestJS logs must not pollute stdout. Keeping them on stderr means they appear in the terminal alongside the process output without interfering with any other streams.

**Why two entry points in `api-crm`?** `main.ts` starts a full Nest HTTP server for REST testing. `main-mcp.ts` uses `NestFactory.createApplicationContext` (no HTTP listener from Nest) so the same service classes power both interfaces. Each process has independent in-memory state — mutations via REST won't appear in MCP and vice versa.

**Mock data** is seeded in each service constructor. Restart the process to reset to the original state.

**Deployment** — see `spec/deploy.prd.md` for the phased strategy: local dev → Docker Compose → Kubernetes/Helm.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for HTTP transport, ports 3010/3011/3012"
```

---

## Task 9: Build and end-to-end verification

- [ ] **Step 1: Full build**

```bash
pnpm run build
```

Expected: both apps compile with no TypeScript errors.

- [ ] **Step 2: Start all servers**

```bash
pnpm start:dev
```

Expected stderr output (within ~5 seconds):
```
[task-hub] task-hub MCP server listening on http://localhost:3010/mcp
[crm-rest] CRM REST API running on http://localhost:3011/api
[crm-mcp]  crm-mcp MCP server listening on http://localhost:3012/mcp
```

- [ ] **Step 3: Curl smoke test**

In a second terminal:

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3010/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}},"id":1}'
```

Expected: `200`

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3012/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}},"id":1}'
```

Expected: `200`

```bash
curl -s http://localhost:3011/api/customers | head -c 100
```

Expected: JSON array starting with `[{`.

- [ ] **Step 4: Final commit**

```bash
git add -A
git status  # verify nothing unexpected is staged
git commit -m "chore: build verification — HTTP transport migration complete"
```
