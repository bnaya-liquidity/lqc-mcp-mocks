import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service.js';

/**
 * Feature module that owns the task data layer.
 *
 * Exports `TasksService` so that `McpModule` can inject it into `McpService`
 * without needing to know about its internal implementation details.
 */
@Module({
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
