import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { CustomersService } from './customers.service.js';
import { CustomerStatus, CustomerTier } from './customer.types.js';

/**
 * REST controller for the `/api/customers` resource.
 *
 * Thin HTTP adapter layer — every method delegates directly to
 * `CustomersService` without adding business logic. The same service is also
 * consumed by the MCP facade, which is why no logic lives here.
 *
 * Routes (all prefixed with `/api` by the global prefix in `main.ts`):
 *   GET    /api/customers              List customers with optional filters
 *   GET    /api/customers/search?q=…   Full-text search
 *   GET    /api/customers/:id          Get single customer by ID
 *   POST   /api/customers              Create a new customer
 *   PATCH  /api/customers/:id          Partial update
 */
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  /**
   * Lists customers. Supports optional query filters:
   *   ?status=active|churned|prospect
   *   ?tier=free|starter|pro|enterprise
   *   ?ownerId=rep-alice
   */
  @Get()
  findAll(
    @Query('status') status?: CustomerStatus,
    @Query('tier') tier?: CustomerTier,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.service.findAll({ status, tier, ownerId });
  }

  /**
   * Full-text search across name, email, company, and industry.
   * Query param: `?q=<search term>`
   */
  @Get('search')
  search(@Query('q') q: string) {
    return this.service.search(q ?? '');
  }

  /** Returns a single customer by ID, or `{ error }` if not found. */
  @Get(':id')
  findOne(@Param('id') id: string) {
    const customer = this.service.findById(id);
    if (!customer) return { error: `Customer ${id} not found` };
    return customer;
  }

  /** Creates a new customer from the request body. */
  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  /** Partially updates a customer. Only supplied fields are changed. */
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    const updated = this.service.update(id, body);
    if (!updated) return { error: `Customer ${id} not found` };
    return updated;
  }
}
