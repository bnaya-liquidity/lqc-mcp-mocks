# Fake Webhook Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `emitFakeWebhooks` utility to both MCP services that fires 2–4 `notifications/message` SSE events over 2–4 seconds at the start of every tool handler call.

**Architecture:** A standalone `fake-webhook-emitter.ts` is added to each app's `mcp/` folder. It sends JSON-RPC `notifications/message` notifications via `server.server.notification()` — the MCP SDK's logging notification channel — over the already-open SSE connection. Each app has its own copy (different event pools, different `source` field). No shared lib.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` v1.12 (`McpServer.server.notification`), NestJS (no changes to DI layer), `pnpm --filter` for per-app builds.

---

## File map

| Action | Path |
|--------|------|
| Create | `apps/mcp-task-hub/src/mcp/fake-webhook-emitter.ts` |
| Modify | `apps/mcp-task-hub/src/mcp/mcp.service.ts` |
| Create | `apps/api-crm/src/mcp/fake-webhook-emitter.ts` |
| Modify | `apps/api-crm/src/mcp/mcp.service.ts` |

No tests exist in this project and no test infrastructure is installed — verification is TypeScript compile + manual observation via MCP inspector or Claude Code tool calls.

---

## Task 1: Create fake-webhook-emitter for mcp-task-hub

**Files:**
- Create: `apps/mcp-task-hub/src/mcp/fake-webhook-emitter.ts`

- [ ] **Step 1: Create the file**

Create `apps/mcp-task-hub/src/mcp/fake-webhook-emitter.ts` with this exact content:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type EventPool = Record<string, string[]>;

const TOOL_EVENTS: EventPool = {
  list_tasks:  ['tasks.queried', 'filter.applied', 'index.scanned', 'metrics.recorded'],
  get_task:    ['cache.checked', 'index.scanned', 'metrics.recorded', 'audit.logged'],
  create_task: ['task.created', 'task.assigned', 'notification.sent', 'audit.logged', 'index.updated'],
  update_task: ['task.updated', 'watchers.notified', 'audit.logged', 'index.updated'],
  delete_task: ['task.deleted', 'comments.purged', 'audit.logged', 'index.updated'],
  add_comment: ['comment.added', 'mention.detected', 'notification.sent', 'audit.logged'],
  get_stats:   ['cache.checked', 'metrics.recorded', 'index.scanned'],
};

const GENERIC: string[] = ['cache.checked', 'index.scanned', 'metrics.recorded', 'audit.logged'];

function hex(n: number): string {
  return Math.random().toString(16).slice(2, 2 + n);
}

function pickN<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fakePayload(event: string): Record<string, unknown> {
  const taskId = `task-${String(Math.floor(Math.random() * 900) + 100)}`;
  const users = ['alice', 'bob', 'carol', 'dave'];
  const user = users[Math.floor(Math.random() * users.length)];

  const map: Record<string, Record<string, unknown>> = {
    'task.created':      { taskId, createdBy: user },
    'task.assigned':     { taskId, assignee: user },
    'task.updated':      { taskId, updatedBy: user },
    'task.deleted':      { taskId, deletedBy: user },
    'comment.added':     { taskId, commentId: `cmt-${hex(4)}`, author: user },
    'mention.detected':  { taskId, mentionedUser: user },
    'comments.purged':   { taskId, count: Math.floor(Math.random() * 5) + 1 },
    'watchers.notified': { taskId, watcherCount: Math.floor(Math.random() * 3) + 1 },
    'notification.sent': { recipient: user, channel: 'email' },
    'index.updated':     { entity: 'task', id: taskId },
    'index.scanned':     { scannedRows: Math.floor(Math.random() * 500) + 50 },
    'filter.applied':    { filters: Math.floor(Math.random() * 3) + 1 },
    'tasks.queried':     { returned: Math.floor(Math.random() * 20) + 1 },
    'cache.checked':     { hit: Math.random() > 0.4, ttl: 300 },
    'metrics.recorded':  { metric: 'tool.latency', value: Math.floor(Math.random() * 200) + 20 },
    'audit.logged':      { action: event.split('.')[0], actor: user },
  };

  return map[event] ?? { event };
}

export async function emitFakeWebhooks(server: McpServer, toolName: string): Promise<void> {
  const pool = TOOL_EVENTS[toolName] ?? GENERIC;
  const count = Math.floor(Math.random() * 3) + 2; // 2–4
  const totalMs = Math.floor(Math.random() * 2001) + 2000; // 2000–4000 ms
  const events = pickN(pool, Math.min(count, pool.length));
  const slotMs = Math.floor(totalMs / events.length);

  for (const event of events) {
    await sleep(slotMs);
    await server.server.notification({
      method: 'notifications/message',
      params: {
        level: 'info',
        data: {
          event,
          webhookId: `wh-${hex(6)}`,
          timestamp: new Date().toISOString(),
          source: 'task-hub',
          payload: fakePayload(event),
        },
      },
    });
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm --filter mcp-task-hub run build
```

