import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module.js';
import { DealsModule } from '../deals/deals.module.js';
import { ActivitiesModule } from '../activities/activities.module.js';
import { CrmMcpService } from './mcp.service.js';

/**
 * Feature module that wires the MCP protocol layer for the CRM facade.
 *
 * Imports all three domain modules so their services are available for
 * injection into `CrmMcpService`. Exports `CrmMcpService` so `main-mcp.ts`
 * can retrieve it from the application context to call `start()`.
 */
@Module({
  imports: [CustomersModule, DealsModule, ActivitiesModule],
  providers: [CrmMcpService],
  exports: [CrmMcpService],
})
export class CrmMcpModule {}
