import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module.js';
import { McpService } from './mcp.service.js';

/**
 * Feature module that wires the MCP protocol layer.
 *
 * Imports `TasksModule` to obtain `TasksService`, which `McpService` calls
 * from inside every tool handler. Exports `McpService` so `AppModule` can
 * retrieve it after bootstrap to call `McpService.start()`.
 */
@Module({
  imports: [TasksModule],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}
