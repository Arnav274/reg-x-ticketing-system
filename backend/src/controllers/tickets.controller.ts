import { Request, Response } from "express";
import { changeTicketStatus, createTicket, listTickets } from "../services/tickets.service";
import { ValidatedTicketBody } from "../middleware/validate.middleware";
import { TicketIdParams, ValidatedStatusBody } from "../middleware/validateStatus.middleware";
import { ALLOWED_CATEGORIES, TicketCategory, TicketFilters } from "../db/models/ticket.model";
import { ALLOWED_PRODUCT_NAMES, ProductName } from "../config/productPages";

export async function createTicketController(
  req: Request,
  res: Response
): Promise<void> {
  // auth.middleware always runs before this controller,
  // so identity is guaranteed to be set by the time we get here.
  const identity = req.identity!;
  const payload = req.body as ValidatedTicketBody;

  const ticket = await createTicket(identity, payload);

  res.status(201).json({
    status: "success",
    message: "Ticket created successfully",
    data: {
      ticket_id: ticket.ticket_id,
      datetime: ticket.datetime,
      product_name: ticket.product_name,
      category: ticket.category,
      username: ticket.username,
    },
  });
}

const ALLOWED_QUERY_PARAMS = ["product_name", "category", "from", "to"] as const;

// Returns the parsed filters, or an error message for the caller to return as a
// 400. Query parameters are untrusted input and this is the only boundary that
// sees them: `validate.middleware` checks request bodies against a fixed shape,
// and teaching it a second mode selected by HTTP method would make one file
// serve two contracts.
//
// `category` in particular cannot be passed through unchecked. The column is a
// Postgres ENUM, so a bad value is rejected by the database rather than simply
// matching nothing, and that throw would reach `errorHandler` and come back as a
// generic "Internal server error" - a 500 for what is plainly the caller's
// mistake. Measured directly, by sending a bad value and confirming it lands as
// a 500.
function parseFilters(query: Record<string, unknown>): TicketFilters | string {
  const unexpected = Object.keys(query).filter(
    (key) => !ALLOWED_QUERY_PARAMS.includes(key as (typeof ALLOWED_QUERY_PARAMS)[number])
  );
  if (unexpected.length > 0) {
    return `Unexpected query parameter(s): ${unexpected.join(", ")}`;
  }

  const filters: TicketFilters = {};
  const { product_name, category, from, to } = query;

  if (product_name !== undefined) {
    if (
      typeof product_name !== "string" ||
      !ALLOWED_PRODUCT_NAMES.includes(product_name as ProductName)
    ) {
      return `product_name must be one of: ${ALLOWED_PRODUCT_NAMES.join(", ")}`;
    }
    filters.product_name = product_name;
  }

  if (category !== undefined) {
    if (
      typeof category !== "string" ||
      !ALLOWED_CATEGORIES.includes(category as TicketCategory)
    ) {
      return `category must be one of: ${ALLOWED_CATEGORIES.join(", ")}`;
    }
    filters.category = category as TicketCategory;
  }

  for (const [name, value] of [
    ["from", from],
    ["to", to],
  ] as const) {
    if (value === undefined) {
      continue;
    }
    if (typeof value !== "string") {
      return `${name} must be a single ISO 8601 date`;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return `${name} must be a valid ISO 8601 date`;
    }
    filters[name] = parsed;
  }

  return filters;
}

export async function listTicketsController(
  req: Request,
  res: Response
): Promise<void> {
  const filters = parseFilters(req.query as Record<string, unknown>);

  if (typeof filters === "string") {
    res.status(400).json({ error: filters });
    return;
  }

  const tickets = await listTickets(filters);

  res.status(200).json({
    status: "success",
    data: tickets,
  });
}

export async function updateTicketStatusController(
  req: Request<TicketIdParams>,
  res: Response
): Promise<void> {
  // Both the id's format and the body's shape are guaranteed by
  // validateStatus.middleware, which runs ahead of this controller.
  const { ticket_id } = req.params;
  const { status } = req.body as ValidatedStatusBody;

  const ticket = await changeTicketStatus(ticket_id, status);

  // An update that matched no row must not answer 200: nothing changed, and a
  // success here would tell a client its write landed when it did not.
  if (ticket === null) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Same envelope as the list endpoint. The outer `status` is the envelope's
  // own field and the ticket's lifecycle status is inside `data`; they collide
  // by name only, and matching the established shape beats inventing a third.
  res.status(200).json({
    status: "success",
    data: ticket,
  });
}
