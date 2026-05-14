# Phase 2 — Docker Compose Design

**Date:** 2026-05-14
**Scope:** Add Docker Compose support so `docker compose up` replaces `pnpm start:dev`. Claude Code MCP URLs remain unchanged.

---

## File Layout

```
docker/
├── task-hub.Dockerfile
├── crm-rest.Dockerfile
├── crm-mcp.Dockerfile
├── docker-compose.yml
└── .dockerignore   ← at repo root, not inside docker/
```

The `.dockerignore` lives at the monorepo root because the build context for all three Dockerfiles is `.` (repo root). This is required for pnpm workspaces — `pnpm install` at the root resolves cross-workspace dependencies.

---

## Multi-Stage Dockerfile Pattern

All three Dockerfiles follow the same three-stage structure:

| Stage | Base | Purpose |
|-------|------|---------|
| `deps` | `node:22-alpine` | Copy root + app package files, run `pnpm install --frozen-lockfile` |
| `build` | FROM deps | Copy all source, compile target app with `pnpm --filter <app> run build` |
| `runtime` | `node:22-alpine` | Copy only `dist/` + `node_modules` from build; no TypeScript toolchain |

- `task-hub.Dockerfile` → CMD `node dist/main.js`, port 3010
- `crm-rest.Dockerfile` → CMD `node dist/main.js`, port 3011
- `crm-mcp.Dockerfile` → CMD `node dist/main-mcp.js`, port 3012

`crm-rest` and `crm-mcp` are separate Dockerfiles (not a shared image with a `command:` override) so each image is independently deployable and labelled.

---

## docker-compose.yml

```yaml
services:
  task-hub:
    build:
      context: .
      dockerfile: docker/task-hub.Dockerfile
    ports:
      - "3010:3010"

  crm-rest:
    build:
      context: .
      dockerfile: docker/crm-rest.Dockerfile
    ports:
      - "3011:3011"

  crm-mcp:
    build:
      context: .
      dockerfile: docker/crm-mcp.Dockerfile
    ports:
      - "3012:3012"
```

No `depends_on`: `crm-mcp` calls CRM business logic in-process (separate NestJS app context), not via HTTP to `crm-rest`.
No restart policies or health checks — mock environment only.
No volumes — data is in-memory and intentionally resets on container restart.

---

## .dockerignore

Excludes large/irrelevant directories from the build context sent to the Docker daemon:

```
node_modules
**/node_modules
**/dist
.git
spec/
docs/
.vscode/
*.md
```

---

## Validation Criteria

1. `docker compose up` starts all 3 containers without error
2. Claude Code MCP tools work unchanged — `localhost:3010/mcp` and `localhost:3012/mcp`
3. No changes needed to `claude mcp add` registrations
4. `http://localhost:3011/api/customers` responds (manual inspection)
5. Container restart resets all mock data (expected)
