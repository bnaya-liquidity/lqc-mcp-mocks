import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Activity, ActivityType, ActivityDirection } from './activity.types.js';

/**
 * In-memory activity log — stores all customer interactions (calls, emails,
 * meetings, demos, notes) and provides query and aggregation methods.
 *
 * Consumed by:
 *   - `ActivitiesController` — REST API (GET /activities, POST /activities)
 *   - `CrmMcpService`        — MCP tools (log_activity, get_activity_summary)
 */
@Injectable()
export class ActivitiesService {
  private readonly activities = new Map<string, Activity>();

  constructor() {
    this.seed();
  }

  /**
   * Seeds six demo activities linked to the seeded customers and deals,
   * covering all activity types so the data feels realistic for demos.
   */
  private seed() {
    const t = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString();

    const data: Activity[] = [
      {
        id: 'act-001',
        customerId: 'cust-001',
        dealId: 'deal-001',
        type: 'call',
        direction: 'outbound',
        subject: 'Expansion negotiation kick-off',
        body: 'Discussed pricing for 500-seat tier. Sarah confirmed budget approved. Next step: MSA review with their legal team.',
        durationMinutes: 45,
        performedBy: 'rep-alice',
        performedAt: t(-1),
        createdAt: t(-1),
      },
      {
        id: 'act-002',
        customerId: 'cust-001',
        dealId: 'deal-001',
        type: 'email',
        direction: 'outbound',
        subject: 'MSA draft attached',
        body: 'Sent MSA draft v2 with revised SLA terms. Requested redlines by Friday.',
        performedBy: 'rep-alice',
        performedAt: t(-1),
        createdAt: t(-1),
      },
      {
        id: 'act-003',
        customerId: 'cust-002',
        dealId: 'deal-002',
        type: 'meeting',
        direction: 'outbound',
        subject: 'Proposal walkthrough with Marcus + CFO',
        body: 'Walked through ROI calculator and 3-year pricing model. CFO had questions about data residency. Sent follow-up docs.',
        durationMinutes: 60,
        performedBy: 'rep-bob',
        performedAt: t(-3),
        createdAt: t(-3),
      },
      {
        id: 'act-004',
        customerId: 'cust-003',
        dealId: 'deal-003',
        type: 'demo',
        direction: 'outbound',
        subject: 'Product demo for GlobalRetail team',
        body: 'Ran full platform demo for IT + procurement team (6 attendees). Strong interest in reporting module. Requested security questionnaire.',
        durationMinutes: 90,
        performedBy: 'rep-alice',
        performedAt: t(-7),
        createdAt: t(-7),
      },
      {
        id: 'act-005',
        customerId: 'cust-003',
        type: 'email',
        direction: 'inbound',
        subject: 'Re: Security questionnaire',
        body: 'Diana sent back the completed security questionnaire. IT team wants a call to discuss SOC 2 report.',
        performedBy: 'rep-alice',
        performedAt: t(-2),
        createdAt: t(-2),
      },
      {
        id: 'act-006',
        customerId: 'cust-004',
        dealId: 'deal-004',
        type: 'note',
        subject: 'Contract signed - kickoff prep',
        body: 'Contract fully executed. Preparing onboarding materials. Kickoff call booked for next Monday 2pm.',
        performedBy: 'rep-carol',
        performedAt: t(-5),
        createdAt: t(-5),
      },
    ];

    for (const a of data) this.activities.set(a.id, a);
  }

  /**
   * Returns activities matching all supplied filters, sorted most-recent-first
   * by `performedAt`.
   *
   * @param filters  Optional customerId, dealId, type, and/or performedBy filters.
   */
  findAll(filters?: { customerId?: string; dealId?: string; type?: ActivityType; performedBy?: string }): Activity[] {
    let result = Array.from(this.activities.values());
    if (filters?.customerId) result = result.filter(a => a.customerId === filters.customerId);
    if (filters?.dealId) result = result.filter(a => a.dealId === filters.dealId);
    if (filters?.type) result = result.filter(a => a.type === filters.type);
    if (filters?.performedBy) result = result.filter(a => a.performedBy === filters.performedBy);
    return result.sort((a, b) => (a.performedAt < b.performedAt ? 1 : -1));
  }

  /**
   * Looks up a single activity by ID.
   * @returns The activity, or `undefined` if not found.
   */
  findById(id: string): Activity | undefined {
    return this.activities.get(id);
  }

  /**
   * Logs a new activity. `createdAt` is set to now automatically; `performedAt`
   * should reflect when the interaction actually happened (may differ from now
   * if the rep is logging something retroactively).
   *
   * @param data  All activity fields except `id` and `createdAt`.
   */
  create(data: Omit<Activity, 'id' | 'createdAt'>): Activity {
    const now = new Date().toISOString();
    const activity: Activity = { id: `act-${randomUUID().slice(0, 8)}`, ...data, createdAt: now };
    this.activities.set(activity.id, activity);
    return activity;
  }

  /**
   * Returns a summary of all activities for a customer, used by both the
   * `get_customer` tool (as a quick digest) and the `get_activity_summary` tool
   * (as the primary response).
   *
   * @returns Total count, per-type breakdown, and the most recent activity.
   */
  getSummaryForCustomer(customerId: string): {
    total: number;
    byType: Record<ActivityType, number>;
    lastActivity?: Activity;
  } {
    const customerActivities = this.findAll({ customerId });
    const byType = { call: 0, email: 0, meeting: 0, demo: 0, note: 0 } as Record<ActivityType, number>;
    for (const a of customerActivities) byType[a.type]++;
    return {
      total: customerActivities.length,
      byType,
      lastActivity: customerActivities[0],
    };
  }
}
