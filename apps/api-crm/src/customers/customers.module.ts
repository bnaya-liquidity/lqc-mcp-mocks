import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service.js';
import { CustomersController } from './customers.controller.js';

/**
 * Feature module for the customer domain.
 *
 * Registers both the REST controller (used when running as an HTTP server) and
 * the service. The service is exported so that `CrmMcpModule` can inject it
 * into the MCP facade without duplicating the provider registration.
 */
@Module({
  providers: [CustomersService],
  controllers: [CustomersController],
  exports: [CustomersService],
})
export class CustomersModule {}
