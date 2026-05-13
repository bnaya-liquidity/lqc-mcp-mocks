import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { TasksService } from '../tasks/tasks.service.js';

/**
 * Core MCP service for the Task Hub server.
 *
 * This class is the bridge between NestJS (dependency injection, lifecycle
 * hooks) and the MCP SDK (`McpServer`). It:
 *
 *   1. Creates and configures the `McpServer` instance in the constructor,
 *      including the `instructions` string that is injected directly into
 *      Claude's system prompt for every conversation.
 *   2. Registers all tools, resources, and prompts in `onModuleInit` — called
 *      automatically by NestJS after all providers are instantiated, so
 *      `TasksService` is guaranteed to be ready.
 *   3. Exposes `start()`, which connects an HTTP transport and returns it so
 *      `main.ts` can mount it on a `node:http` server.
 *
 * Tool handlers call `this.tasks.*` methods directly — there is no HTTP hop.
 */
@Injectable()
export class McpService implements OnModuleInit {
  private readonly logger = new Logger(McpService.name);
  private readonly server: McpServer;

  constructor(private readonly tasks: TasksService) {
    this.server = new McpServer(
      { name: 'task-hub', version: '1.0.0' },
      {
        // `instructions` lands verbatim in Claude's system prompt for every
        // session. Use it for cross-tool hints that don't fit naturally in any
        // single tool description.
        instructions:
          'Call list_tasks or get_task before update_task or delete_task — task IDs are not guessable. ' +
          'When creating tasks, check existing ones first to avoid duplicates. ' +
          'Use daily_standup prompt for a formatted standup report.',
      },
    );
  }

  /** Registers all MCP primitives once NestJS DI is fully resolved. */
  onModuleInit() {
    this.registerTools();
    this.registerResources();
    this.registerPrompts();
    this.logger.log('MCP tools, resources, and prompts registered');
  }

  // ─── Tools ────────────────────────────────────────────────────────────────
  //
  // Each tool follows the same pattern:
  //   registerTool(name, { title, description, inputSchema, annotations }, handler)
  //
  // `description`  — read by Claude to decide whether to call the tool.
  //                  Say what it does, what it returns, and what it does NOT do.
  // `inputSchema`  — Zod schema; each field's `.describe()` becomes the JSON
  //                  Schema `description` Claude sees when filling in arguments.
  // `annotations`  — hints for the host UI (readOnlyHint, destructiveHint, …).

