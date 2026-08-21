import { TicketCategory } from "./ticketsApi";
import { API_BASE_URL } from "./config";

export interface ClassifyRequest {
  issue_description: string;
}

// null is a real, successful answer: the AI read the description and had
// nothing to suggest. It is not an error, and it is not the same as the 502
// this function throws on, which means the classifier could not be reached.
interface ClassifySuccessBody {
  suggested_category: TicketCategory | null;
}

interface ErrorBody {
  error: string;
}

export async function classifyText(
  issueDescription: string,
  token: string
): Promise<TicketCategory | null> {
  const response = await fetch(`${API_BASE_URL}/api/v1/tickets/classify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ issue_description: issueDescription } satisfies ClassifyRequest),
  });

  const body = (await response.json()) as ClassifySuccessBody | ErrorBody;

  if (!response.ok) {
    const message = "error" in body ? body.error : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return (body as ClassifySuccessBody).suggested_category;
}
