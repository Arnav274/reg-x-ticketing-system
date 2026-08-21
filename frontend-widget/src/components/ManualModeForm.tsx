import { useState } from "react";
import { useAuthContext } from "../hooks/useAuthContext";
import { createTicket, PRODUCT_NAMES, ProductName, TicketCategory } from "../api/ticketsApi";
import { AiModeToggle } from "./AiModeToggle";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

export interface ManualModeFormProps {
  // The page the widget was opened on, or null when it is not a product page.
  detectedProduct: ProductName | null;
  aiModeEnabled: boolean;
  onAiModeChange: (enabled: boolean) => void;
}

export function ManualModeForm({
  detectedProduct,
  aiModeEnabled,
  onAiModeChange,
}: ManualModeFormProps) {
  // Null until the token arrives, so every use of it below has to account for
  // the widget not being able to submit yet.
  const auth = useAuthContext();

  const [productName, setProductName] = useState<string>(PRODUCT_NAMES[0]);
  const [category, setCategory] = useState<TicketCategory | "">("");
  // What the AI actually proposed, kept separate from `category` so a user
  // override doesn't erase it, since that difference is the override-rate metric.
  const [aiSuggestedCategory, setAiSuggestedCategory] = useState<TicketCategory | null>(null);
  const [issueDescription, setIssueDescription] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const isSubmitDisabled =
    auth === null ||
    issueDescription.trim().length === 0 ||
    category === "" ||
    status === "submitting";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (category === "" || auth === null) {
      return; // narrows the types; the submit button is disabled in this state
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      await createTicket(
        {
          // A detected page always wins over the dropdown's state: product_name
          // records where the user actually was, so it must not be overridable
          // even if the control were somehow rendered alongside a detection.
          product_name: detectedProduct ?? productName,
          category,
          issue_description: issueDescription,
          // AI off means the ticket took the manual path, so no suggestion is
          // claimed even if one was received before the toggle was flipped.
          ai_suggested_category: aiModeEnabled ? aiSuggestedCategory : null,
          ai_mode_enabled: aiModeEnabled,
        },
        auth.token
      );
      setStatus("success");
      setIssueDescription("");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to submit ticket");
    }
  }

  return (
    <form className="tw-form" onSubmit={handleSubmit}>
      <p className="tw-identity">
        {auth === null
          ? "Connecting to your account..."
          : `Submitting as: ${auth.username} (${auth.email})`}
      </p>

      {detectedProduct === null ? (
        <div className="tw-field">
          <div className="tw-field__head">
            <label className="tw-label" htmlFor="product-name">
              Product
            </label>
          </div>
          <select
            className="tw-select"
            id="product-name"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
          >
            {PRODUCT_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="tw-field">
          <div className="tw-field__head">
            <span className="tw-label">Product</span>
          </div>
          <p className="tw-readout">{detectedProduct}</p>
        </div>
      )}

      <AiModeToggle
        aiModeEnabled={aiModeEnabled}
        onAiModeChange={onAiModeChange}
        issueDescription={issueDescription}
        value={category}
        onChange={setCategory}
        onAiSuggestion={setAiSuggestedCategory}
      />

      <div className="tw-field">
        <div className="tw-field__head">
          <label className="tw-label" htmlFor="issue-description">
            Describe the issue
          </label>
        </div>
        <textarea
          className="tw-textarea"
          id="issue-description"
          value={issueDescription}
          onChange={(e) => setIssueDescription(e.target.value)}
        />
      </div>

      <button type="submit" className="tw-submit" disabled={isSubmitDisabled}>
        Submit
      </button>

      {status === "success" && (
        <p className="tw-notice tw-notice--ok">Ticket submitted successfully.</p>
      )}
      {status === "error" && (
        <p className="tw-notice tw-notice--error" role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  );
}