  private registerTools() {
    // ── list_tasks ──────────────────────────────────────────────────────────
    this.server.registerTool(
      'list_tasks',
      {
        title: 'List Tasks',
        description:
          'List tasks with optional filters. Returns tasks sorted by most recently updated. ' +
          'Use get_task to fetch a single task with full comment history.',
        inputSchema: {
          status: z
            .enum(['todo', 'in-progress', 'done', 'cancelled'])
            .optional()
            .describe('Filter by status. Omit to return all statuses.'),
          project: z.string().optional().describe('Filter by project name (case-insensitive).'),
          priority: z
            .enum(['low', 'medium', 'high', 'urgent'])
            .optional()
            .describe('Filter by priority level.'),
          assignee: z.string().optional().describe('Filter by assignee username.'),
          tag: z.string().optional().describe('Filter tasks that include this tag.'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ status, project, priority, assignee, tag }) => {
        const result = this.tasks.findAll({ status, project, priority, assignee, tag });
        const summary = `${result.length} task(s) found`;
        return {
          content: [
            {
              type: 'text',
              // Return a lightweight summary list rather than the full Task
              // objects to save context-window tokens. Use get_task for details.
              text: JSON.stringify(
                {
                  summary,
                  tasks: result.map(t => ({
                    id: t.id,
                    title: t.title,
                    status: t.status,
                    priority: t.priority,
                    project: t.project,
                    assignee: t.assignee,
                    dueDate: t.dueDate,
                    tags: t.tags,
                    commentCount: t.comments.length,
                    updatedAt: t.updatedAt,
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

    // ── get_task ─────────────────────────────────────────────────────────────
    this.server.registerTool(
      'get_task',
      {
        title: 'Get Task',
        description:
          'Fetch a single task by ID including full description and all comments. ' +
          'Use list_tasks first to discover task IDs.',
        inputSchema: {
          id: z.string().describe('Task ID (e.g. task-001). Get IDs from list_tasks.'),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ id }) => {
        const task = this.tasks.findById(id);
        if (!task) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Task "${id}" not found. Use list_tasks to discover valid task IDs.`,
              },
            ],
          };
        }
        return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
      },
    );

    // ── create_task ──────────────────────────────────────────────────────────
    this.server.registerTool(
      'create_task',
      {
        title: 'Create Task',
        description:
          'Create a new task. Returns the created task with its generated ID. ' +
          'Does NOT check for duplicates — call list_tasks first if unsure.',
        inputSchema: {
          title: z.string().min(1).max(200).describe('Short, action-oriented task title.'),
          description: z
            .string()
            .optional()
            .describe('Detailed description. Markdown supported.'),
          priority: z
            .enum(['low', 'medium', 'high', 'urgent'])
            .default('medium')
            .describe('Task priority. Defaults to medium.'),
          project: z
            .string()
            .optional()
            .describe('Project name to group this task under (e.g. "Frontend").'),
          assignee: z.string().optional().describe('Username of the person responsible.'),
          dueDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .describe('Due date in YYYY-MM-DD format.'),
          tags: z.array(z.string()).default([]).describe('Labels for categorisation (e.g. ["bug", "api"]).'),
        },
        annotations: { destructiveHint: false, idempotentHint: false },
      },
      async ({ title, description, priority, project, assignee, dueDate, tags }) => {
        const task = this.tasks.create({ title, description, priority, project, assignee, dueDate, tags });
        return {
          content: [
            {
              type: 'text',
              text: `Created task ${task.id}.\n\n${JSON.stringify(task, null, 2)}`,
            },
          ],
        };
      },
    );

    // ── update_task ──────────────────────────────────────────────────────────
    this.server.registerTool(
      'update_task',
      {
        title: 'Update Task',
        description:
          'Update one or more fields on an existing task. ' +
          'Only supply the fields you want to change — omitted fields are left unchanged.',
        inputSchema: {
          id: z.string().describe('Task ID to update. Get IDs from list_tasks.'),
          title: z.string().min(1).max(200).optional().describe('New title.'),
          description: z.string().optional().describe('New description. Replaces the existing one.'),
          status: z
            .enum(['todo', 'in-progress', 'done', 'cancelled'])
            .optional()
            .describe('New status.'),
          priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().describe('New priority.'),
          project: z.string().optional().describe('Move task to a different project.'),
          assignee: z.string().optional().describe('Reassign to a different user.'),
          dueDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .describe('New due date in YYYY-MM-DD format.'),
          tags: z.array(z.string()).optional().describe('Replace the full tag list.'),
        },
        annotations: { destructiveHint: false, idempotentHint: true },
      },
      async ({ id, ...updates }) => {
        const task = this.tasks.update(id, updates);
        if (!task) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Task "${id}" not found. Use list_tasks to find valid IDs.` }],
          };
        }
        return {
          content: [{ type: 'text', text: `Updated task ${task.id}.\n\n${JSON.stringify(task, null, 2)}` }],
        };
      },
    );

    // ── delete_task ──────────────────────────────────────────────────────────
    this.server.registerTool(
      'delete_task',
      {
        title: 'Delete Task',
        description:
          'Permanently delete a task and all its comments. This cannot be undone. ' +
          'Consider using update_task to set status to "cancelled" instead.',
        inputSchema: {
          id: z.string().describe('Task ID to delete. Get IDs from list_tasks.'),
        },
        // destructiveHint: true tells Claude Desktop to show a confirmation
        // dialog before auto-approving this tool call.
        annotations: { destructiveHint: true, idempotentHint: false },
      },
      async ({ id }) => {
        const exists = this.tasks.findById(id);
        if (!exists) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Task "${id}" not found.` }],
          };
        }
        this.tasks.delete(id);
        return {
          content: [{ type: 'text', text: `Deleted task "${id}" (${exists.title}).` }],
        };
      },
    );

    // ── add_comment ──────────────────────────────────────────────────────────
    this.server.registerTool(
      'add_comment',
      {
        title: 'Add Comment',
        description: 'Add a comment to an existing task. Use get_task to read existing comments first.',
        inputSchema: {
          taskId: z.string().describe('Task ID to comment on.'),
          author: z.string().min(1).describe('Username of the commenter.'),
          body: z.string().min(1).describe('Comment text. Markdown supported.'),
        },
        annotations: { destructiveHint: false, idempotentHint: false },
      },
      async ({ taskId, author, body }) => {
        const comment = this.tasks.addComment(taskId, { author, body });
        if (!comment) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Task "${taskId}" not found. Use list_tasks to find valid IDs.` }],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Added comment ${comment.id} to task ${taskId}.\n\n${JSON.stringify(comment, null, 2)}`,
            },
          ],
        };
      },
    );

    // ── get_stats ─────────────────────────────────────────────────────────────
    this.server.registerTool(
      'get_stats',
      {
        title: 'Get Task Statistics',
        description: 'Return a summary of all tasks grouped by status, plus overdue count and project list.',
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      async () => {
        const stats = this.tasks.getSummaryStats();
        return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
      },
    );
  }

  // ─── Resources ────────────────────────────────────────────────────────────
  //
  // Resources are application-controlled: the host (Claude Desktop / Claude
  // Code) decides when to pull them into context. Unlike tools, they are not
  // called by the model — they are browsed by the UI.
  //
  // Static resources have a fixed URI string. Dynamic resources use a
  // `ResourceTemplate` with an RFC 6570 URI template and an optional `list`
  // callback that enumerates available instances.

  private registerResources() {
    // All tasks — full snapshot including stats
    this.server.registerResource(
      'all-tasks',
      'tasks://all',
      {
        description: 'Complete list of tasks across all projects, sorted by most recently updated.',
        mimeType: 'application/json',
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                generatedAt: new Date().toISOString(),
                stats: this.tasks.getSummaryStats(),
                tasks: this.tasks.findAll(),
              },
              null,
              2,
            ),
          },
        ],
      }),
    );

    // Overdue tasks — useful to include in standup context
    this.server.registerResource(
      'overdue-tasks',
      'tasks://overdue',
      {
        description: 'Tasks that are past their due date and not yet done or cancelled.',
        mimeType: 'application/json',
      },
      async (uri) => {
        const overdue = this.tasks.findOverdue();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ generatedAt: new Date().toISOString(), count: overdue.length, tasks: overdue }, null, 2),
            },
          ],
        };
      },
    );

    // Per-project tasks — a URI template that generates one resource per project.
    // The `list` callback lets the host enumerate all known project URIs.
    this.server.registerResource(
      'project-tasks',
      new ResourceTemplate('tasks://project/{name}', {
        list: async () => {
          const projects = this.tasks.listProjects();
          return {
            resources: projects.map(name => ({
              uri: `tasks://project/${encodeURIComponent(name)}`,
              name: `${name} tasks`,
              mimeType: 'application/json',
            })),
          };
        },
      }),
      {
        description: 'All tasks for a given project. Use tasks://all to discover project names.',
      },
      async (uri, { name }) => {
        const projectName = decodeURIComponent(name as string);
        const projectTasks = this.tasks.findByProject(projectName);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(
                { project: projectName, count: projectTasks.length, tasks: projectTasks },
                null,
                2,
              ),
            },
          ],
        };
      },
    );
  }

  // ─── Prompts ──────────────────────────────────────────────────────────────
  //
  // Prompts are user-controlled: they surface as slash commands or menu items
  // in the host UI. The handler builds a messages[] array — it does NOT make
  // any data changes. Arguments are always strings (MCP spec constraint);
  // numeric conversion happens inside the handler if needed.

  private registerPrompts() {
    // Daily standup — pulls live task data into a structured prompt
    this.server.registerPrompt(
      'daily_standup',
      {
        title: 'Daily Standup',
        description:
          'Generate a structured daily standup report showing what was done, what is in progress, and blockers.',
        argsSchema: {
          assignee: z.string().optional().describe('Filter standup to a specific team member. Omit for full team.'),
        },
      },
      ({ assignee }) => {
        const tasks = this.tasks.findAll(assignee ? { assignee } : undefined);
        const done = tasks.filter(t => t.status === 'done').slice(0, 5);
        const inProgress = tasks.filter(t => t.status === 'in-progress');
        const overdue = this.tasks.findOverdue().filter(t => !assignee || t.assignee === assignee);

        const context = JSON.stringify({ done, inProgress, overdue }, null, 2);
        const scope = assignee ? `for ${assignee}` : 'for the full team';

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text:
                  `Generate a concise daily standup report ${scope} based on the following task data.\n\n` +
                  `Format:\n` +
                  `**Yesterday:** List recently completed tasks\n` +
                  `**Today:** List in-progress tasks with owners\n` +
                  `**Blockers:** Flag any overdue items that need attention\n\n` +
                  `Task data:\n${context}`,
              },
            },
          ],
        };
      },
    );

    // Sprint review — scoped to a project, optionally evaluated against a goal
    this.server.registerPrompt(
      'sprint_review',
      {
        title: 'Sprint Review',
        description: 'Generate a sprint review summary showing delivered items and remaining backlog.',
        argsSchema: {
          project: z.string().describe('Project name to scope the review to (e.g. "Frontend").'),
          sprintGoal: z.string().optional().describe('The sprint goal to evaluate against.'),
        },
      },
      ({ project, sprintGoal }) => {
        const tasks = this.tasks.findByProject(project);
        const context = JSON.stringify(tasks, null, 2);
        const goalLine = sprintGoal ? `Sprint goal: "${sprintGoal}"\n\n` : '';

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text:
                  `Generate a sprint review for the "${project}" project.\n\n` +
                  goalLine +
                  `Include:\n` +
                  `- **Delivered** (done tasks)\n` +
                  `- **In Progress** (incomplete work to carry over)\n` +
                  `- **Cancelled/Deferred**\n` +
                  `- **Velocity assessment** (high/medium/low)\n` +
                  `- **Recommendations** for next sprint\n\n` +
                  `Task data:\n${context}`,
              },
            },
          ],
        };
      },
    );
  }

  // ─── Transport ────────────────────────────────────────────────────────────

  /**
   * Connects the MCP server to a stateless HTTP transport and returns it.
   * The caller mounts the transport on a `node:http` server to handle
   * incoming JSON-RPC requests at the `/mcp` endpoint.
   */
  async start(): Promise<StreamableHTTPServerTransport> {
    // sessionIdGenerator: undefined → stateless (no per-session state, safe for horizontal scaling)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await this.server.connect(transport);
    this.logger.log('MCP server connected via HTTP transport');
    return transport;
  }
}