Expected: exits 0, no TypeScript errors. The new file is picked up automatically by the existing `tsconfig.json` glob.

---

## Task 2: Wire emitter into mcp-task-hub tool handlers

**Files:**
- Modify: `apps/mcp-task-hub/src/mcp/mcp.service.ts`

- [ ] **Step 1: Add the import**

At the top of `apps/mcp-task-hub/src/mcp/mcp.service.ts`, after the existing imports, add:

```typescript
import { emitFakeWebhooks } from './fake-webhook-emitter.js';
```

- [ ] **Step 2: Wire into list_tasks handler**

Find the `list_tasks` handler (currently starts with `async ({ status, project, priority, assignee, tag }) => {`). Add the emitter call as the first line:

```typescript
async ({ status, project, priority, assignee, tag }) => {
  await emitFakeWebhooks(server, 'list_tasks');
  const result = this.tasks.findAll({ status, project, priority, assignee, tag });
  // ... rest unchanged
```

- [ ] **Step 3: Wire into get_task handler**

Find `async ({ id }) => {` inside the `get_task` registration. Add as first line:

```typescript
async ({ id }) => {
  await emitFakeWebhooks(server, 'get_task');
  const task = this.tasks.findById(id);
  // ... rest unchanged
```

- [ ] **Step 4: Wire into create_task handler**

Find `async ({ title, description, priority, project, assignee, dueDate, tags }) => {` inside `create_task`. Add as first line:

```typescript
async ({ title, description, priority, project, assignee, dueDate, tags }) => {
  await emitFakeWebhooks(server, 'create_task');
  const task = this.tasks.create({ title, description, priority, project, assignee, dueDate, tags });
  // ... rest unchanged
```

- [ ] **Step 5: Wire into update_task handler**

Find `async ({ id, ...updates }) => {` inside `update_task`. Add as first line:

```typescript
async ({ id, ...updates }) => {
  await emitFakeWebhooks(server, 'update_task');
  const task = this.tasks.update(id, updates);
  // ... rest unchanged
```

- [ ] **Step 6: Wire into delete_task handler**

Find `async ({ id }) => {` inside `delete_task`. Add as first line:

```typescript
async ({ id }) => {
  await emitFakeWebhooks(server, 'delete_task');
  const exists = this.tasks.findById(id);
  // ... rest unchanged
```

- [ ] **Step 7: Wire into add_comment handler**

Find `async ({ taskId, author, body }) => {` inside `add_comment`. Add as first line:

```typescript
async ({ taskId, author, body }) => {
  await emitFakeWebhooks(server, 'add_comment');
  const comment = this.tasks.addComment(taskId, { author, body });
  // ... rest unchanged
```

- [ ] **Step 8: Wire into get_stats handler**

Find `async () => {` inside `get_stats`. Add as first line:

```typescript
async () => {
  await emitFakeWebhooks(server, 'get_stats');
  const stats = this.tasks.getSummaryStats();
  // ... rest unchanged
```

- [ ] **Step 9: Build and verify**

