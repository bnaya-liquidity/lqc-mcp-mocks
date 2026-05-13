import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Task, Comment, TaskStatus, TaskPriority } from './task.types.js';

/**
 * In-memory task store that acts as the single source of truth for all task
 * data in the MCP Task Hub server.
 *
 * All data lives in `this.tasks` (a `Map` keyed by task ID). There is no
 * database — the constructor seeds a set of realistic demo tasks so the server
 * is immediately usable after startup. Restarting the process resets the data.
 *
 * This service is consumed by two callers:
 *   - `McpService` — via injected dependency, called from MCP tool handlers
 *   - (future) REST controllers if an HTTP entry point is added
 */
@Injectable()
export class TasksService {
  private readonly tasks = new Map<string, Task>();

  constructor() {
    this.seed();
  }

  /**
   * Populates the in-memory store with a realistic set of demo tasks.
   *
   * Dates are expressed as offsets from `Date.now()` so they remain "recent"
   * no matter when the server starts — e.g. a task created "7 days ago" is
   * always relative to now rather than hardcoded to a stale date.
   */
  private seed() {
    const now = Date.now();
    const day = 86_400_000;
    const t = (offsetDays: number) => new Date(now + offsetDays * day).toISOString();
    const td = (offsetDays: number) => t(offsetDays).split('T')[0];

    const tasks: Task[] = [
      {
        id: 'task-001',
        title: 'Set up CI/CD pipeline',
        description: 'Configure GitHub Actions for automated testing and deployment to staging and prod.',
        status: 'in-progress',
        priority: 'high',
        project: 'DevOps',
        assignee: 'alice',
        dueDate: td(3),
        tags: ['infrastructure', 'automation'],
        createdAt: t(-7),
        updatedAt: t(-1),
        comments: [
          { id: 'c-001', taskId: 'task-001', author: 'alice', body: 'Started with Docker configuration. Using multi-stage builds.', createdAt: t(-2) },
          { id: 'c-002', taskId: 'task-001', author: 'bob', body: 'Great progress! Make sure to add the staging deployment gate.', createdAt: t(-1) },
        ],
      },
      {
        id: 'task-002',
        title: 'Redesign dashboard landing page',
        description: 'Revamp the main dashboard to improve UX and performance. Figma mockups in Notion.',
        status: 'todo',
        priority: 'medium',
        project: 'Frontend',
        assignee: 'carol',
        dueDate: td(10),
        tags: ['ui', 'design'],
        createdAt: t(-3),
        updatedAt: t(-3),
        comments: [],
      },
      {
        id: 'task-003',
        title: 'Implement rate limiting middleware',
        description: 'Add Redis-based rate limiting to the public API endpoints. 100 req/min per API key.',
        status: 'todo',
        priority: 'high',
        project: 'API',
        assignee: 'dave',
        dueDate: td(5),
        tags: ['security', 'api', 'redis'],
        createdAt: t(-5),
        updatedAt: t(-5),
        comments: [
          { id: 'c-003', taskId: 'task-003', author: 'alice', body: 'Consider using sliding window algorithm for better UX.', createdAt: t(-4) },
        ],
      },
      {
        id: 'task-004',
        title: 'Write unit tests for auth module',
        description: 'Coverage is currently at 45%. Target: 80%+ for all auth-related modules.',
        status: 'done',
        priority: 'medium',
        project: 'API',
        assignee: 'alice',
        dueDate: td(-2),
        tags: ['testing', 'auth'],
        createdAt: t(-14),
        updatedAt: t(-1),
        comments: [
          { id: 'c-004', taskId: 'task-004', author: 'alice', body: 'Done! Coverage at 87%. Added edge cases for token refresh.', createdAt: t(-1) },
        ],
      },
      {
        id: 'task-005',
        title: 'Migrate legacy config files to YAML',
        description: 'Replace all JSON config files with YAML equivalents for better readability.',
        status: 'todo',
        priority: 'low',
        project: 'DevOps',
        assignee: 'bob',
        dueDate: td(-5),
        tags: ['config', 'maintenance'],
        createdAt: t(-20),
        updatedAt: t(-10),
        comments: [],
      },
      {
        id: 'task-006',
        title: 'Add dark mode support',
        description: 'Implement system-preference-aware dark mode using CSS custom properties.',
        status: 'in-progress',
        priority: 'low',
        project: 'Frontend',
        assignee: 'carol',
        dueDate: td(14),
        tags: ['ui', 'accessibility'],
        createdAt: t(-2),
        updatedAt: t(0),
        comments: [
          { id: 'c-005', taskId: 'task-006', author: 'carol', body: 'Using prefers-color-scheme media query. About 60% done.', createdAt: t(0) },
        ],
      },
    ];

    for (const task of tasks) {
      this.tasks.set(task.id, task);
    }
  }

