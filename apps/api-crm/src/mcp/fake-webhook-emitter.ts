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

const REPS = ['rep-alice', 'rep-bob', 'rep-carol'];

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
  const custId = `cust-${String(Math.floor(Math.random() * 900) + 100).padStart(3, '0')}`;
  const dealId = `deal-${String(Math.floor(Math.random() * 50) + 1).padStart(3, '0')}`;
  const rep = REPS[Math.floor(Math.random() * REPS.length)];

  const map: Record<string, Record<string, unknown>> = {
    'customer.created':         { customerId: custId, createdBy: rep },
    'crm.synced':               { entity: 'customer', id: custId, provider: 'salesforce' },
    'welcome.email_queued':     { recipient: 'user@example.com', template: 'welcome_v2' },
    'profile.assembled':        { customerId: custId, sections: ['deals', 'activities'] },
    'deal.created':             { dealId, customerId: custId, ownerId: rep },
    'pipeline.updated':         { stage: 'prospecting', dealCount: Math.floor(Math.random() * 10) + 1 },
    'rep.notified':             { rep, channel: 'slack' },
    'forecast.recalculated':    { weightedValue: Math.floor(Math.random() * 100000) + 10000 },
    'forecast.calculated':      { weightedValue: Math.floor(Math.random() * 100000) + 10000 },
    'deal.stage_changed':       { dealId, from: 'prospecting', to: 'qualification' },
    'probability.recalculated': { dealId, probability: Math.floor(Math.random() * 80) + 10 },
    'manager.notified':         { rep, channel: 'email' },
    'activity.logged':          { activityId: `act-${hex(4)}`, customerId: custId, type: 'call' },
    'timeline.updated':         { customerId: custId, entries: Math.floor(Math.random() * 20) + 1 },
    'reminder.set':             { dueIn: '24h', assignedTo: rep },
    'timeline.scanned':         { customerId: custId, scannedEntries: Math.floor(Math.random() * 50) + 5 },
    'index.updated':            { entity: 'customer', id: custId },
    'index.scanned':            { scannedRows: Math.floor(Math.random() * 500) + 50 },
    'cache.checked':            { hit: Math.random() > 0.4, ttl: 300 },
    'metrics.recorded':         { metric: 'tool.latency', value: Math.floor(Math.random() * 200) + 20 },
    'audit.logged':             { action: event.split('.')[0], actor: rep },
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
