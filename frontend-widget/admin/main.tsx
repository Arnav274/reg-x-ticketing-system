import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TicketsTable } from "./TicketsTable";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Missing #root container in admin/index.html");
}

createRoot(container).render(
  <StrictMode>
    <TicketsTable />
  </StrictMode>,
);
