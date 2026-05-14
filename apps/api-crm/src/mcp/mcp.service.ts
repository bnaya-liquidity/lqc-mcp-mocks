import { Injectable, Logger } from '@nestjs/common';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { CustomersService } from '../customers/customers.service.js';
import { DealsService } from '../deals/deals.service.js';
import { ActivitiesService } from '../activities/activities.service.js';

/**
 * MCP facade over the CRM REST API.
 *
 * Uses the stateless per-request pattern required by MCP SDK ≥ 1.13:
 * `StreamableHTTPServerTransport` with `sessionIdGenerator: undefined` cannot
 * be reused across requests, so `createTransport()` builds a fresh
 * McpServer + transport per POST and returns both for `main-mcp.ts` to use.
 *
 * The three NestJS service singletons are shared across all per-request
 * servers — only the MCP protocol layer is recreated per request.
 *
 * The key architectural principle is the **facade pattern**: MCP tools call
 * the same service methods as the REST API — no HTTP hop, single implementation.
 */
@Injectable()
export class CrmMcpService {
  private readonly logger = new Logger(CrmMcpService.name);

  constructor(
    private readonly customers: CustomersService,
    private readonly deals: DealsService,
    private readonly activities: ActivitiesService,
  ) {}

  // ─── Transport ────────────────────────────────────────────────────────────

  /**
   * Creates a fresh McpServer + transport for a single stateless HTTP request.
   * Call `transport.handleRequest(req, res, body)` after this, then close both
   * on `res.on('close')`.
   */
  async createTransport(): Promise<{ server: McpServer; transport: StreamableHTTPServerTransport }> {
    const server = new McpServer(
      { name: 'crm-facade', version: '1.0.0' },
      {
        // `instructions` is injected verbatim into Claude's system prompt.
        // These hints tell Claude the correct order to call tools.
        instructions:
          'Use search_customers to find customer IDs before calling get_customer or log_activity. ' +
          'Call list_pipeline for an overview before working with specific deals. ' +
          'Always include the customer ID when creating deals or logging activities.',
      },
    );

    this.registerTools(server);
    this.registerResources(server);
    this.registerPrompts(server);

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    this.logger.log('CRM MCP facade connected via HTTP transport (per-request)');
    return { server, transport };
  }

  // ─── Tools ────────────────────────────────────────────────────────────────
  //
  // Eight tools covering the core CRM workflow:
  //   Discovery:    search_customers, list_pipeline
  //   Read:         get_customer, get_activity_summary
  //   Write:        create_customer, create_deal, move_deal_stage, log_activity
  //
  // All read tools carry `readOnlyHint: true` so Claude Desktop can auto-approve
  // them. Write tools omit it (default: false) to keep the confirmation prompt.

