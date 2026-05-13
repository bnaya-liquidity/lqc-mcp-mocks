import { Module } from '@nestjs/common';
import { DealsService } from './deals.service.js';
import { DealsController } from './deals.controller.js';

/**
 * Feature module for the deals/pipeline domain.
 *
 * Exports `DealsService` so `CrmMcpModule` can inject it into the MCP facade
 * alongside `CustomersService` and `ActivitiesService`.
 */
@Module({
  providers: [DealsService],
  controllers: [DealsController],
  exports: [DealsService],
})
export class DealsModule {}
