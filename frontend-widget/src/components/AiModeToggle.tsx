import { useRef } from "react";
import { CategorySelector } from "./CategorySelector";
import { CATEGORIES, TicketCategory } from "../api/ticketsApi";

export interface AiModeToggleProps {
  aiModeEnabled: boolean;
  onAiModeChange: (enabled: boolean) => void;
  issueDescription: string;
  value: TicketCategory | "";
  onChange: (category: TicketCategory) => void;
  onAiSuggestion: (category: TicketCategory) => void;
}

export function AiModeToggle({
  aiModeEnabled,
  onAiModeChange,
  issueDescription,
  value,
  onChange,
  onAiSuggestion,
}: AiModeToggleProps) {
  // Turning AI mode off unmounts CategorySelector, which cancels a pending
  // debounce but cannot cancel a request already in flight, and that promise still
  // resolves and calls the onChange it captured while mounted. Reading the flag
  // from a ref at arrival time (rather than closing over it) is what lets that
  // late suggestion be discarded: the captured callback was created on a render
  // when aiModeEnabled was still true, so a plain closure would let it through.
  const aiModeEnabledRef = useRef(aiModeEnabled);
  aiModeEnabledRef.current = aiModeEnabled;

  // Fires for both AI suggestions and the user's own picks, so it must not
  // record provenance; it only propagates the value.
  function handleValueChange(category: TicketCategory) {
    if (!aiModeEnabledRef.current) {
      return;
    }
    onChange(category);
  }

  function handleAiSuggestion(category: TicketCategory) {
    if (!aiModeEnabledRef.current) {
      return;
    }
    onAiSuggestion(category);
  }

  return (
    <div className="tw-ai">
      <label className="tw-toggle" htmlFor="ai-mode">
        <input
          id="ai-mode"
          type="checkbox"
          checked={aiModeEnabled}
          onChange={(event) => onAiModeChange(event.target.checked)}
        />
        AI mode
      </label>

      {aiModeEnabled ? (
        <CategorySelector
          issueDescription={issueDescription}
          value={value}
          onChange={handleValueChange}
          onAiSuggestion={handleAiSuggestion}
        />
      ) : (
        <div className="tw-field">
          <div className="tw-field__head">
            <label className="tw-label" htmlFor="manual-category">
              Category
            </label>
          </div>
          <select
            className="tw-select"
            id="manual-category"
            value={value}
            onChange={(event) => onChange(event.target.value as TicketCategory)}
          >
            <option value="" disabled>
              Select a category
            </option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
