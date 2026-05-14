# lqc-mcp-mocks

NestJS monorepo with two MCP server demos. Each app shows a different integration pattern.

| App                 | Pattern                                                                     | Port                   |
| ------------------- | --------------------------------------------------------------------------- | ---------------------- |
| `apps/mcp-task-hub` | Pure MCP server — tools, resources, and prompts with no underlying REST API | HTTP :3010             |
| `apps/api-crm`      | NestJS REST API + MCP facade — existing HTTP API exposed via MCP protocol   | REST :3011 + MCP :3012 |

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

| Tool          | Description                                                                   | Annotations       |
| ------------- | ----------------------------------------------------------------------------- | ----------------- |
| `list_tasks`  | List tasks with optional status / project / priority / assignee / tag filters | `readOnlyHint`    |
| `get_task`    | Fetch a single task by ID including full comment history                      | `readOnlyHint`    |
| `create_task` | Create a new task                                                             | —                 |
| `update_task` | Update any field on an existing task                                          | `idempotentHint`  |
| `delete_task` | Permanently delete a task and its comments                                    | `destructiveHint` |
| `add_comment` | Append a comment to a task                                                    | —                 |
| `get_stats`   | Summary counts by status, overdue count, project list                         | `readOnlyHint`    |

**Resources**

| URI                      | Description                                     |
| ------------------------ | ----------------------------------------------- |
| `tasks://all`            | All tasks across every project                  |
| `tasks://overdue`        | Tasks past due date that are not done/cancelled |
| `tasks://project/{name}` | Tasks filtered to one project (supports `list`) |

**Prompts**

| Name            | Description                                                                        |
| --------------- | ---------------------------------------------------------------------------------- |
| `daily_standup` | Structured standup report (yesterday / today / blockers). Optional `assignee` arg. |
| `sprint_review` | Sprint retrospective for a project. `project` + optional `sprintGoal` args.        |

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

| Tool                   | Description                                              | Annotations      |
| ---------------------- | -------------------------------------------------------- | ---------------- |
| `search_customers`     | Search by name, email, company, or industry              | `readOnlyHint`   |
| `get_customer`         | Full profile: customer + all deals + activity summary    | `readOnlyHint`   |
| `create_customer`      | Create a new customer record                             | —                |
| `list_pipeline`        | All deals grouped by stage, with weighted pipeline value | `readOnlyHint`   |
| `create_deal`          | Create a deal linked to a customer                       | —                |
| `move_deal_stage`      | Advance or revert a deal's pipeline stage                | `idempotentHint` |
| `log_activity`         | Log a call / email / meeting / demo / note               | —                |
| `get_activity_summary` | Recent activity history for a customer                   | `readOnlyHint`   |

**Resources**

| URI                    | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `crm://pipeline`       | Full pipeline snapshot grouped by stage         |
| `crm://customers/{id}` | Customer record with deals and activity summary |

**Prompts**

| Name              | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `customer_brief`  | Pre-call briefing doc. `customerId` + optional `meetingPurpose`.    |
| `pipeline_review` | Weekly pipeline health report. Optional `ownerId` and `focusStage`. |

---

## Docker

Requires Docker with the Compose plugin. No local Node.js or pnpm needed — TypeScript is compiled inside the build.

```bash
# Build images and start all three servers
docker compose -f docker/docker-compose.yml up --build -d

# Check all three are running
docker compose -f docker/docker-compose.yml ps

# Tail logs
docker compose -f docker/docker-compose.yml logs -f

# Stop and remove containers
docker compose -f docker/docker-compose.yml down
```

The same ports are mapped to the host (3010 / 3011 / 3012). Register with Claude Code once the containers are up (run once)

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

**Why two entry points in `api-crm`?** `main.ts` starts a full Nest HTTP server for REST testing. `main-mcp.ts` uses `NestFactory.createApplicationContext` (no HTTP listener from Nest) so the same service classes power both interfaces. Claude only talks to the MCP facade — the REST server on port 3011 is a developer tool (curl, Postman) and is never registered with Claude.

**Mock data** is seeded in each service constructor. Restart the process to reset to the original state.

**Deployment** — see `spec/deploy.prd.md` for the phased strategy: local dev → Docker Compose → Kubernetes/Helm.
