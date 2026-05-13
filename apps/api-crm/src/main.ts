import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

/**
 * HTTP entry point for the CRM REST API.
 *
 * Starts a full NestJS HTTP server on port 3011. All routes are prefixed with
 * `/api` so they don't clash if a reverse proxy is added later.
 *
 * This is one of two entry points for `api-crm`. The other (`main-mcp.ts`)
 * starts the same application context without an HTTP server and connects it
 * to the MCP stdio transport instead. Both share the same NestJS modules and
 * in-memory service instances (within the same process).
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  app.setGlobalPrefix('api');
  await app.listen(3011);
  console.log('CRM REST API running on http://localhost:3011/api');
  console.log('  GET  /api/customers');
  console.log('  GET  /api/customers/search?q=techcorp');
  console.log('  GET  /api/deals');
  console.log('  GET  /api/deals/pipeline');
  console.log('  GET  /api/activities');
}

bootstrap().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
