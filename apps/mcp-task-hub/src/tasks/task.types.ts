/**
 * Lifecycle states a task can be in.
 * The happy-path flow is:  todo → in-progress → done
 * A task can be moved to `cancelled` from any state without completing it.
 */
export type TaskStatus = 'todo' | 'in-progress' | 'done' | 'cancelled';

/**
 * Urgency level used for triage and sorting.
 * Ordered low → medium → high → urgent (ascending importance).
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

/** A single threaded comment attached to a task. */
export interface Comment {
  /** Unique identifier, format `c-<8-char hex>`. */
  id: string;
  /** Foreign key back to the parent task. */
  taskId: string;
  /** Username of the person who wrote the comment. */
  author: string;
  /** Comment body. Markdown is supported. */
  body: string;
  /** ISO 8601 timestamp set at creation time. */
  createdAt: string;
}

/** A unit of work with metadata, assignment, and a comment thread. */
export interface Task {
  /** Unique identifier, format `task-<8-char hex>`. */
  id: string;
  /** Short, action-oriented title (max 200 chars). */
  title: string;
  /** Optional long-form description. Markdown is supported. */
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Optional grouping label (e.g. "DevOps", "Frontend"). */
  project?: string;
  /** Username of the person responsible for completing the task. */
  assignee?: string;
  /** Target completion date in YYYY-MM-DD format. Used by `findOverdue`. */
  dueDate?: string;
  /** Free-form labels for cross-cutting categorisation. */
  tags: string[];
  /** ISO 8601 timestamp set at creation time. */
  createdAt: string;
  /** ISO 8601 timestamp updated on every write (status change, comment, etc.). */
  updatedAt: string;
  /** Ordered list of comments, oldest first. */
  comments: Comment[];
}
