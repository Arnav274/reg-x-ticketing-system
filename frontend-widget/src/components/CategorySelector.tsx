import { useEffect, useRef, useState } from "react";
import { useAuthContext } from "../hooks/useAuthContext";
import { classifyText } from "../api/classifyApi";
import { CATEGORIES, TicketCategory } from "../api/ticketsApi";

const DEBOUNCE_MS = 500;

export interface CategorySelectorProps {
  issueDescription: string;
  value: TicketCategory | "";
  onChange: (category: TicketCategory) => void;
  // Fires only for AI-originated values, never for manual picks, so callers can
  // record what the AI actually suggested separately from the final choice.
  onAiSuggestion?: (category: TicketCategory) => void;
}

export function CategorySelector({
  issueDescription,
  value,
  onChange,
  onAiSuggestion,
}: CategorySelectorProps) {
  // Null until the token arrives; classification is skipped until then.
  const token = useAuthContext()?.token ?? null;
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  // Presentational only, and deliberately separate from hasManualOverrideRef
  // below: that ref is read at promise-arrival time to defeat stale closures,
  // and turning it into state would change when the guard sees a write. This
  // flag is never read by a request, a callback or the submitted payload. It
  // exists so the control can show whose choice is currently in it: an AI
  // suggestion should read as a suggestion, not a decision already made for
  // the user.
  const [isAiSuggested, setIsAiSuggested] = useState(false);

  const hasManualOverrideRef = useRef(false);
  const requestIdRef = useRef(0);
  const onChangeRef = useRef(onChange);
  const onAiSuggestionRef = useRef(onAiSuggestion);
  const tokenRef = useRef(token);
  onChangeRef.current = onChange;
  onAiSuggestionRef.current = onAiSuggestion;
  tokenRef.current = token;

  useEffect(() => {
    if (hasManualOverrideRef.current || issueDescription.trim().length === 0) {
      return;
    }

    const timer = setTimeout(() => {
      const token = tokenRef.current;
      if (token === null) {
        // No token yet, so skip silently rather than sending "Bearer null" and
        // showing a loading state for a request that would only 401. This
        // matches how a failed classification already degrades: no suggestion,
        // no error surfaced, the manual dropdown still works.
        return;
      }

      const requestId = ++requestIdRef.current;
      setStatus("loading");

      classifyText(issueDescription, token)
        .then((category) => {
          if (hasManualOverrideRef.current || requestId !== requestIdRef.current) {
            return;
          }
          if (category === null) {
            // The AI read the description and declined to suggest anything,
            // which happens when the text is not a recognisable product issue.
            // Deliberately indistinguishable from a failed call: clear the
            // pending state, leave the control on its placeholder, say nothing.
            // The user picks manually, the same fallback behavior as the
            // failure path, and ai_suggested_category stays null in the
            // submitted payload.
            setStatus("idle");
            return;
          }
          onAiSuggestionRef.current?.(category);
          onChangeRef.current(category);
          setIsAiSuggested(true);
          setStatus("idle");
        })
        .catch(() => {
          if (hasManualOverrideRef.current || requestId !== requestIdRef.current) {
            return;
          }
          setStatus("idle");
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [issueDescription]);

  function handleManualChange(event: React.ChangeEvent<HTMLSelectElement>) {
    hasManualOverrideRef.current = true;
    setStatus("idle");
    setIsAiSuggested(false);
    onChange(event.target.value as TicketCategory);
  }

  return (
    <div className="tw-field">
      {/*
        The badge sits outside the <label> on purpose. Nesting it would fold its
        text into the control's accessible name, which the suite queries by
        exactly ("Category").
      */}
      <div className="tw-field__head">
        <label className="tw-label" htmlFor="ai-category">
          Category
        </label>
        {isAiSuggested && <span className="tw-badge tw-badge--ai">AI suggested</span>}
        {status === "loading" && (
          <span className="tw-badge tw-badge--pending">Suggesting category…</span>
        )}
      </div>
      <select
        className={isAiSuggested ? "tw-select tw-select--ai" : "tw-select"}
        id="ai-category"
        value={value}
        onChange={handleManualChange}
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
  );
}
