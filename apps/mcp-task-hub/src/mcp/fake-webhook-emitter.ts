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

const USERS = ['alice', 'bob', 'carol', 'dave'];

function hex(n: number): string {
  return Math.random().toString(16).padEnd(n + 2, '0').slice(2, 2 + n);
}

function pickN<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fakePayload(event: string): Record<string, unknown> {
  const taskId = `task-${String(Math.floor(Math.random() * 900) + 100)}`;
  const user = USERS[Math.floor(Math.random() * USERS.length)];

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
