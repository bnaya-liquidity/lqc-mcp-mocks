# Deployment Strategy

## Overview

This document describes the phased deployment strategy for the `lqc-mcp-mocks` monorepo. The two MCP servers (`mcp-task-hub` and `api-crm`) are designed to run as long-lived HTTP processes, making them portable across local dev, Docker, and Kubernetes environments.

The strategy moves in three phases. Each phase is independently shippable — complete and validate before advancing.

---

## Phase 1 — Local Development (current)

**Goal:** Servers run locally via `pnpm`, Claude connects via localhost URLs.

**How it works:**

```
┌──────────────┐  MCP/HTTP  ┌─────────────────────────────────┐
│  Claude Code │ ─────────▶ │  localhost:3010  (task-hub MCP) │
│              │ ─────────▶ │  localhost:3012  (crm MCP)      │
└──────────────┘            └────────────────┬────────────────┘
                                             │ direct service calls (in-process)
                             ┌───────────────▼─────────────────┐
                             │  localhost:3011  (crm REST)      │
                             │  — developer tool only,          │
                             │    not registered with Claude    │
                             └─────────────────────────────────┘
```

**Start:**
```bash
pnpm install
pnpm run build          # compile TypeScript
pnpm start:dev          # starts all three servers concurrently
```

**Register with Claude Code (once):**
```bash
claude mcp add --transport http lqc-mock-task-hub http://localhost:3010/mcp
claude mcp add --transport http lqc-mock-crm http://localhost:3012/mcp
```

**Validation criteria:**
- All three servers start without error
- `claude mcp list` shows both servers
- Claude Code can invoke tools from both MCP servers

---

## Phase 2 — Docker Compose

**Goal:** Each app runs in its own container; `docker compose up` replaces `pnpm start:dev`. Claude still connects via localhost (ports mapped to host).

**Planned structure:**

```
docker/
├── task-hub.Dockerfile
├── api-crm.Dockerfile
└── docker-compose.yml
```

**`docker-compose.yml` sketch:**

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
      dockerfile: docker/api-crm.Dockerfile
    command: node dist/main.js
    ports:
      - "3011:3011"

  crm-mcp:
    build:
      context: .
      dockerfile: docker/api-crm.Dockerfile
    command: node dist/main-mcp.js
    ports:
      - "3012:3012"
```

**Notes:**
- One `Dockerfile` per app; `crm-rest` and `crm-mcp` share the same image, different `command`
- No volumes needed — data is in-memory, reset on container restart
- Claude `mcp add` commands are unchanged (still `localhost:PORT`)

**Validation criteria:**
- `docker compose up` starts all containers cleanly
- Claude Code tools continue to work unchanged
- Container restart resets mock data (expected behavior)

---

## Phase 3 — Kubernetes via Helm

**Goal:** Each server runs as a Kubernetes Deployment with a ClusterIP Service. Helm chart parameterizes ports, replicas, and image tags.

**Planned chart structure:**

```
helm/
└── lqc-mcp-mocks/
    ├── Chart.yaml
    ├── values.yaml
    └── templates/
        ├── task-hub-deployment.yaml
        ├── task-hub-service.yaml
        ├── crm-rest-deployment.yaml
        ├── crm-rest-service.yaml
        ├── crm-mcp-deployment.yaml
        └── crm-mcp-service.yaml
```

**Access patterns:**
- **In-cluster:** other services reach MCP servers via `http://crm-mcp-svc:3012/mcp`
- **Local dev against cluster:** `kubectl port-forward` maps cluster services to localhost
- **External (optional):** Ingress resource exposes selected services with path routing

**Notes:**
- MCP servers are stateless (`sessionIdGenerator: undefined`) so `replicas > 1` is safe
- `crm-rest` and `crm-mcp` share the same container image; `command` override selects entry point
- In-memory data means no PersistentVolume needed; each pod replica has independent state

**Validation criteria:**
- `helm install lqc-mcp-mocks ./helm/lqc-mcp-mocks` deploys all resources
- Port-forwarded MCP servers respond to Claude Code
- Helm `--set` overrides for ports and image tags work correctly

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-13 | Replace stdio with `StreamableHTTPServerTransport` | macOS TCC blocks child-process file access; HTTP transport is portable across all deployment phases |
| 2026-05-13 | Separate ports per service (3010/3011/3012) | Avoid collisions with other local apps; maps cleanly to Docker and K8s service ports |
| 2026-05-13 | Stateless sessions (`sessionIdGenerator: undefined`) | Simplifies horizontal scaling in Phase 3; no session affinity needed |
