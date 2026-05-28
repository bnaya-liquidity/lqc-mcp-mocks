# Fake Webhook Notifications — Design Spec

**Date:** 2026-05-28
**Scope:** `apps/mcp-task-hub` and `apps/api-crm` MCP services

---

## Goal

Every MCP tool call emits 2–4 fake webhook-style notifications over a 2–4 second window before returning its result. This demonstrates MCP's real-time notification streaming capability using `notifications/message` over `StreamableHTTPServerTransport`.

---

## Architecture

### Mechanism

MCP `notifications/message` notifications sent via `server.server.notification()` during tool handler execution. The SSE transport keeps the HTTP connection open, so clients receive these as streaming log events mid-call.

Chosen over progress notifications (requires token threading) and raw SSE hacking (fragile).

### New files

```
apps/mcp-task-hub/src/mcp/fake-webhook-emitter.ts
apps/api-crm/src/mcp/fake-webhook-emitter.ts
```

No shared lib — the utility is small and the monorepo has no `libs/` convention.

---

## `emitFakeWebhooks` function

```typescript
emitFakeWebhooks(server: McpServer, toolName: string): Promise<void>
```

**Algorithm:**
1. Pick random count N ∈ [2, 4]
2. Select N distinct events from the tool's event pool (fallback: generic pool)
3. Pick random total duration T ∈ [2000, 4000] ms
4. Spread N delays uniformly across T (each delay = T / N, with small jitter)
5. For each event: `await sleep(delay)`, then send notification

**Notification shape:**
```json
{
  "event": "task.created",
  "webhookId": "wh-a3f9c2",
  "timestamp": "2026-05-28T10:31:05.123Z",
  "source": "task-hub",
  "payload": { "taskId": "task-047", "assignee": "alice" }
}
```

- `webhookId`: random 6-char hex, unique per notification
- `source`: `"task-hub"` in mcp-task-hub, `"crm"` in api-crm
- `payload`: static fictional values, tool-appropriate field names

---

## Event pools

### task-hub

| Tool | Events (pick N of these) |
|---|---|
| `list_tasks` | `tasks.queried`, `filter.applied`, `index.scanned`, `metrics.recorded` |
| `get_task` | `cache.checked`, `index.scanned`, `metrics.recorded`, `audit.logged` |
| `create_task` | `task.created`, `task.assigned`, `notification.sent`, `audit.logged`, `index.updated` |
| `update_task` | `task.updated`, `watchers.notified`, `audit.logged`, `index.updated` |
| `delete_task` | `task.deleted`, `comments.purged`, `audit.logged`, `index.updated` |
| `add_comment` | `comment.added`, `mention.detected`, `notification.sent`, `audit.logged` |
| `get_stats` | `cache.checked`, `metrics.recorded`, `index.scanned` |

### api-crm

| Tool | Events (pick N of these) |
|---|---|
| `search_customers` | `cache.checked`, `index.scanned`, `metrics.recorded`, `audit.logged` |
| `get_customer` | `cache.checked`, `profile.assembled`, `metrics.recorded`, `audit.logged` |
| `create_customer` | `customer.created`, `crm.synced`, `welcome.email_queued`, `audit.logged`, `index.updated` |
| `list_pipeline` | `cache.checked`, `forecast.calculated`, `metrics.recorded` |
| `create_deal` | `deal.created`, `pipeline.updated`, `rep.notified`, `forecast.recalculated`, `audit.logged` |
| `move_deal_stage` | `deal.stage_changed`, `probability.recalculated`, `manager.notified`, `crm.synced`, `audit.logged` |
| `log_activity` | `activity.logged`, `timeline.updated`, `reminder.set`, `crm.synced`, `audit.logged` |
| `get_activity_summary` | `cache.checked`, `timeline.scanned`, `metrics.recorded` |

---

## Integration

Each tool handler gets one line added at the start, before any business logic:

```typescript
async ({ id }) => {
  await emitFakeWebhooks(server, 'get_task');
  // ... existing logic unchanged
}
```

`server` is already in scope inside `registerTools(server: McpServer)` — no handler signature changes needed.

---

## Out of scope

- No contextual data (real task IDs, customer names) in payloads — fictional values only
- No changes to resources or prompts — tools only
- No shared lib — files are duplicated across the two apps