  private registerTools(server: McpServer) {
    // ── search_customers ─────────────────────────────────────────────────────
    // Entry point for most CRM workflows — returns IDs needed by other tools.
    server.registerTool(
      'search_customers',
      {
        title: 'Search Customers',
        description:
          'Search customers by name, email, company, or industry. Returns lightweight summaries. ' +
          'Use get_customer to fetch full profile and deal history for a specific customer.',
        inputSchema: {
          query: z.string().min(1).describe('Search term matched against name, email, company, or industry.'),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ query }) => {
        const results = this.customers.search(query);
        if (results.length === 0) {
          return {
            content: [{ type: 'text', text: `No customers found matching "${query}".` }],
          };
        }
        return {
          content: [
            {
              type: 'text',
              // Return a slim projection — full Customer objects include notes
              // and other fields that aren't needed for a search result list.
              text: JSON.stringify(
                {
                  count: results.length,
                  customers: results.map(c => ({
                    id: c.id,
                    name: c.name,
                    email: c.email,
                    company: c.company,
                    tier: c.tier,
                    status: c.status,
                    industry: c.industry,
                    ownerId: c.ownerId,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // ── get_customer ──────────────────────────────────────────────────────────
    // Returns the full profile — customer + deals + activity summary in one call
    // so Claude doesn't have to make three separate tool calls.
    server.registerTool(
      'get_customer',
      {
        title: 'Get Customer Profile',
        description:
          "Fetch a customer's full profile including all deals and activity summary. " +
          'Use search_customers first to find the customer ID.',
        inputSchema: {
          id: z
            .string()
            .describe('Customer ID (e.g. cust-001). Get IDs from search_customers.'),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ id }) => {
        const customer = this.customers.findById(id);
        if (!customer) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Customer "${id}" not found. Use search_customers to find valid IDs.`,
              },
            ],
          };
        }
        const customerDeals = this.deals.findAll({ customerId: id });
        const activitySummary = this.activities.getSummaryForCustomer(id);
        const recentActivities = this.activities.findAll({ customerId: id }).slice(0, 5);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { customer, deals: customerDeals, activitySummary, recentActivities },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // ── create_customer ───────────────────────────────────────────────────────
    server.registerTool(
      'create_customer',
      {
        title: 'Create Customer',
        description:
          'Create a new customer record. Check search_customers first to avoid duplicates.',
        inputSchema: {
          name: z.string().min(1).describe('Full name of the primary contact.'),
          email: z.string().email().describe('Primary email address.'),
          company: z.string().min(1).describe('Company or organisation name.'),
          industry: z.string().describe('Industry sector (e.g. "Technology", "Healthcare").'),
          phone: z.string().optional().describe('Phone number in international format.'),
          tier: z
            .enum(['free', 'starter', 'pro', 'enterprise'])
            .default('free')
            .describe('Subscription tier.'),
          status: z
            .enum(['active', 'churned', 'prospect'])
            .default('prospect')
            .describe('Customer status.'),
          website: z.string().optional().describe('Company website URL.'),
          notes: z.string().optional().describe('Internal notes about the customer.'),
          ownerId: z.string().describe('ID of the rep who owns this account (e.g. "rep-alice").'),
        },
        annotations: { destructiveHint: false, idempotentHint: false },
      },
      async (data) => {
        const customer = this.customers.create(data);
        return {
          content: [
            {
              type: 'text',
              text: `Created customer ${customer.id}.\n\n${JSON.stringify(customer, null, 2)}`,
            },
          ],
        };
      },
    );

    // ── list_pipeline ─────────────────────────────────────────────────────────
    // Returns deal IDs + the full stage breakdown — the canonical starting point
    // before working with any specific deal.
    server.registerTool(
      'list_pipeline',
      {
        title: 'List Pipeline',
        description:
          'Return an overview of all deals grouped by stage, with deal counts, total values, and weighted pipeline value. ' +
          'Use this before working with specific deals — it shows all deal IDs.',
        inputSchema: {
          ownerId: z
            .string()
            .optional()
            .describe('Filter pipeline to a specific rep (e.g. "rep-alice"). Omit for full team pipeline.'),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ ownerId }) => {
        const allDeals = this.deals.findAll(ownerId ? { ownerId } : undefined);
        const pipeline = this.deals.getPipelineByStage();
        const weightedValue = this.deals.getWeightedPipelineValue();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  summary: {
                    totalDeals: allDeals.length,
                    weightedPipelineValue: Math.round(weightedValue),
                    currency: 'USD',
                  },
                  pipeline,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // ── create_deal ───────────────────────────────────────────────────────────
    server.registerTool(
      'create_deal',
      {
        title: 'Create Deal',
        description:
          'Create a new deal linked to a customer. ' +
          'Use search_customers to find the customer ID first.',
        inputSchema: {
          title: z.string().min(1).describe('Deal name (e.g. "Acme Corp — Enterprise Upgrade").'),
          customerId: z
            .string()
            .describe('Customer ID. Get from search_customers.'),
          stage: z
            .enum(['prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost'])
            .default('prospecting')
            .describe('Initial pipeline stage.'),
          value: z.number().positive().describe('Expected deal value in the account currency.'),
          currency: z.string().length(3).default('USD').describe('ISO 4217 currency code.'),
          expectedCloseDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .describe('Expected close date in YYYY-MM-DD format.'),
          ownerId: z.string().describe('Rep who owns this deal (e.g. "rep-alice").'),
          notes: z.string().optional().describe('Initial notes or context for the deal.'),
        },
        annotations: { destructiveHint: false, idempotentHint: false },
      },
      async (data) => {
        // Validate customer exists before creating the deal to give Claude a
        // clear error message rather than a dangling foreign key.
        const customer = this.customers.findById(data.customerId);
        if (!customer) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Customer "${data.customerId}" not found. Use search_customers to find a valid customer ID.`,
              },
            ],
          };
        }
        const deal = this.deals.create(data);
        return {
          content: [
            {
              type: 'text',
              text: `Created deal ${deal.id} for customer ${customer.name} (${customer.company}).\n\n${JSON.stringify(deal, null, 2)}`,
            },
          ],
        };
      },
    );

    // ── move_deal_stage ───────────────────────────────────────────────────────
    server.registerTool(
      'move_deal_stage',
      {
        title: 'Move Deal Stage',
        description:
          'Advance or revert a deal to a different pipeline stage. ' +
          'Probability is automatically updated based on the new stage. ' +
          'Use list_pipeline to see current deal IDs and stages.',
        inputSchema: {
          dealId: z
            .string()
            .describe('Deal ID (e.g. deal-001). Get IDs from list_pipeline.'),
          stage: z
            .enum(['prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost'])
            .describe('New stage to move the deal to.'),
          notes: z.string().optional().describe('Notes about why the stage changed.'),
          lostReason: z
            .string()
            .optional()
            .describe('Required when moving to closed-lost. Explain why the deal was lost.'),
        },
        annotations: { destructiveHint: false, idempotentHint: true },
      },
      async ({ dealId, stage, notes, lostReason }) => {
        const updated = this.deals.moveStage(dealId, stage, notes, lostReason);
        if (!updated) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Deal "${dealId}" not found. Use list_pipeline to find valid deal IDs.` }],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Moved deal ${dealId} to "${stage}" (probability: ${updated.probability}%).\n\n${JSON.stringify(updated, null, 2)}`,
            },
          ],
        };
      },
    );

    // ── log_activity ──────────────────────────────────────────────────────────
    server.registerTool(
      'log_activity',
      {
        title: 'Log Activity',
        description:
          'Log a sales activity (call, email, meeting, demo, note) against a customer and optionally a deal.',
        inputSchema: {
          customerId: z
            .string()
            .describe('Customer ID the activity relates to. Get from search_customers.'),
          type: z
            .enum(['call', 'email', 'meeting', 'demo', 'note'])
            .describe('Type of activity.'),
          subject: z.string().min(1).describe('Short subject line for the activity.'),
          body: z.string().min(1).describe('Full description or notes from the activity.'),
          performedBy: z.string().describe('Rep who performed the activity (e.g. "rep-alice").'),
          performedAt: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/)
            .describe("When the activity happened (ISO 8601). Use today's date if unsure."),
          dealId: z
            .string()
            .optional()
            .describe('Deal ID to link this activity to. Optional — get IDs from list_pipeline.'),
          direction: z
            .enum(['inbound', 'outbound'])
            .optional()
            .describe('Whether the activity was initiated by us (outbound) or by the customer (inbound).'),
          durationMinutes: z.number().int().positive().optional().describe('Duration in minutes for calls and meetings.'),
        },
        annotations: { destructiveHint: false, idempotentHint: false },
      },
      async (data) => {
        const customer = this.customers.findById(data.customerId);
        if (!customer) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Customer "${data.customerId}" not found. Use search_customers to find valid IDs.` }],
          };
        }
        const activity = this.activities.create(data);
        return {
          content: [
            {
              type: 'text',
              text: `Logged ${activity.type} activity ${activity.id} for ${customer.name} (${customer.company}).\n\n${JSON.stringify(activity, null, 2)}`,
            },
          ],
        };
      },
    );

    // ── get_activity_summary ──────────────────────────────────────────────────
    server.registerTool(
      'get_activity_summary',
      {
        title: 'Get Activity Summary',
        description:
          'Return all recent activities for a customer with a breakdown by type. ' +
          'Useful for preparing for a call or reviewing account history.',
        inputSchema: {
          customerId: z
            .string()
            .describe('Customer ID. Get from search_customers.'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(10)
            .describe('Max number of activities to return. Most recent first.'),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ customerId, limit }) => {
        const customer = this.customers.findById(customerId);
        if (!customer) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Customer "${customerId}" not found.` }],
          };
        }
        const summary = this.activities.getSummaryForCustomer(customerId);
        const recent = this.activities.findAll({ customerId }).slice(0, limit);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ customer: { id: customer.id, name: customer.name, company: customer.company }, summary, recentActivities: recent }, null, 2),
            },
          ],
        };
      },
    );
  }

  // ─── Resources ────────────────────────────────────────────────────────────

  private registerResources(server: McpServer) {
    // Pipeline snapshot — host can pull this into context before a pipeline review
    server.registerResource(
      'pipeline',
      'crm://pipeline',
      {
        description: 'Full pipeline view with all deals grouped by stage, values, and weighted total.',
        mimeType: 'application/json',
      },
      async (uri) => {
        const pipeline = this.deals.getPipelineByStage();
        const weightedValue = this.deals.getWeightedPipelineValue();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(
                { generatedAt: new Date().toISOString(), weightedPipelineValue: Math.round(weightedValue), pipeline },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Per-customer profile template — `list` callback enumerates all customers
    // so the host can show a picker with all available customer URIs.
    server.registerResource(
      'customer-profile',
      new ResourceTemplate('crm://customers/{id}', {
        list: async () => {
          const all = this.customers.findAll();
          return {
            resources: all.map(c => ({
              uri: `crm://customers/${c.id}`,
              name: `${c.name} (${c.company})`,
              mimeType: 'application/json',
            })),
          };
        },
      }),
      {
        description: 'Full customer record with deals and activities. Use crm://pipeline to browse all customers.',
      },
      async (uri, { id }) => {
        const customer = this.customers.findById(id as string);
        if (!customer) {
          return { contents: [{ uri: uri.href, text: JSON.stringify({ error: `Customer ${id} not found` }) }] };
        }
        const customerDeals = this.deals.findAll({ customerId: id as string });
        const activitySummary = this.activities.getSummaryForCustomer(id as string);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ customer, deals: customerDeals, activitySummary }, null, 2),
            },
          ],
        };
      },
    );
  }

  // ─── Prompts ──────────────────────────────────────────────────────────────

  private registerPrompts(server: McpServer) {
    // customer_brief — pre-call preparation, enriches context with live CRM data
    server.registerPrompt(
      'customer_brief',
      {
        title: 'Customer Brief',
        description: 'Generate a concise briefing document to prepare for a customer call or meeting.',
        argsSchema: {
          customerId: z.string().describe('Customer ID to generate the brief for.'),
          meetingPurpose: z
            .string()
            .optional()
            .describe('What the meeting is about (e.g. "renewal negotiation", "QBR").'),
        },
      },
      ({ customerId, meetingPurpose }) => {
        const customer = this.customers.findById(customerId);
        const customerDeals = this.deals.findAll({ customerId });
        const summary = this.activities.getSummaryForCustomer(customerId);
        const recentActivities = this.activities.findAll({ customerId }).slice(0, 3);

        const context = JSON.stringify(
          { customer, deals: customerDeals, activitySummary: summary, recentActivities },
          null,
          2,
        );
        const purposeLine = meetingPurpose ? ` for a "${meetingPurpose}" meeting` : '';

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text:
                  `Generate a concise customer brief${purposeLine}.\n\n` +
                  `Include:\n` +
                  `- **Account overview** (tier, status, industry)\n` +
                  `- **Open deals** and their current stage\n` +
                  `- **Recent interactions** (last 3 activities)\n` +
                  `- **Key talking points** based on current deal stage\n` +
                  `- **Risks or opportunities** to watch\n\n` +
                  `Customer data:\n${context}`,
              },
            },
          ],
        };
      },
    );

    // pipeline_review — weekly team review, optionally scoped to a rep or stage
    server.registerPrompt(
      'pipeline_review',
      {
        title: 'Pipeline Review',
        description: 'Generate a weekly pipeline review summarising deal health, risks, and next actions.',
        argsSchema: {
          ownerId: z.string().optional().describe('Filter to a specific rep (e.g. "rep-alice"). Omit for full team.'),
          focusStage: z
            .string()
            .optional()
            .describe('Stage to focus on (e.g. "negotiation"). Omit for full pipeline.'),
        },
      },
      ({ ownerId, focusStage }) => {
        const pipeline = this.deals.getPipelineByStage();
        const weightedValue = this.deals.getWeightedPipelineValue();
        const scope = ownerId ? `for ${ownerId}` : 'for the full team';
        const focus = focusStage ? ` Focus especially on the "${focusStage}" stage.` : '';

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text:
                  `Generate a weekly pipeline review ${scope}.${focus}\n\n` +
                  `Include:\n` +
                  `- **Pipeline health summary** (counts and values per stage)\n` +
                  `- **Weighted pipeline value**: $${Math.round(weightedValue).toLocaleString()}\n` +
                  `- **At-risk deals** (stuck in stage or approaching close date)\n` +
                  `- **Hot deals** ready to advance\n` +
                  `- **Recommended next actions** for each open deal\n\n` +
                  `Pipeline data:\n${JSON.stringify(pipeline, null, 2)}`,
              },
            },
          ],
        };
      },
    );
  }
}
