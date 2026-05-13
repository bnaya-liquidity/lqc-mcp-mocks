import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Customer, CustomerStatus, CustomerTier } from './customer.types.js';

/**
 * In-memory customer store — the single source of truth for all customer
 * data in the CRM application.
 *
 * Seeded with five realistic demo customers on construction. All CRUD methods
 * operate on `this.customers` (a `Map` keyed by customer ID). Restarting the
 * process resets the data.
 *
 * Consumed by:
 *   - `CustomersController` — REST API (GET /customers, POST /customers, …)
 *   - `CrmMcpService` — MCP tools (search_customers, get_customer, …)
 */
@Injectable()
export class CustomersService {
  private readonly customers = new Map<string, Customer>();

  constructor() {
    this.seed();
  }

  /**
   * Populates the store with demo customers covering a range of tiers,
   * statuses, and industries so every MCP tool has interesting data to work
   * with immediately after startup.
   */
  private seed() {
    const t = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString();

    const data: Customer[] = [
      {
        id: 'cust-001',
        name: 'Sarah Chen',
        email: 'sarah.chen@techcorp.io',
        company: 'TechCorp',
        phone: '+1-555-0101',
        tier: 'enterprise',
        status: 'active',
        industry: 'Technology',
        website: 'https://techcorp.io',
        notes: 'Key account. Expansion discussion ongoing. Decision maker.',
        ownerId: 'rep-alice',
        createdAt: t(-180),
        updatedAt: t(-2),
      },
      {
        id: 'cust-002',
        name: 'Marcus Webb',
        email: 'marcus@startupxyz.com',
        company: 'StartupXYZ',
        phone: '+1-555-0202',
        tier: 'pro',
        status: 'active',
        industry: 'FinTech',
        website: 'https://startupxyz.com',
        notes: 'Fast-growing Series B. Budget constrained but high growth potential.',
        ownerId: 'rep-bob',
        createdAt: t(-90),
        updatedAt: t(-5),
      },
      {
        id: 'cust-003',
        name: 'Diana Foster',
        email: 'd.foster@globalretail.com',
        company: 'GlobalRetail Co.',
        phone: '+1-555-0303',
        tier: 'enterprise',
        status: 'prospect',
        industry: 'Retail',
        website: 'https://globalretail.com',
        notes: 'Evaluating 3 vendors. Deadline end of quarter. IT team involved.',
        ownerId: 'rep-alice',
        createdAt: t(-30),
        updatedAt: t(-1),
      },
      {
        id: 'cust-004',
        name: 'James Okafor',
        email: 'james.okafor@mediapulse.com',
        company: 'MediaPulse',
        phone: '+1-555-0404',
        tier: 'starter',
        status: 'active',
        industry: 'Media',
        ownerId: 'rep-carol',
        createdAt: t(-60),
        updatedAt: t(-10),
      },
      {
        id: 'cust-005',
        name: 'Priya Nair',
        email: 'priya@healthbridge.io',
        company: 'HealthBridge',
        tier: 'free',
        status: 'churned',
        industry: 'Healthcare',
        notes: 'Churned due to pricing. Re-engage if we add HIPAA compliance.',
        ownerId: 'rep-bob',
        createdAt: t(-200),
        updatedAt: t(-45),
      },
    ];

    for (const c of data) this.customers.set(c.id, c);
  }

  /**
   * Returns all customers that match every supplied filter (AND logic).
   *
   * @param filters  Optional status, tier, and/or ownerId filters. Omit to
   *                 return the full customer list.
   */
  findAll(filters?: { status?: CustomerStatus; tier?: CustomerTier; ownerId?: string }): Customer[] {
    let result = Array.from(this.customers.values());
    if (filters?.status) result = result.filter(c => c.status === filters.status);
    if (filters?.tier) result = result.filter(c => c.tier === filters.tier);
    if (filters?.ownerId) result = result.filter(c => c.ownerId === filters.ownerId);
    return result;
  }

  /**
   * Full-text search across name, email, company, and industry fields.
   * Matching is case-insensitive substring search.
   *
   * @param query  Search term. An empty string returns all customers.
   */
  search(query: string): Customer[] {
    const q = query.toLowerCase();
    return Array.from(this.customers.values()).filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.industry.toLowerCase().includes(q),
    );
  }

  /**
   * Looks up a single customer by ID.
   * @returns The customer, or `undefined` if not found.
   */
  findById(id: string): Customer | undefined {
    return this.customers.get(id);
  }

  /**
   * Creates a new customer record and returns it.
   *
   * @param data  All customer fields except `id`, `createdAt`, and `updatedAt`,
   *              which are generated automatically.
   */
  create(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Customer {
    const now = new Date().toISOString();
    const customer: Customer = { id: `cust-${randomUUID().slice(0, 8)}`, ...data, createdAt: now, updatedAt: now };
    this.customers.set(customer.id, customer);
    return customer;
  }

  /**
   * Applies a partial update using spread-merge strategy. `updatedAt` is
   * always refreshed; `id` and `createdAt` are immutable and excluded from
   * `updates`.
   *
   * @returns The updated customer, or `undefined` if the ID was not found.
   */
  update(id: string, updates: Partial<Omit<Customer, 'id' | 'createdAt'>>): Customer | undefined {
    const customer = this.customers.get(id);
    if (!customer) return undefined;
    const updated: Customer = { ...customer, ...updates, updatedAt: new Date().toISOString() };
    this.customers.set(id, updated);
    return updated;
  }
}
