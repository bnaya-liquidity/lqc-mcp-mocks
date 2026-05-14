# Docker Compose Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three multi-stage Dockerfiles and a `docker-compose.yml` so `docker compose up` replaces `pnpm start:dev` with no changes to Claude Code MCP registrations.

**Architecture:** Each service (task-hub:3010, crm-rest:3011, crm-mcp:3012) gets its own Dockerfile with three stages: `deps` installs all workspace deps, `build` compiles TypeScript, `runtime` is a slim image with only production deps and compiled JS. The monorepo root is the build context for all three so pnpm workspace resolution works. A root `.dockerignore` keeps the context lean.

**Tech Stack:** Docker, pnpm workspaces, `node:22-alpine`, TypeScript (compiled inside Docker via `tsc`)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `.dockerignore` | Exclude `node_modules`, `dist`, `.git` from Docker build context |
| Create | `docker/task-hub.Dockerfile` | Multi-stage build for `mcp-task-hub`, port 3010 |
| Create | `docker/crm-rest.Dockerfile` | Multi-stage build for `api-crm` REST entry point, port 3011 |
| Create | `docker/crm-mcp.Dockerfile` | Multi-stage build for `api-crm` MCP entry point, port 3012 |
| Create | `docker/docker-compose.yml` | Three-service compose config, context at repo root |

---

### Task 1: Root .dockerignore

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Create `.dockerignore` at the repo root**

```
node_modules
**/node_modules
**/dist
.git
.vscode
spec
docs
*.md
```

- [ ] **Step 2: Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore for Docker builds"
```

---

### Task 2: task-hub.Dockerfile

**Files:**
- Create: `docker/task-hub.Dockerfile`

- [ ] **Step 1: Create `docker/task-hub.Dockerfile`**

```dockerfile
# --- Stage 1: install all workspace dependencies ---
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp-task-hub/package.json ./apps/mcp-task-hub/
RUN pnpm install --frozen-lockfile

# --- Stage 2: compile TypeScript ---
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/mcp-task-hub/tsconfig.json ./apps/mcp-task-hub/
COPY apps/mcp-task-hub/src ./apps/mcp-task-hub/src
RUN pnpm --filter mcp-task-hub run build

# --- Stage 3: slim production runtime ---
FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp-task-hub/package.json ./apps/mcp-task-hub/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/apps/mcp-task-hub/dist ./apps/mcp-task-hub/dist
EXPOSE 3010
CMD ["node", "apps/mcp-task-hub/dist/main.js"]
```

- [ ] **Step 2: Build the image**

Run from the repo root:
```bash
docker build -f docker/task-hub.Dockerfile -t lqc-task-hub:local .
```

Expected: build completes and prints `Successfully tagged lqc-task-hub:local`. No errors.

- [ ] **Step 3: Smoke-test the container**

```bash
docker run --rm -d --name test-task-hub -p 3010:3010 lqc-task-hub:local
sleep 2
curl -s -X POST http://localhost:3010/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | grep '"tools"'
docker stop test-task-hub
```

Expected: the `grep` line prints JSON containing `"tools"`.

- [ ] **Step 4: Commit**

```bash
git add docker/task-hub.Dockerfile
git commit -m "feat(docker): add task-hub multi-stage Dockerfile"
```

---

### Task 3: crm-rest.Dockerfile

**Files:**
- Create: `docker/crm-rest.Dockerfile`

- [ ] **Step 1: Create `docker/crm-rest.Dockerfile`**

```dockerfile
# --- Stage 1: install all workspace dependencies ---
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-crm/package.json ./apps/api-crm/
RUN pnpm install --frozen-lockfile

# --- Stage 2: compile TypeScript ---
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api-crm/tsconfig.json ./apps/api-crm/
COPY apps/api-crm/src ./apps/api-crm/src
RUN pnpm --filter api-crm run build

