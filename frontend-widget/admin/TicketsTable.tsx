import { useCallback, useEffect, useRef, useState } from "react";
import "./admin.css";
import { TicketSummary } from "./TicketSummary";
import { useAuthContextState } from "../src/hooks/useAuthContext";
import {
  CATEGORIES,
  listTickets,
  PRODUCT_NAMES,
  STATUSES,
  Ticket,
  TicketCategory,
  TicketStatus,
  updateTicketStatus,
} from "../src/api/ticketsApi";

type LoadStatus = "loading" | "ready" | "error";

// A date input gives "YYYY-MM-DD". Sent as-is, a `to` of today would mean
// midnight and exclude everything filed during the day it names, so each bound
// is widened to the edge of the day the user picked. Both ends of the range are
// inclusive server-side, so this makes one date cover that whole day.
function startOfDay(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function endOfDay(date: string): string {
  return `${date}T23:59:59.999Z`;
}

// One date convention for the whole console. toLocaleString() picked a format
// per machine and rendered M/D/YYYY here, which disagreed with the date inputs
// below on the same screen. Those inputs cannot be told what to display, since
// that format is browser chrome driven by the OS locale, but their underlying
// value is always YYYY-MM-DD, so the table follows the convention the controls
// actually use. Still built from local-time parts, exactly what toLocaleString
// was showing, so this changes the formatting and not the instant.
function formatTimestamp(iso: string): string {
  const at = new Date(iso);
  const pad = (part: number) => String(part).padStart(2, "0");
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return `${date} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

// Wire values are lowercase, both stored and transmitted that way, so
// capitalisation is display only and lives here. Only the first letter
// changes: "in progress" reads "In progress", not "In Progress".
function formatStatus(status: TicketStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function TicketsTable() {
  // Null until the dev token arrives. Every fetch below waits for it rather
  // than sending `Bearer null`, which the backend would answer with a 401.
  // `authFailed` is what separates a null that is still coming from one that
  // never will, so the wait below ends instead of running forever.
  const { auth, failed: authFailed } = useAuthContextState();

  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState<TicketCategory | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  // Which rows have a status update in flight, held as a set of ticket ids
  // rather than a single id because nothing stops two rows being updated at
  // once, and one id would re-enable the first row's control the moment the
  // second started.
  const [pendingStatusIds, setPendingStatusIds] = useState<ReadonlySet<string>>(new Set());
  const [statusErrorMessage, setStatusErrorMessage] = useState("");

  // The control the browser should be returned to once its update settles.
  // Disabling an element moves focus to the body and re-enabling never brings it
  // back, so without this a keyboard user loses their place on every single
  // change and has to tab in from the top again to triage the next row. One slot
  // rather than one per row, because focus is singular: if a second row is
  // changed while the first is still in flight, the second is where the user is.
  const refocusRef = useRef<{ ticketId: string; control: HTMLSelectElement } | null>(null);

  // Changing a filter starts a new request without waiting for the previous one,
  // so two can be in flight at once and they are not guaranteed to come back in
  // the order they were sent. Without this the last response to *resolve* would
  // win instead of the last one *requested*, and the table would show rows that
  // do not match the controls on screen.
  //
  // Same guard CategorySelector uses for the same reason: take a ticket
  // number before the call, and on settle only apply the result if no newer call
  // has started since. An AbortController would also work, but it would then
  // have to tell a deliberate abort apart from a real network failure to keep
  // the error banner from firing on every superseded request, which is more
  // moving parts for the same outcome.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (authFailed) {
      // Reuses the list-failure banner below rather than adding a second
      // failure surface: from this page's side both mean the same thing, that
      // the backend could not be reached and there is nothing to show.
      setErrorMessage("could not authenticate with the backend");
      setStatus("error");
      return;
    }

    if (auth === null) {
      return;
    }

    const requestId = ++requestIdRef.current;
    setStatus("loading");
    try {
      const rows = await listTickets(
        {
          product_name: productName,
          category,
          from: from ? startOfDay(from) : "",
          to: to ? endOfDay(to) : "",
        },
        auth.token
      );
      if (requestId !== requestIdRef.current) {
        return;
      }
      setTickets(rows);
      setStatus("ready");
    } catch (err) {
      // Guarded too, not just the success path above: a superseded request that
      // fails must not paint the error banner over a newer load that succeeded.
      if (requestId !== requestIdRef.current) {
        return;
      }
      // Unlike CategorySelector, a failure here is shown. That component stays
      // silent because a failed AI suggestion still leaves a usable manual
      // dropdown; this page has no fallback at all, so a silent failure would
      // be indistinguishable from "there are no tickets".
      setErrorMessage(err instanceof Error ? err.message : "Failed to load tickets");
      setStatus("error");
    }
  }, [auth, authFailed, productName, category, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = useCallback(
    async (ticketId: string, nextStatus: TicketStatus, control: HTMLSelectElement) => {
      // Not a reachable failure path: a control only exists inside the ready
      // branch below, which is only rendered after a load that needed this
      // token. It is here so the token is non-null at the call.
      if (auth === null) {
        return;
      }

      // Only worth restoring if this control is where the user actually is. A
      // change can also arrive from a pointer, and the effect below refuses to
      // move focus that was never taken, so recording it unconditionally would
      // be recording something that must not be acted on.
      if (document.activeElement === control) {
        refocusRef.current = { ticketId, control };
      }

      setStatusErrorMessage("");
      setPendingStatusIds((ids) => new Set(ids).add(ticketId));

      try {
        const updated = await updateTicketStatus(ticketId, nextStatus, auth.token);
        // Keyed into whatever the table holds when the response lands, not into
        // the array this call started from. A filter change may have replaced
        // the list while the PATCH was in flight, and a row the new filter
        // excludes has to stay gone rather than being resurrected by its own
        // response. Deliberately not sequenced through requestIdRef: that
        // counter belongs to list loads, and bumping it here would silently
        // abandon a list request that is legitimately in flight.
        setTickets((rows) =>
          rows.map((row) => (row.ticket_id === updated.ticket_id ? updated : row))
        );
      } catch (err) {
        // Nothing to roll back: the control reads its value from the row, and a
        // failed update leaves that row untouched, so it already shows the real
        // status. Shown rather than swallowed for the same reason the load
        // banner exists - this page has no fallback, so a silent no-op looks
        // exactly like a working update.
        setStatusErrorMessage(err instanceof Error ? err.message : "Failed to update status");
      } finally {
        setPendingStatusIds((ids) => {
          const remaining = new Set(ids);
          remaining.delete(ticketId);
          return remaining;
        });
      }
    },
    [auth]
  );

  // Returns focus to the control once its own update settles. Keyed on
  // pendingStatusIds because that set is the pending -> settled transition, and
  // an effect is what makes this land *after* React has committed the re-enable:
  // focus() on a still-disabled element is dropped on the floor. The same set
  // firing on the way in is why the first guard exists - that run is the disable,
  // not the settle.
  useEffect(() => {
    const target = refocusRef.current;
    if (target === null || pendingStatusIds.has(target.ticketId)) {
      return;
    }

    refocusRef.current = null;

    // Only when the disable is still what is holding focus. If the user tabbed
    // on to another control while the request was in flight, or the row left the
    // table on a filter change, then taking focus back would be a worse
    // interruption than the loss this repairs.
    if (document.activeElement === document.body) {
      target.control.focus();
    }
  }, [pendingStatusIds]);

  return (
    <main className="ad">
      <header className="ad-head">
        <h1 className="ad-title">Tickets</h1>

        {auth === null ? (
          // Dropped once the request has failed, so the page is not claiming to
          // be waiting for something that is not coming while the banner below
          // says it already gave up.
          !authFailed && <p className="ad-identity">Waiting for authentication...</p>
        ) : (
          <p className="ad-identity">
            Signed in as {auth.username} ({auth.email})
          </p>
        )}
      </header>

      <section className="ad-filters">
        <div className="ad-filter">
          <label className="ad-label" htmlFor="filter-product">
            Product
          </label>
          <select
            className="ad-input"
            id="filter-product"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
          >
            <option value="">All products</option>
            {PRODUCT_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="ad-filter">
          <label className="ad-label" htmlFor="filter-category">
            Category
          </label>
          <select
            className="ad-input"
            id="filter-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as TicketCategory | "")}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="ad-filter">
          <label className="ad-label" htmlFor="filter-from">
            From
          </label>
          <input
            className="ad-input"
            id="filter-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>

        <div className="ad-filter">
          <label className="ad-label" htmlFor="filter-to">
            To
          </label>
          <input
            className="ad-input"
            id="filter-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </section>

      {status === "loading" && <p className="ad-notice">Loading tickets...</p>}
      {status === "error" && (
        <p className="ad-notice ad-notice--error" role="alert">
          Could not load tickets: {errorMessage}
        </p>
      )}

      {/* Its own line rather than the load banner above, which cannot be reused:
          that one renders only while status is "error", and the table renders
          only while status is "ready", so routing an update failure through it
          would blank the table. Page-level rather than per-row because the table
          is fixed-layout with declared column widths, so a server message inside
          one cell would reflow its row; the failing row identifies itself by its
          control still showing the old value. */}
      {statusErrorMessage !== "" && (
        <p className="ad-notice ad-notice--error" role="alert">
          Could not update status: {statusErrorMessage}
        </p>
      )}

      {status === "ready" && (
        <>
          {/* Inside the ready branch rather than above it, even though the issue
              places the summary "between the filters and the table". Rendering it
              while a load is in flight would put counts on screen next to a table
              that says "Loading tickets...", which is exactly the summary
              disagreeing with the rows it claims to describe. Same state, same
              branch, so the two cannot diverge. */}
          <TicketSummary tickets={tickets} />

          <p className="ad-count">
            {tickets.length} ticket{tickets.length === 1 ? "" : "s"}
          </p>

          {tickets.length === 0 ? (
            <p className="ad-notice">No tickets match these filters.</p>
          ) : (
            <div className="ad-tablewrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th className="ad-col-date">Date</th>
                  <th className="ad-col-product">Product</th>
                  <th className="ad-col-category">Category</th>
                  <th className="ad-col-status">Status</th>
                  <th className="ad-col-user">User</th>
                  <th className="ad-col-ai">AI suggestion</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.ticket_id}>
                    <td className="ad-date">{formatTimestamp(ticket.datetime)}</td>
                    <td>{ticket.product_name}</td>
                    <td>
                      {/* Severity carried by the chip's colour as well as its
                          text, so the urgent rows separate from the rest
                          without having to be read one by one. */}
                      <span className={`ad-chip ad-chip--${ticket.category.toLowerCase()}`}>
                        {ticket.category}
                      </span>
                    </td>
                    <td>
                      {/* No status chip and no new colour: tokens.css keeps the
                          severity hues semantic and gives the accent one job
                          (primary action, focus, AI provenance), so a coloured
                          status would read as a severity or as an AI suggestion.
                          The control's presence is the affordance. */}
                      <select
                        className="ad-input ad-input--sm"
                        // There is one of these per row, so "Status" alone would
                        // announce the same name once per row. ticket_id is the
                        // only field guaranteed unique - product and timestamp
                        // can both repeat - so it is what names the control:
                        // verbose, but never ambiguous.
                        aria-label={`Status for ticket ${ticket.ticket_id}`}
                        value={ticket.status}
                        // So a second click cannot send a second update for the
                        // same row while the first is still in flight.
                        disabled={pendingStatusIds.has(ticket.ticket_id)}
                        onChange={(e) =>
                          void changeStatus(
                            ticket.ticket_id,
                            e.target.value as TicketStatus,
                            e.target
                          )
                        }
                      >
                        {STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {formatStatus(value)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="ad-user">{ticket.username}</td>
                    {/*
                      "AI: no suggestion" describes the stored record and
                      deliberately does not claim the AI declined. A decline is
                      never persisted as such, and it records itself exactly
                      the way a manual pick with AI mode on already does, so this
                      cell cannot tell the two apart and must not imply it can.
                      It replaces the previous "none", which said the same thing
                      too quietly to read as deliberate.
                    */}
                    <td className="ad-ai">
                      {ticket.ai_mode_enabled
                        ? (ticket.ai_suggested_category ?? "AI: no suggestion")
                        : "AI off"}
                    </td>
                    {/*
                      issue_description is stored raw and byte-identical,
                      so this cell is where the XSS boundary actually is. It is a
                      JSX expression child, which React renders as a text node,
                      so markup in the stored text is displayed rather than
                      parsed. Never render this through dangerouslySetInnerHTML,
                      innerHTML, or any HTML-rendering library: doing so would
                      execute stored user input and would silently undo the
                      decision to keep bug reports intact on the way in.
                    */}
                    <td className="ad-desc">{ticket.issue_description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
