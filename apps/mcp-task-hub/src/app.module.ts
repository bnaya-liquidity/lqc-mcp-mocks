import { Module } from '@nestjs/common';
import { TasksModule } from './tasks/tasks.module.js';
import { McpModule } from './mcp/mcp.module.js';

/**
 * Root NestJS module for the MCP Task Hub server.
 *
 * Composes the two feature modules:
 *   - `TasksModule`  — in-memory task store and business logic
 *   - `McpModule`    — MCP server wiring (tools, resources, prompts)
 *
 * There is no HTTP adapter. This module is bootstrapped via
 * `NestFactory.createApplicationContext` which starts the DI container only.
 */
@Module({
  imports: [TasksModule, McpModule],
})
export class AppModule {}