  /**
   * Returns all tasks that match every supplied filter. Filters are ANDed
   * together — a task must satisfy all non-undefined criteria to be included.
   * Results are sorted newest-first by `updatedAt`.
   *
   * @param filters  Optional object with any combination of status, project,
   *                 priority, assignee, and tag filters. Project matching is
   *                 case-insensitive. Omit the whole argument to return all tasks.
   */
  findAll(filters?: {
    status?: TaskStatus;
    project?: string;
    priority?: TaskPriority;
    assignee?: string;
    tag?: string;
  }): Task[] {
    let result = Array.from(this.tasks.values());
    if (filters?.status) result = result.filter(t => t.status === filters.status);
    if (filters?.project) result = result.filter(t => t.project?.toLowerCase() === filters.project!.toLowerCase());
    if (filters?.priority) result = result.filter(t => t.priority === filters.priority);
    if (filters?.assignee) result = result.filter(t => t.assignee === filters.assignee);
    if (filters?.tag) result = result.filter(t => t.tags.includes(filters.tag!));
    return result.sort((a, b) => a.updatedAt < b.updatedAt ? 1 : -1);
  }

  /**
   * Looks up a single task by its ID.
   * @returns The task, or `undefined` if no task with that ID exists.
   */
  findById(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  /**
   * Returns tasks that are past their `dueDate` and not yet completed.
   *
   * A task is considered overdue when its due date (YYYY-MM-DD) is earlier
   * than today's date and its status is neither `done` nor `cancelled`.
   */
  findOverdue(): Task[] {
    const today = new Date().toISOString().split('T')[0];
    return Array.from(this.tasks.values()).filter(
      t => t.dueDate && t.dueDate < today && t.status !== 'done' && t.status !== 'cancelled',
    );
  }

  /**
   * Returns all tasks belonging to the given project.
   * Matching is case-insensitive.
   */
  findByProject(project: string): Task[] {
    return Array.from(this.tasks.values()).filter(
      t => t.project?.toLowerCase() === project.toLowerCase(),
    );
  }

  /**
   * Returns a deduplicated, sorted list of all project names currently in use.
   * Used by the `tasks://project/{name}` resource template to populate its
   * `list` callback.
   */
  listProjects(): string[] {
    return [...new Set(Array.from(this.tasks.values()).map(t => t.project).filter(Boolean) as string[])];
  }

  /**
   * Creates a new task with status `todo` and returns it.
   *
   * @param data  Required: `title`. Optional: `description`, `priority`
   *              (defaults to `medium`), `project`, `assignee`, `dueDate`,
   *              `tags` (defaults to `[]`).
   * @returns The newly created task including its generated `id`.
   */
  create(data: {
    title: string;
    description?: string;
    priority?: TaskPriority;
    project?: string;
    assignee?: string;
    dueDate?: string;
    tags?: string[];
  }): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: `task-${randomUUID().slice(0, 8)}`,
      title: data.title,
      description: data.description,
      status: 'todo',
      priority: data.priority ?? 'medium',
      project: data.project,
      assignee: data.assignee,
      dueDate: data.dueDate,
      tags: data.tags ?? [],
      createdAt: now,
      updatedAt: now,
      comments: [],
    };
    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * Applies a partial update to an existing task using a spread-merge strategy.
   * Only the fields present in `updates` are changed; all other fields are
   * preserved. `updatedAt` is always refreshed to the current time.
   *
   * @param id       ID of the task to update.
   * @param updates  Partial set of mutable task fields.
   * @returns The updated task, or `undefined` if the ID was not found.
   */
  update(
    id: string,
    updates: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'project' | 'assignee' | 'dueDate' | 'tags'>>,
  ): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    const updated: Task = { ...task, ...updates, updatedAt: new Date().toISOString() };
    this.tasks.set(id, updated);
    return updated;
  }

  /**
   * Permanently removes a task and all its comments from the store.
   * @returns `true` if the task existed and was deleted, `false` otherwise.
   */
  delete(id: string): boolean {
    return this.tasks.delete(id);
  }

  /**
   * Appends a new comment to the specified task.
   *
   * The `comments` array is replaced (not mutated in-place) and `updatedAt`
   * on the parent task is bumped to the comment's `createdAt` timestamp so
   * that `findAll` sorts tasks with fresh comments to the top.
   *
   * @returns The newly created `Comment`, or `undefined` if the task was not found.
   */
  addComment(taskId: string, data: { author: string; body: string }): Comment | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    const comment: Comment = {
      id: `c-${randomUUID().slice(0, 8)}`,
      taskId,
      author: data.author,
      body: data.body,
      createdAt: new Date().toISOString(),
    };
    task.comments = [...task.comments, comment];
    task.updatedAt = comment.createdAt;
    return comment;
  }

  /**
   * Returns aggregate statistics across all tasks.
   * Used by the `get_stats` MCP tool and can be embedded in resource payloads.
   */
  getSummaryStats() {
    const all = Array.from(this.tasks.values());
    return {
      total: all.length,
      byStatus: {
        todo: all.filter(t => t.status === 'todo').length,
        'in-progress': all.filter(t => t.status === 'in-progress').length,
        done: all.filter(t => t.status === 'done').length,
        cancelled: all.filter(t => t.status === 'cancelled').length,
      },
      overdue: this.findOverdue().length,
      projects: this.listProjects(),
    };
  }
}
