import { API_BASE_URL } from "./config";

export const CATEGORIES = ["High", "Medium", "Low", "Suggestion", "Request"] as const;
export type TicketCategory = (typeof CATEGORIES)[number];

// The only product list on the frontend: the manual dropdown and the page
// detection util both read it from here. It mirrors the backend's
// `config/productPages.ts` by hand, since the two are separate npm projects.
export const PRODUCT_NAMES = ["Analytics Hub", "User Portal", "Billing Engine", "Settings Suite"] as const;
export type ProductName = (typeof PRODUCT_NAMES)[number];

// The only status list on the frontend, mirroring the backend's
// ALLOWED_STATUSES by hand for the same reason PRODUCT_NAMES mirrors
// productPages.ts: two separate npm projects with no shared module. These are
// the wire values, lowercase exactly as stored and transmitted; capitalising
// them for display is the table's business and never storage's.
export const STATUSES = ["open", "in progress", "resolved"] as const;
export type TicketStatus = (typeof STATUSES)[number];

export interface CreateTicketRequest {
  product_name: string;
  category: TicketCategory;
  issue_description: string;
  // Both are required rather than optional: omission is reserved as a
  // "pre-AI client" signal server-side, so this widget always states them.
  ai_suggested_category: TicketCategory | null;
  ai_mode_enabled: boolean;
}

export interface CreateTicketResponseData {
  ticket_id: string;
  datetime: string;
  product_name: string;
  category: TicketCategory;
  username: string;
}

interface CreateTicketSuccessBody {
  status: "success";
  message: string;
  data: CreateTicketResponseData;
}

interface ErrorBody {
  error: string;
}

// A stored ticket as the read endpoint returns it. `datetime` is a string here,
// not a Date: it arrives as JSON, and pretending otherwise would mean every
// consumer re-parsing it silently.
export interface Ticket {
  ticket_id: string;
  username: string;
  email: string;
  datetime: string;
  product_name: string;
  category: TicketCategory;
  issue_description: string;
  ai_suggested_category: TicketCategory | null;
  ai_mode_enabled: boolean;
  status: TicketStatus;
}

export interface TicketFilters {
  product_name?: string;
  category?: TicketCategory | "";
  from?: string;
  to?: string;
}

interface ListTicketsSuccessBody {
  status: "success";
  data: Ticket[];
}

// The outer `status` is the envelope's own field and the ticket's lifecycle
// status is inside `data`. They collide by name only, and this matches the
// shape the endpoint actually returns.
interface UpdateTicketStatusSuccessBody {
  status: "success";
  data: Ticket;
}

export async function listTickets(filters: TicketFilters, token: string): Promise<Ticket[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    // An unset control omits its parameter entirely. Sending an empty string
    // would be rejected by the endpoint's own validation as a bad enum value.
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  const response = await fetch(`${API_BASE_URL}/api/v1/tickets${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = (await response.json()) as ListTicketsSuccessBody | ErrorBody;

  if (!response.ok) {
    const message = "error" in body ? body.error : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return (body as ListTicketsSuccessBody).data;
}

export async function createTicket(
  payload: CreateTicketRequest,
  token: string
): Promise<CreateTicketResponseData> {
  const response = await fetch(`${API_BASE_URL}/api/v1/tickets/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as CreateTicketSuccessBody | ErrorBody;

  if (!response.ok) {
    const message = "error" in body ? body.error : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return (body as CreateTicketSuccessBody).data;
}

// Returns the updated ticket, so a caller can apply the server's row rather than
// assuming its own value landed. Throws on any non-ok status, carrying the
// server's `error` message, exactly as the two functions above do.
export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus,
  token: string
): Promise<Ticket> {
  const response = await fetch(`${API_BASE_URL}/api/v1/tickets/${ticketId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });

  const body = (await response.json()) as UpdateTicketStatusSuccessBody | ErrorBody;

  if (!response.ok) {
    const message = "error" in body ? body.error : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return (body as UpdateTicketStatusSuccessBody).data;
}