# --- Stage 3: slim production runtime ---
FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-crm/package.json ./apps/api-crm/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/apps/api-crm/dist ./apps/api-crm/dist
EXPOSE 3011
CMD ["node", "apps/api-crm/dist/main.js"]
```

- [ ] **Step 2: Build the image**

```bash
docker build -f docker/crm-rest.Dockerfile -t lqc-crm-rest:local .
```

Expected: `Successfully tagged lqc-crm-rest:local`. No errors.

- [ ] **Step 3: Smoke-test the container**

```bash
docker run --rm -d --name test-crm-rest -p 3011:3011 lqc-crm-rest:local
sleep 2
curl -s http://localhost:3011/api/customers | grep '"id"'
docker stop test-crm-rest
```

Expected: the `grep` line prints JSON containing customer objects with `"id"` fields.

- [ ] **Step 4: Commit**

```bash
git add docker/crm-rest.Dockerfile
git commit -m "feat(docker): add crm-rest multi-stage Dockerfile"
```

---

### Task 4: crm-mcp.Dockerfile

**Files:**
- Create: `docker/crm-mcp.Dockerfile`

- [ ] **Step 1: Create `docker/crm-mcp.Dockerfile`**

```dockerfile
# --- Stage 1: install all workspace dependencies ---
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-crm/package.json ./apps/api-crm/
RUN pnpm install --frozen-lockfile

# --- Stage 2: compile TypeScript ---
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api-crm/tsconfig.json ./apps/api-crm/
COPY apps/api-crm/src ./apps/api-crm/src
RUN pnpm --filter api-crm run build

# --- Stage 3: slim production runtime ---
FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-crm/package.json ./apps/api-crm/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/apps/api-crm/dist ./apps/api-crm/dist
EXPOSE 3012
CMD ["node", "apps/api-crm/dist/main-mcp.js"]
```

- [ ] **Step 2: Build the image**

```bash
docker build -f docker/crm-mcp.Dockerfile -t lqc-crm-mcp:local .
```

Expected: `Successfully tagged lqc-crm-mcp:local`. No errors.

- [ ] **Step 3: Smoke-test the container**

```bash
docker run --rm -d --name test-crm-mcp -p 3012:3012 lqc-crm-mcp:local
sleep 2
curl -s -X POST http://localhost:3012/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | grep '"tools"'
docker stop test-crm-mcp
```

Expected: the `grep` line prints JSON containing `"tools"`.

- [ ] **Step 4: Commit**

```bash
git add docker/crm-mcp.Dockerfile
git commit -m "feat(docker): add crm-mcp multi-stage Dockerfile"
```

---

### Task 5: docker-compose.yml and full validation

**Files:**
- Create: `docker/docker-compose.yml`

- [ ] **Step 1: Create `docker/docker-compose.yml`**

Note: `context: ..` is relative to the compose file's location (`docker/`), resolving to the monorepo root.

```yaml
services:
  task-hub:
    build:
      context: ..
      dockerfile: docker/task-hub.Dockerfile
    ports:
      - "3010:3010"

  crm-rest:
    build:
      context: ..
      dockerfile: docker/crm-rest.Dockerfile
    ports:
      - "3011:3011"

  crm-mcp:
    build:
      context: ..
      dockerfile: docker/crm-mcp.Dockerfile
    ports:
      - "3012:3012"
```

- [ ] **Step 2: Bring up all services**

Run from the repo root:
```bash
docker compose -f docker/docker-compose.yml up --build -d
```

Then verify all three are running:
```bash
docker compose -f docker/docker-compose.yml ps
```

Expected: three rows all showing `running` (or `Up`).

- [ ] **Step 3: Validate all three endpoints**

```bash
# task-hub MCP
curl -s -X POST http://localhost:3010/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | grep '"tools"'

# crm-rest
curl -s http://localhost:3011/api/customers | grep '"id"'

# crm-mcp
curl -s -X POST http://localhost:3012/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | grep '"tools"'
```

All three `grep` commands must print output. If any returns empty, check container logs:
```bash
docker compose -f docker/docker-compose.yml logs <service-name>
```

- [ ] **Step 4: Tear down**

```bash
docker compose -f docker/docker-compose.yml down
```

Expected: all containers removed.

- [ ] **Step 5: Commit**

```bash
git add docker/docker-compose.yml
git commit -m "feat(docker): add docker-compose.yml for Phase 2"
```
