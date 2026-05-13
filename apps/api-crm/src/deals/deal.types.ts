/**
 * Stage of a deal in the sales pipeline.
 * The typical forward progression is:
 *   prospecting → qualification → proposal → negotiation → closed-won
 * A deal can move to `closed-lost` from any active stage.
 */
export type DealStage =
  | 'prospecting'
  | 'qualification'
  | 'proposal'
  | 'negotiation'
  | 'closed-won'
  | 'closed-lost';

/** A revenue opportunity linked to a customer. */
export interface Deal {
  /** Unique identifier, format `deal-<8-char hex>`. */
  id: string;
  /** Human-readable deal name (e.g. "Acme Corp — Enterprise Upgrade"). */
  title: string;
  /** Foreign key to the owning `Customer`. */
  customerId: string;
  stage: DealStage;
  /** Expected deal value in `currency`. */
  value: number;
  /** ISO 4217 currency code (e.g. "USD"). */
  currency: string;
  /**
   * Win probability as a percentage (0–100).
   * Automatically derived from `stage` by `DealsService.moveStage` — callers
   * should not set this directly.
   */
  probability: number;
  /** Target close date in YYYY-MM-DD format. */
  expectedCloseDate: string;
  /** ID of the rep responsible for closing this deal. */
  ownerId: string;
  /** Internal notes or context about the deal. */
  notes?: string;
  /** Populated when stage is `closed-lost` to explain why the deal was lost. */
  lostReason?: string;
  /** ISO 8601 timestamp set at creation time. */
  createdAt: string;
  /** ISO 8601 timestamp updated on every write. */
  updatedAt: string;
}
