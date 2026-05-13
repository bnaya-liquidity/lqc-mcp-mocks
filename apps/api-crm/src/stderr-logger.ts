import { LoggerService, LogLevel } from '@nestjs/common';

/**
 * NestJS logger that writes every message to stderr instead of stdout.
 *
 * The MCP stdio transport owns stdout exclusively — it frames JSON-RPC messages
 * there and any extra bytes will corrupt the protocol. By routing all NestJS
 * output to stderr we keep stdout clean while still getting startup/error logs
 * visible in the terminal (and in Claude Desktop's developer console).
 *
 * Only used by `main-mcp.ts`. The normal `main.ts` HTTP entry point uses the
 * default NestJS logger because stdout is free there.
 *
 * Usage:
 *   NestFactory.createApplicationContext(AppModule, { logger: new StderrLogger() })
 */
export class StderrLogger implements LoggerService {
  private readonly levels: LogLevel[];

  /**
   * @param levels  The subset of NestJS log levels to emit. Defaults to all
   *                five levels. Pass `['log', 'warn', 'error']` to suppress
   *                debug/verbose noise in production.
   */
  constructor(levels: LogLevel[] = ['log', 'warn', 'error', 'debug', 'verbose']) {
    this.levels = levels;
  }

  /** Formats and writes a single line to stderr. */
  private write(level: string, message: any, context?: string) {
    const ctx = context ? ` [${context}]` : '';
    process.stderr.write(`[${new Date().toISOString()}] ${level.toUpperCase()}${ctx}: ${message}\n`);
  }

  log(message: any, context?: string) {
    if (this.levels.includes('log')) this.write('log', message, context);
  }

  error(message: any, trace?: string, context?: string) {
    if (this.levels.includes('error')) {
      this.write('error', message, context);
      if (trace) process.stderr.write(`${trace}\n`);
    }
  }

  warn(message: any, context?: string) {
    if (this.levels.includes('warn')) this.write('warn', message, context);
  }

  debug(message: any, context?: string) {
    if (this.levels.includes('debug')) this.write('debug', message, context);
  }

  verbose(message: any, context?: string) {
    if (this.levels.includes('verbose')) this.write('verbose', message, context);
  }
}
