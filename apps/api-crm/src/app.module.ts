import { Module } from '@nestjs/common';
import { CustomersModule } from './customers/customers.module.js';
import { DealsModule } from './deals/deals.module.js';
import { ActivitiesModule } from './activities/activities.module.js';
import { CrmMcpModule } from './mcp/mcp.module.js';

/**
 * Root NestJS module for the CRM application.
 *
 * Composes the three domain feature modules and the MCP facade module:
 *   - `CustomersModule`  — customer records and search
 *   - `DealsModule`      — pipeline management
 *   - `ActivitiesModule` — activity log (calls, emails, meetings)
 *   - `CrmMcpModule`     — MCP facade that wires the above services to tools
 *
 * This module is shared by both entry points:
 *   - `main.ts`      — creates an HTTP server, uses the REST controllers
 *   - `main-mcp.ts`  — creates only a DI context, uses `CrmMcpService`
 */
@Module({
  imports: [CustomersModule, DealsModule, ActivitiesModule, CrmMcpModule],
})
export class AppModule {}
