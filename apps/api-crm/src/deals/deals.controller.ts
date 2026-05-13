import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { DealsService } from './deals.service.js';
import { DealStage } from './deal.types.js';

/**
 * REST controller for the `/api/deals` resource.
 *
 * Thin adapter over `DealsService` — no business logic here.
 *
 * Routes (all prefixed with `/api`):
 *   GET    /api/deals                   List deals with optional filters
 *   GET    /api/deals/pipeline          Aggregated pipeline view by stage
 *   GET    /api/deals/:id               Get single deal
 *   POST   /api/deals                   Create a new deal
 *   PATCH  /api/deals/:id/stage         Transition deal to a new stage
 */
@Controller('deals')
export class DealsController {
  constructor(private readonly service: DealsService) {}

  /**
   * Lists deals. Supports optional query filters:
   *   ?customerId=cust-001
   *   ?stage=negotiation
   *   ?ownerId=rep-alice
   */
  @Get()
  findAll(
    @Query('customerId') customerId?: string,
    @Query('stage') stage?: DealStage,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.service.findAll({ customerId, stage, ownerId });
  }

  /**
   * Returns the full pipeline grouped by stage plus the weighted pipeline
   * value (sum of `value × probability` across all open deals).
   */
  @Get('pipeline')
  pipeline() {
    return {
      byStage: this.service.getPipelineByStage(),
      weightedValue: this.service.getWeightedPipelineValue(),
    };
  }

  /** Returns a single deal by ID, or `{ error }` if not found. */
  @Get(':id')
  findOne(@Param('id') id: string) {
    const deal = this.service.findById(id);
    if (!deal) return { error: `Deal ${id} not found` };
    return deal;
  }

  /** Creates a new deal. `probability` is derived from `stage` automatically. */
  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  /**
   * Transitions a deal to a new stage.
   * Body fields: `stage` (required), `notes` (optional), `lostReason` (required
   * when moving to `closed-lost`).
   */
  @Patch(':id/stage')
  moveStage(
    @Param('id') id: string,
    @Body('stage') stage: DealStage,
    @Body('notes') notes?: string,
    @Body('lostReason') lostReason?: string,
  ) {
    const updated = this.service.moveStage(id, stage, notes, lostReason);
    if (!updated) return { error: `Deal ${id} not found` };
    return updated;
  }
}
