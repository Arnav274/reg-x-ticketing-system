import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CategorySelector } from "../src/components/CategorySelector";
import { classifyText } from "../src/api/classifyApi";
import type { TicketCategory } from "../src/api/ticketsApi";

// Mocked at the api-module boundary, as with the submit flow. classifyApi's own
// behaviour is verified separately.
vi.mock("../src/api/classifyApi", () => ({ classifyText: vi.fn() }));

vi.mock("../src/hooks/useAuthContext", () => ({
  useAuthContext: () => ({
    username: "johndoe",
    email: "johndoe@example.com",
    token: "test-token",
  }),
}));

const classifyTextMock = vi.mocked(classifyText);

// CategorySelector is controlled, so it cannot show a value it was not given
// back. This holds the state a real parent would hold, which is what lets a
// suggestion and a user override compete for the same slot.
function Harness({
  description,
  initialValue = "",
}: {
  description: string;
  initialValue?: TicketCategory | "";
}) {
  const [value, setValue] = useState<TicketCategory | "">(initialValue);
  return (
    <CategorySelector issueDescription={description} value={value} onChange={setValue} />
  );
}

const categorySelect = () => screen.getByLabelText("Category") as HTMLSelectElement;

beforeEach(() => {
  classifyTextMock.mockReset();
});

afterEach(cleanup);

describe("CategorySelector", () => {
  it("pre-fills the dropdown with the suggestion and leaves it editable", async () => {
    classifyTextMock.mockResolvedValue("High");

    render(<Harness description="Checkout is down for every user." />);

    // The component debounces by 500ms before calling out.
    await waitFor(() => expect(categorySelect().value).toBe("High"), { timeout: 3000 });

    const select = categorySelect();
    expect(select.disabled).toBe(false);

    // Still editable after the suggestion landed: an AI suggestion has to stay
    // a starting point the user can override, not a locked-in answer, which a
    // read-only pre-filled control would silently break.
    fireEvent.change(select, { target: { value: "Low" } });
    expect(categorySelect().value).toBe("Low");
  });

  it("keeps a user override when a suggestion arrives afterwards", async () => {
    // Held open so the override happens while the request is genuinely still in
    // flight, which is the ordering the component's override guard exists for.
    let resolveClassify: (category: TicketCategory) => void = () => {};
    classifyTextMock.mockReturnValue(
      new Promise<TicketCategory>((resolve) => {
        resolveClassify = resolve;
      })
    );

    render(<Harness description="Checkout is down for every user." />);

    await waitFor(() => expect(classifyTextMock).toHaveBeenCalledTimes(1), { timeout: 3000 });

    fireEvent.change(categorySelect(), { target: { value: "Low" } });
    expect(categorySelect().value).toBe("Low");

    resolveClassify("High");

    // The suggestion must lose. Waiting for the loading state to clear gives the
    // component every chance to apply it before this is asserted.
    await waitFor(() => expect(screen.queryByText(/Suggesting category/)).toBeNull());
    expect(categorySelect().value).toBe("Low");
  });

  it("falls back silently when classification fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    classifyTextMock.mockRejectedValue(new Error("classify failed with status 502"));

    render(<Harness description="Checkout is down for every user." initialValue="Medium" />);

    await waitFor(() => expect(classifyTextMock).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await waitFor(() => expect(screen.queryByText(/Suggesting category/)).toBeNull());

    // The value the user already had is untouched.
    expect(categorySelect().value).toBe("Medium");
    // No error surface of any kind: the manual dropdown is still usable, so a
    // failed suggestion is not something to tell the user about.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.body.textContent).not.toMatch(/error|failed|could not/i);
    // Asserted explicitly, because a component that logged to the console while
    // rendering nothing would pass every check above.
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("leaves the category unselected when the AI declines to suggest one", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    // A resolved null, not a rejection: the call succeeded and the answer was
    // "nothing to suggest". The two must look identical to the user, so
    // this asserts the same silence the failure case above does.
    classifyTextMock.mockResolvedValue(null);

    render(<Harness description="asdfgh" />);

    await waitFor(() => expect(classifyTextMock).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await waitFor(() => expect(screen.queryByText(/Suggesting category/)).toBeNull());

    // The placeholder is still selected, so the user picks for themselves.
    expect(categorySelect().value).toBe("");
    // No AI provenance cue, because nothing came from the AI to attribute.
    expect(screen.queryByText("AI suggested")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.body.textContent).not.toMatch(/error|failed|could not/i);
    expect(consoleError).not.toHaveBeenCalled();

    // Still usable: a decline must not leave the control stuck.
    fireEvent.change(categorySelect(), { target: { value: "Low" } });
    expect(categorySelect().value).toBe("Low");

    consoleError.mockRestore();
  });
});