```bash
pnpm --filter mcp-task-hub run build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 10: Commit**

```bash
git add apps/mcp-task-hub/src/mcp/fake-webhook-emitter.ts apps/mcp-task-hub/src/mcp/mcp.service.ts
git commit -m "feat(task-hub): emit fake webhook notifications on every tool call"
```

---

## Task 3: Create fake-webhook-emitter for api-crm

**Files:**
- Create: `apps/api-crm/src/mcp/fake-webhook-emitter.ts`

- [ ] **Step 1: Create the file**

Create `apps/api-crm/src/mcp/fake-webhook-emitter.ts` with this exact content:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type EventPool = Record<string, string[]>;

const TOOL_EVENTS: EventPool = {
  search_customers:     ['cache.checked', 'index.scanned', 'metrics.recorded', 'audit.logged'],
  get_customer:         ['cache.checked', 'profile.assembled', 'metrics.recorded', 'audit.logged'],
  create_customer:      ['customer.created', 'crm.synced', 'welcome.email_queued', 'audit.logged', 'index.updated'],
  list_pipeline:        ['cache.checked', 'forecast.calculated', 'metrics.recorded'],
  create_deal:          ['deal.created', 'pipeline.updated', 'rep.notified', 'forecast.recalculated', 'audit.logged'],
  move_deal_stage:      ['deal.stage_changed', 'probability.recalculated', 'manager.notified', 'crm.synced', 'audit.logged'],
  log_activity:         ['activity.logged', 'timeline.updated', 'reminder.set', 'crm.synced', 'audit.logged'],
  get_activity_summary: ['cache.checked', 'timeline.scanned', 'metrics.recorded'],
};

const GENERIC: string[] = ['cache.checked', 'index.scanned', 'metrics.recorded', 'audit.logged'];

function hex(n: number): string {
  return Math.random().toString(16).slice(2, 2 + n);
}

function pickN<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fakePayload(event: string): Record<string, unknown> {
  const custId = `cust-${String(Math.floor(Math.random() * 900) + 100).padStart(3, '0')}`;
  const dealId = `deal-${String(Math.floor(Math.random() * 50) + 1).padStart(3, '0')}`;
  const reps = ['rep-alice', 'rep-bob', 'rep-carol'];
  const rep = reps[Math.floor(Math.random() * reps.length)];

  const map: Record<string, Record<string, unknown>> = {
    'customer.created':       { customerId: custId, createdBy: rep },
    'crm.synced':             { entity: 'customer', id: custId, provider: 'salesforce' },
    'welcome.email_queued':   { recipient: 'user@example.com', template: 'welcome_v2' },
    'profile.assembled':      { customerId: custId, sections: ['deals', 'activities'] },
    'deal.created':           { dealId, customerId: custId, ownerId: rep },
    'pipeline.updated':       { stage: 'prospecting', dealCount: Math.floor(Math.random() * 10) + 1 },
    'rep.notified':           { rep, channel: 'slack' },
    'forecast.recalculated':  { weightedValue: Math.floor(Math.random() * 100000) + 10000 },
    'forecast.calculated':    { weightedValue: Math.floor(Math.random() * 100000) + 10000 },
    'deal.stage_changed':     { dealId, from: 'prospecting', to: 'qualification' },
    'probability.recalculated': { dealId, probability: Math.floor(Math.random() * 80) + 10 },
    'manager.notified':       { rep, channel: 'email' },
    'activity.logged':        { activityId: `act-${hex(4)}`, customerId: custId, type: 'call' },
    'timeline.updated':       { customerId: custId, entries: Math.floor(Math.random() * 20) + 1 },
    'reminder.set':           { dueIn: '24h', assignedTo: rep },
    'timeline.scanned':       { customerId: custId, scannedEntries: Math.floor(Math.random() * 50) + 5 },
    'index.updated':          { entity: 'customer', id: custId },
    'index.scanned':          { scannedRows: Math.floor(Math.random() * 500) + 50 },
    'cache.checked':          { hit: Math.random() > 0.4, ttl: 300 },
    'metrics.recorded':       { metric: 'tool.latency', value: Math.floor(Math.random() * 200) + 20 },
    'audit.logged':           { action: event.split('.')[0], actor: rep },
  };

  return map[event] ?? { event };
}

export async function emitFakeWebhooks(server: McpServer, toolName: string): Promise<void> {
  const pool = TOOL_EVENTS[toolName] ?? GENERIC;
  const count = Math.floor(Math.random() * 3) + 2; // 2–4
  const totalMs = Math.floor(Math.random() * 2001) + 2000; // 2000–4000 ms
  const events = pickN(pool, Math.min(count, pool.length));
  const slotMs = Math.floor(totalMs / events.length);

  for (const event of events) {
    await sleep(slotMs);
    await server.server.notification({
      method: 'notifications/message',
      params: {
        level: 'info',
        data: {
          event,
          webhookId: `wh-${hex(6)}`,
          timestamp: new Date().toISOString(),
          source: 'crm',
          payload: fakePayload(event),
        },
      },
    });
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm --filter api-crm run build
```

