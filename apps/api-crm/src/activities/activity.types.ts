/**
 * The medium through which the activity was conducted.
 *   - `call`     — phone or video call
 *   - `email`    — written email correspondence
 *   - `meeting`  — in-person or virtual meeting
 *   - `demo`     — product demonstration session
 *   - `note`     — internal note with no external interaction
 */
export type ActivityType = 'call' | 'email' | 'meeting' | 'demo' | 'note';

/**
 * Who initiated the interaction.
 *   - `outbound` — sales rep reached out to the customer
 *   - `inbound`  — customer initiated contact
 */
export type ActivityDirection = 'inbound' | 'outbound';

/** A single logged interaction or note against a customer or deal. */
export interface Activity {
  /** Unique identifier, format `act-<8-char hex>`. */
  id: string;
  /** Foreign key to the `Customer` this activity relates to. */
  customerId: string;
  /**
   * Optional foreign key to a `Deal`.
   * Set when the activity is specifically about progressing a particular deal.
   */
  dealId?: string;
  type: ActivityType;
  /** Omitted for `note` type since notes have no directionality. */
  direction?: ActivityDirection;
  /** Short subject line for the activity (shown in list views). */
  subject: string;
  /** Full notes or transcript from the activity. Markdown is supported. */
  body: string;
  /** Duration in minutes — relevant for calls and meetings. */
  durationMinutes?: number;
  /** ID of the rep who conducted the activity (e.g. "rep-alice"). */
  performedBy: string;
  /** ISO 8601 timestamp of when the activity actually happened. */
  performedAt: string;
  /** ISO 8601 timestamp of when the record was created in the system. */
  createdAt: string;
}
