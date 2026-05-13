/**
 * Subscription tier of the customer's account.
 * Ordered free → starter → pro → enterprise (ascending value).
 */
export type CustomerTier = 'free' | 'starter' | 'pro' | 'enterprise';

/**
 * Lifecycle state of the customer relationship.
 *   - `prospect`  — in evaluation, no paid contract yet
 *   - `active`    — paying customer
 *   - `churned`   — was a customer, no longer subscribed
 */
export type CustomerStatus = 'active' | 'churned' | 'prospect';

/** A person or organisation tracked in the CRM. */
export interface Customer {
  /** Unique identifier, format `cust-<8-char hex>`. */
  id: string;
  /** Full name of the primary contact. */
  name: string;
  /** Primary email address used for correspondence. */
  email: string;
  /** Company or organisation the contact belongs to. */
  company: string;
  /** Phone number in international format (optional). */
  phone?: string;
  tier: CustomerTier;
  status: CustomerStatus;
  /** Industry sector — used for search and segmentation. */
  industry: string;
  /** Company website URL (optional). */
  website?: string;
  /** Internal notes visible only to the sales team. */
  notes?: string;
  /** ID of the sales rep who owns this account (e.g. "rep-alice"). */
  ownerId: string;
  /** ISO 8601 timestamp set at creation time. */
  createdAt: string;
  /** ISO 8601 timestamp updated on every write. */
  updatedAt: string;
}
