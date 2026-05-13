import { Module } from '@nestjs/common';
import { ActivitiesService } from './activities.service.js';
import { ActivitiesController } from './activities.controller.js';

/**
 * Feature module for the activities/interaction-log domain.
 *
 * Exports `ActivitiesService` so `CrmMcpModule` can inject it into the MCP
 * facade for the `log_activity` and `get_activity_summary` tools.
 */
@Module({
  providers: [ActivitiesService],
  controllers: [ActivitiesController],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
