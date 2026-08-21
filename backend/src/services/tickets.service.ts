import {
  findTickets,
  insertTicket,
  Ticket,
  TicketFilters,
  TicketStatus,
  updateTicketStatus,
} from "../db/models/ticket.model";
import { ValidatedTicketBody } from "../middleware/validate.middleware";

export async function createTicket(
  identity: { username: string; email: string },
  payload: ValidatedTicketBody
): Promise<Ticket> {
  return insertTicket({
    username: identity.username,
    email: identity.email,
    product_name: payload.product_name,
    category: payload.category,
    issue_description: payload.issue_description,
    ai_suggested_category: payload.ai_suggested_category ?? null,
    ai_mode_enabled: payload.ai_mode_enabled ?? false,
  });
}

// A pass-through today. It exists so the read path has the same
// controller -> service -> model shape as the write path above; a controller
// reaching straight into the model for one endpoint would make the two halves
// of the same resource look unrelated.
export async function listTickets(filters: TicketFilters): Promise<Ticket[]> {
  return findTickets(filters);
}

// A pass-through for the same reason listTickets is one: the write path keeps
// the controller -> service -> model shape rather than having one endpoint reach
// straight into the model.
export async function changeTicketStatus(
  ticketId: string,
  status: TicketStatus
): Promise<Ticket | null> {
  return updateTicketStatus(ticketId, status);
}
