import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TicketModal } from "./components/TicketModal";

const container = document.createElement("div");
document.body.appendChild(container);

createRoot(container).render(
  <StrictMode>
    <TicketModal />
  </StrictMode>,
);