Expected: exits 0, no TypeScript errors.

---

## Task 4: Wire emitter into api-crm tool handlers

**Files:**
- Modify: `apps/api-crm/src/mcp/mcp.service.ts`

- [ ] **Step 1: Add the import**

At the top of `apps/api-crm/src/mcp/mcp.service.ts`, after the existing imports, add:

```typescript
import { emitFakeWebhooks } from './fake-webhook-emitter.js';
```

- [ ] **Step 2: Wire into search_customers handler**

Find `async ({ query }) => {` inside `search_customers`. Add as first line:

```typescript
async ({ query }) => {
  await emitFakeWebhooks(server, 'search_customers');
  const results = this.customers.search(query);
  // ... rest unchanged
```

- [ ] **Step 3: Wire into get_customer handler**

Find `async ({ id }) => {` inside `get_customer`. Add as first line:

```typescript
async ({ id }) => {
  await emitFakeWebhooks(server, 'get_customer');
  const customer = this.customers.findById(id);
  // ... rest unchanged
```

- [ ] **Step 4: Wire into create_customer handler**

Find `async (data) => {` inside `create_customer`. Add as first line:

```typescript
async (data) => {
  await emitFakeWebhooks(server, 'create_customer');
  const customer = this.customers.create(data);
  // ... rest unchanged
```

- [ ] **Step 5: Wire into list_pipeline handler**

Find `async ({ ownerId }) => {` inside `list_pipeline`. Add as first line:

```typescript
async ({ ownerId }) => {
  await emitFakeWebhooks(server, 'list_pipeline');
  const allDeals = this.deals.findAll(ownerId ? { ownerId } : undefined);
  // ... rest unchanged
```

- [ ] **Step 6: Wire into create_deal handler**

Find `async (data) => {` inside `create_deal`. Add as first line:

```typescript
async (data) => {
  await emitFakeWebhooks(server, 'create_deal');
  const customer = this.customers.findById(data.customerId);
  // ... rest unchanged
```

- [ ] **Step 7: Wire into move_deal_stage handler**

Find `async ({ dealId, stage, notes, lostReason }) => {` inside `move_deal_stage`. Add as first line:

```typescript
async ({ dealId, stage, notes, lostReason }) => {
  await emitFakeWebhooks(server, 'move_deal_stage');
  const updated = this.deals.moveStage(dealId, stage, notes, lostReason);
  // ... rest unchanged
```

- [ ] **Step 8: Wire into log_activity handler**

Find `async (data) => {` inside `log_activity`. Add as first line:

```typescript
async (data) => {
  await emitFakeWebhooks(server, 'log_activity');
  const customer = this.customers.findById(data.customerId);
  // ... rest unchanged
```

- [ ] **Step 9: Wire into get_activity_summary handler**

Find `async ({ customerId, limit }) => {` inside `get_activity_summary`. Add as first line:

```typescript
async ({ customerId, limit }) => {
  await emitFakeWebhooks(server, 'get_activity_summary');
  const customer = this.customers.findById(customerId);
  // ... rest unchanged
```

- [ ] **Step 10: Build and verify**

```bash
pnpm --filter api-crm run build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 11: Full monorepo build**

```bash
pnpm run build
```

Expected: both apps build clean.

- [ ] **Step 12: Commit**

```bash
git add apps/api-crm/src/mcp/fake-webhook-emitter.ts apps/api-crm/src/mcp/mcp.service.ts
git commit -m "feat(crm): emit fake webhook notifications on every tool call"
```

---

## Manual verification

After `pnpm start:dev`, either:

**Option A — MCP Inspector:**
```bash
pnpm --filter mcp-task-hub run start:inspect
```
Call any tool (e.g. `list_tasks`) and watch the SSE log panel for `notifications/message` events arriving before the tool result.

**Option B — Claude Code:**
Register the servers and call any tool. Log messages streaming in before the response confirm the feature is working.
