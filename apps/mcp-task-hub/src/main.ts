import 'reflect-metadata';
import * as http from 'node:http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { McpService } from './mcp/mcp.service.js';
import { StderrLogger } from './stderr-logger.js';

const PORT = 3010;

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new StderrLogger(['log', 'warn', 'error']),
  });

  const mcpService = app.get(McpService);
  const transport = await mcpService.start();

  const httpServer = http.createServer(async (req, res) => {
    if (req.url === '/mcp') {
      await transport.handleRequest(req, res);
    } else {
      res.writeHead(404).end('Not found');
    }
  });

  httpServer.listen(PORT, () => {
    process.stderr.write(`task-hub MCP server listening on http://localhost:${PORT}/mcp\n`);
  });

  const shutdown = async () => {
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
    await transport.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch(err => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
