import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ActivitiesService } from './activities.service.js';
import { ActivityType } from './activity.types.js';

/**
 * REST controller for the `/api/activities` resource.
 *
 * Thin adapter over `ActivitiesService` — no business logic here.
 *
 * Routes (all prefixed with `/api`):
 *   GET    /api/activities               List activities with optional filters
 *   GET    /api/activities/:id           Get single activity
 *   POST   /api/activities               Log a new activity
 */
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly service: ActivitiesService) {}

  /**
   * Lists activities sorted most-recent-first. Supports optional query filters:
   *   ?customerId=cust-001
   *   ?dealId=deal-002
   *   ?type=call|email|meeting|demo|note
   *   ?performedBy=rep-alice
   */
  @Get()
  findAll(
    @Query('customerId') customerId?: string,
    @Query('dealId') dealId?: string,
    @Query('type') type?: ActivityType,
    @Query('performedBy') performedBy?: string,
  ) {
    return this.service.findAll({ customerId, dealId, type, performedBy });
  }

  /** Returns a single activity by ID, or `{ error }` if not found. */
  @Get(':id')
  findOne(@Param('id') id: string) {
    const activity = this.service.findById(id);
    if (!activity) return { error: `Activity ${id} not found` };
    return activity;
  }

  /**
   * Logs a new activity. Required body fields: `customerId`, `type`, `subject`,
   * `body`, `performedBy`, `performedAt`. Optional: `dealId`, `direction`,
   * `durationMinutes`.
   */
  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }
}
