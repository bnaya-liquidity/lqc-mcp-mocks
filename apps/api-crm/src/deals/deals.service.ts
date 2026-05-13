import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Deal, DealStage } from './deal.types.js';

/**
 * Default win probabilities mapped to each pipeline stage.
 * Automatically applied by `moveStage` so callers never need to supply
 * a probability — it is derived deterministically from the stage.
 */
const STAGE_PROBABILITY: Record<DealStage, number> = {
  prospecting: 10,
  qualification: 25,
  proposal: 50,
  negotiation: 75,
  'closed-won': 100,
  'closed-lost': 0,
};

/**
 * In-memory deal store and pipeline management service.
 *
 * Owns all deal records and provides read, create, and stage-transition
 * operations. Two key aggregation methods — `getPipelineByStage` and
 * `getWeightedPipelineValue` — are used by both the REST pipeline endpoint
 * and the `list_pipeline` MCP tool.
 *
 * Consumed by:
 *   - `DealsController` — REST API (GET /deals, GET /deals/pipeline, …)
 *   - `CrmMcpService`   — MCP tools (list_pipeline, create_deal, move_deal_stage)
 */
@Injectable()
export class DealsService {
  private readonly deals = new Map<string, Deal>();

  constructor() {
    this.seed();
  }

  /**
   * Seeds four demo deals spread across multiple stages and customers so the
   * pipeline view has content in more than one stage from the start.
   * Due dates use relative offsets so they stay "upcoming" after startup.
   */
  private seed() {
    const t = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString();
    const td = (offsetDays: number) => t(offsetDays).split('T')[0];

    const data: Deal[] = [
      {
        id: 'deal-001',
        title: 'TechCorp Enterprise Expansion',
        customerId: 'cust-001',
        stage: 'negotiation',
        value: 150_000,
        currency: 'USD',
        probability: 75,
        expectedCloseDate: td(14),
        ownerId: 'rep-alice',
        notes: 'Expanding from 200 to 500 seats. Legal reviewing MSA.',
        createdAt: t(-30),
        updatedAt: t(-1),
      },
      {
        id: 'deal-002',
        title: 'StartupXYZ Pro Plan Upgrade',
        customerId: 'cust-002',
        stage: 'proposal',
        value: 24_000,
        currency: 'USD',
        probability: 50,
        expectedCloseDate: td(21),
        ownerId: 'rep-bob',
        notes: 'Waiting for budget approval from CEO.',
        createdAt: t(-15),
        updatedAt: t(-3),
      },
      {
        id: 'deal-003',
        title: 'GlobalRetail Initial Contract',
        customerId: 'cust-003',
        stage: 'qualification',
        value: 80_000,
        currency: 'USD',
        probability: 25,
        expectedCloseDate: td(45),
        ownerId: 'rep-alice',
        notes: 'RFP response submitted. Competitor: Salesforce, HubSpot.',
        createdAt: t(-10),
        updatedAt: t(-1),
      },
      {
        id: 'deal-004',
        title: 'MediaPulse Annual Plan',
        customerId: 'cust-004',
        stage: 'closed-won',
        value: 9_600,
        currency: 'USD',
        probability: 100,
        expectedCloseDate: td(-5),
        ownerId: 'rep-carol',
        notes: 'Signed. Kickoff scheduled for next Monday.',
        createdAt: t(-45),
        updatedAt: t(-5),
      },
    ];

    for (const d of data) this.deals.set(d.id, d);
  }

  /**
   * Returns deals matching all supplied filters (AND logic).
   *
   * @param filters  Optional customerId, stage, and/or ownerId filters.
   */
  findAll(filters?: { customerId?: string; stage?: DealStage; ownerId?: string }): Deal[] {
    let result = Array.from(this.deals.values());
    if (filters?.customerId) result = result.filter(d => d.customerId === filters.customerId);
    if (filters?.stage) result = result.filter(d => d.stage === filters.stage);
    if (filters?.ownerId) result = result.filter(d => d.ownerId === filters.ownerId);
    return result;
  }

  /**
   * Looks up a single deal by ID.
   * @returns The deal, or `undefined` if not found.
   */
  findById(id: string): Deal | undefined {
    return this.deals.get(id);
  }

  /**
   * Creates a new deal. The `probability` field is derived automatically
   * from `stage` via `STAGE_PROBABILITY` — callers must not supply it.
   *
   * @param data  All deal fields except `id`, `probability`, `createdAt`, and `updatedAt`.
   */
  create(data: Omit<Deal, 'id' | 'createdAt' | 'updatedAt' | 'probability'>): Deal {
    const now = new Date().toISOString();
    const deal: Deal = {
      id: `deal-${randomUUID().slice(0, 8)}`,
      ...data,
      probability: STAGE_PROBABILITY[data.stage],
      createdAt: now,
      updatedAt: now,
    };
    this.deals.set(deal.id, deal);
    return deal;
  }

  /**
   * Transitions a deal to a new pipeline stage.
   *
   * Automatically updates `probability` to the canonical value for the new
   * stage. Optionally updates `notes` and sets `lostReason` (required for
   * `closed-lost` transitions by convention — not enforced at this layer).
   *
   * @returns The updated deal, or `undefined` if the ID was not found.
   */
  moveStage(id: string, stage: DealStage, notes?: string, lostReason?: string): Deal | undefined {
    const deal = this.deals.get(id);
    if (!deal) return undefined;
    const updated: Deal = {
      ...deal,
      stage,
      probability: STAGE_PROBABILITY[stage],
      notes: notes ?? deal.notes,
      lostReason: lostReason ?? deal.lostReason,
      updatedAt: new Date().toISOString(),
    };
    this.deals.set(id, updated);
    return updated;
  }

  /**
   * Aggregates all deals into a per-stage summary.
   *
   * Returns every stage (including empty ones) so the consumer always gets a
   * complete pipeline view — a missing stage means zero deals, not an error.
   *
   * @returns An object keyed by `DealStage` with `count`, `totalValue`, and
   *          the full `deals` array for each stage.
   */
  getPipelineByStage(): Record<DealStage, { count: number; totalValue: number; deals: Deal[] }> {
    const stages: DealStage[] = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost'];
    const result = {} as Record<DealStage, { count: number; totalValue: number; deals: Deal[] }>;

    for (const stage of stages) {
      const stageDeals = Array.from(this.deals.values()).filter(d => d.stage === stage);
      result[stage] = {
        count: stageDeals.length,
        totalValue: stageDeals.reduce((sum, d) => sum + d.value, 0),
        deals: stageDeals,
      };
    }

    return result;
  }

  /**
   * Calculates the probability-weighted pipeline value.
   *
   * Each open deal contributes `value × (probability / 100)` to the total.
   * `closed-lost` deals are excluded (their probability is 0 anyway, but
   * filtering them out makes intent clearer).
   */
  getWeightedPipelineValue(): number {
    return Array.from(this.deals.values())
      .filter(d => d.stage !== 'closed-lost')
      .reduce((sum, d) => sum + d.value * (d.probability / 100), 0);
  }
}
