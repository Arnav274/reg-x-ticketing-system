import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ManualModeForm } from "../src/components/ManualModeForm";
import { createTicket } from "../src/api/ticketsApi";
import type { Ticket } from "../src/api/ticketsApi";
import type { AuthContext } from "../src/hooks/useAuthContext";

// Mocked at the api-module boundary rather than at global fetch: that module is
// the seam the component is written against, and its own behaviour is verified
// separately. Partial, because ticketsApi is also where PRODUCT_NAMES and
// CATEGORIES live, and blanking those would empty the dropdowns this file is
// supposed to be asserting on.
vi.mock("../src/api/ticketsApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/ticketsApi")>()),
  createTicket: vi.fn(),
}));

// Read through a mutable variable so a test can move the hook from "no token
// yet" to "token arrived" between renders, which is the transition the
// disabled-submit rule is about.
let currentAuth: AuthContext | null = null;
vi.mock("../src/hooks/useAuthContext", () => ({
  useAuthContext: () => currentAuth,
}));

// vi.mock is hoisted above the imports, so this static import is already the
// mocked module.
const createTicketMock = vi.mocked(createTicket);

const AUTH: AuthContext = {
  username: "johndoe",
  email: "johndoe@example.com",
  token: "test-token",
};

// AI mode off throughout: this file covers the manual submit flow, so the
// category comes from the plain dropdown and no classification is involved.
function renderForm() {
  return render(
    <ManualModeForm detectedProduct={null} aiModeEnabled={false} onAiModeChange={() => {}} />
  );
}

beforeEach(() => {
  currentAuth = AUTH;
  createTicketMock.mockReset();
  createTicketMock.mockResolvedValue({
    ticket_id: "generated-by-the-server",
  } as unknown as Ticket);
});

afterEach(cleanup);

describe("ManualModeForm", () => {
  it("renders the product dropdown, category dropdown and description box", () => {
    renderForm();

    expect(document.querySelector("#product-name")).not.toBeNull();
    expect(document.querySelector("#manual-category")).not.toBeNull();
    expect(document.querySelector("#issue-description")).not.toBeNull();
  });

  it("disables submit while the token is null and enables it once the token arrives", () => {
    currentAuth = null;
    const { rerender } = renderForm();

    // Everything except the token is satisfied, so the token is the only thing
    // the assertion below can be measuring.
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Medium" } });
    fireEvent.change(screen.getByLabelText("Describe the issue"), {
      target: { value: "The export button returns a 500." },
    });

    // Plain DOM property rather than a jest-dom matcher, which would be a
    // fourth dependency this issue does not authorise.
    const submit = screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    currentAuth = AUTH;
    rerender(
      <ManualModeForm detectedProduct={null} aiModeEnabled={false} onAiModeChange={() => {}} />
    );

    const enabled = screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement;
    expect(enabled.disabled).toBe(false);
  });

  it("submits exactly the five allowlisted fields and no identity fields", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Product"), { target: { value: "User Portal" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Low" } });
    fireEvent.change(screen.getByLabelText("Describe the issue"), {
      target: { value: "The dashboard header is misaligned." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(createTicketMock).toHaveBeenCalledTimes(1));

    const [payload, token] = createTicketMock.mock.calls[0];
    // The whole key set, not a field-by-field check. This is what makes the
    // test fail if a sixth field is ever added, which is the point: identity is
    // derived from the verified JWT on the server and must never be sent from
    // here, and this is the exact place a well-meaning change would add it.
    expect(Object.keys(payload).sort()).toEqual([
      "ai_mode_enabled",
      "ai_suggested_category",
      "category",
      "issue_description",
      "product_name",
    ]);
    expect(payload).toEqual({
      product_name: "User Portal",
      category: "Low",
      issue_description: "The dashboard header is misaligned.",
      ai_suggested_category: null,
      ai_mode_enabled: false,
    });
    expect(token).toBe("test-token");
  });
});
