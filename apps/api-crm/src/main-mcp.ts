import 'reflect-metadata';
import * as http from 'node:http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { CrmMcpService } from './mcp/mcp.service.js';
import { StderrLogger } from './stderr-logger.js';

const PORT = 3012;

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new StderrLogger(['log', 'warn', 'error']),
  });

  const mcpService = app.get(CrmMcpService);

  // MCP SDK ≥ 1.13 stateless transports cannot be reused across requests.
  // Create a fresh McpServer + transport per POST, then tear them down when
  // the response stream closes.
  const httpServer = http.createServer(async (req, res) => {
    if (req.url !== '/mcp') {
      res.writeHead(404).end('Not found');
      return;
    }

    if (req.method === 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }),
      );
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405).end('Method Not Allowed');
      return;
    }

    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;

      const { server, transport } = await mcpService.createTransport();

      res.on('close', () => {
        transport.close().catch(() => undefined);
        server.close().catch(() => undefined);
      });

      await transport.handleRequest(req, res, body);
    } catch (err) {
      process.stderr.write(`MCP request error: ${err}\n`);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }),
        );
      }
    }
  });

  httpServer.listen(PORT, () => {
    process.stderr.write(`crm-mcp MCP server listening on http://localhost:${PORT}/mcp\n`);
  });

  const shutdown = async () => {
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
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
