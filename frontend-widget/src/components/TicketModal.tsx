import { useState } from "react";
import "../styles/widget.css";
import { ManualModeForm } from "./ManualModeForm";
import { ProductName } from "../api/ticketsApi";
import { detectProductPage } from "../utils/detectProductPage";
import { captureEnvironment } from "../utils/captureEnvironment";

export function TicketModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [detectedProduct, setDetectedProduct] = useState<ProductName | null>(null);
  // Deliberately outside the isOpen subtree: closing unmounts the form, which
  // is what discards its content, but AI mode is a user preference
  // rather than form content, so it survives close/reopen for this session.
  const [aiModeEnabled, setAiModeEnabled] = useState(true);

  // Both utils run per open rather than once at mount, because a host SPA can
  // route between product pages without remounting the widget, which would
  // otherwise leave the first page's answer stuck for the whole session. Doing
  // it here rather than in an effect also keeps it to one run per open: an
  // effect keyed on `isOpen` fires twice per open under StrictMode.
  function handleOpen() {
    setDetectedProduct(detectProductPage());

    // The capture itself is unconditional, in every build. The widget is
    // required to query the environment automatically; nothing says it must
    // also be disclosed, so gating the call would make the requirement depend
    // on build mode. Only the log is development-only, which is what keeps a
    // real user's browser console from being written to with their user agent.
    //
    // Still diagnostic context only: never rendered to the user, and never added
    // to the request body, which carries exactly the five allowlisted fields.
    const environment = captureEnvironment();
    if (import.meta.env.DEV) {
      console.log("[ticket-widget] environment", environment);
    }

    setIsOpen(true);
  }

  return (
    <div className="tw">
      <button type="button" className="tw-launch" onClick={handleOpen}>
        Report an Issue
      </button>

      {isOpen && (
        // The overlay is what makes the dialog read as a dialog: until now the
        // aria-modal semantics claimed a modal while the markup rendered inline
        // in the host page's flow, with nothing separating the two.
        <div className="tw-overlay">
          <div
            className="tw-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tw-modal-title"
          >
            <div className="tw-modal__head">
              <h2 className="tw-modal__title" id="tw-modal-title">
                Report an Issue
              </h2>
              <button
                type="button"
                className="tw-modal__close"
                aria-label="Close"
                onClick={() => setIsOpen(false)}
              >
                ×
              </button>
            </div>
            <ManualModeForm
              detectedProduct={detectedProduct}
              aiModeEnabled={aiModeEnabled}
              onAiModeChange={setAiModeEnabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}
