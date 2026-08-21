import { pool } from "../index";

export const ALLOWED_CATEGORIES = ["High", "Medium", "Low", "Suggestion", "Request"] as const;
export type TicketCategory = (typeof ALLOWED_CATEGORIES)[number];

// Owned here for the same reason as ALLOWED_CATEGORIES: these values describe
// the ticket record rather than any one request path. The strings are the wire
// format and the stored value both, matching migration 003's enum exactly, so
// display capitalisation belongs to whatever renders them and never to storage.
export const ALLOWED_STATUSES = ["open", "in progress", "resolved"] as const;
export type TicketStatus = (typeof ALLOWED_STATUSES)[number];

// Owned here, alongside ALLOWED_CATEGORIES, because both describe the ticket
// record rather than any one request path. Two endpoints accept an
// issue_description now (create and classify) and they must agree on its
// maximum, so the number lives in one place and is imported by both.
export const ISSUE_DESCRIPTION_MAX_LENGTH = 5000;

export interface Ticket {
  ticket_id: string;
  username: string;
  email: string;
  datetime: Date;
  product_name: string;
  category: TicketCategory;
  issue_description: string;
  ai_suggested_category: TicketCategory | null;
  ai_mode_enabled: boolean;
  status: TicketStatus;
}

export interface NewTicket {
  username: string;
  email: string;
  product_name: string;
  category: TicketCategory;
  issue_description: string;
  ai_suggested_category: TicketCategory | null;
  ai_mode_enabled: boolean;
}

export interface TicketFilters {
  product_name?: string;
  category?: TicketCategory;
  from?: Date;
  to?: Date;
}

export async function insertTicket(ticket: NewTicket): Promise<Ticket> {
  const result = await pool.query<Ticket>(
    `INSERT INTO tickets (username, email, product_name, category, issue_description, ai_suggested_category, ai_mode_enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      ticket.username,
      ticket.email,
      ticket.product_name,
      ticket.category,
      ticket.issue_description,
      ticket.ai_suggested_category,
      ticket.ai_mode_enabled,
    ]
  );

  return result.rows[0];
}

// Only placeholders are ever assembled into the SQL text; every filter value
// goes into the parameter array. A filter's presence changes the query, a
// filter's value never appears in it. insertTicket could get away with one
// static string, so this is the first query in the backend where that
// distinction has to be made deliberately.
export async function findTickets(filters: TicketFilters = {}): Promise<Ticket[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.product_name !== undefined) {
    values.push(filters.product_name);
    conditions.push(`product_name = $${values.length}`);
  }
  if (filters.category !== undefined) {
    values.push(filters.category);
    conditions.push(`category = $${values.length}`);
  }
  // Both bounds are inclusive, so a single day passed as from and to covers
  // that whole day rather than an empty instant.
  if (filters.from !== undefined) {
    values.push(filters.from);
    conditions.push(`datetime >= $${values.length}`);
  }
  if (filters.to !== undefined) {
    values.push(filters.to);
    conditions.push(`datetime <= $${values.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // No LIMIT and no pagination. At ten submissions per hour per user a full
  // read is small, and a silent cap is worse than none on the table that exists
  // to answer "which page produced the most High tickets" - a truncated answer
  // there looks exactly like a correct one.
  const result = await pool.query<Ticket>(
    `SELECT * FROM tickets ${where} ORDER BY datetime DESC`,
    values
  );

  return result.rows;
}

// Returns the updated row, or null when the id matched nothing, which is what
// lets the controller answer 404 instead of a 200 that changed nothing. Both
// values are parameters, never interpolated, so the status string reaching the
// enum column is bounded by the middleware's check rather than by the SQL text.
//
// NewTicket deliberately has no status field: creation always takes the column
// default, so 'open' is set in one place (migration 003) rather than restated
// by every insert.
export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus
): Promise<Ticket | null> {
  const result = await pool.query<Ticket>(
    `UPDATE tickets SET status = $1 WHERE ticket_id = $2 RETURNING *`,
    [status, ticketId]
  );

  return result.rows[0] ?? null;
}
