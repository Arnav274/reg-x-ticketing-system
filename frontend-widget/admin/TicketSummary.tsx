import { CATEGORIES, PRODUCT_NAMES, Ticket } from "../src/api/ticketsApi";

// Counted here in the browser, from the rows the page already holds. There is no
// aggregate endpoint on purpose: findTickets() has no LIMIT and no pagination,
// so every row a GROUP BY would visit is already in memory
// before this component renders, and a server-side version would need a model
// function, a service, a controller, a route, a client function and a second
// implementation of the filter semantics to recompute numbers that are already
// here. The one thing that invalidates this: if the list endpoint ever
// paginates, these become counts of the current page while still claiming to
// describe the filtered set, and they have to move to the server in that change.

// Every key appears in the result, including keys with no tickets. A product
// page that generated nothing is a real answer to the question this panel
// exists for, and an absent row is indistinguishable from a rendering bug.
function tally<T extends string>(
  keys: readonly T[],
  values: readonly string[]
): Array<{ key: T; count: number }> {
  return keys.map((key) => ({
    key,
    count: values.filter((value) => value === key).length,
  }));
}

// Sized against the largest count in its own group, so each panel uses its full
// width rather than being scaled by the other one. The zero state has no largest
// count to divide by, which is the guard rather than an impossible case: it is
// what any filter matching nothing produces.
function barWidth(count: number, max: number): string {
  return max === 0 ? "0%" : `${Math.round((count / max) * 100)}%`;
}

interface BarRow {
  key: string;
  count: number;
  // Selects the fill colour in admin.css rather than carrying a colour here,
  // which is how the table's severity chips already work.
  fill: string;
}

function BarGroup({ heading, rows }: { heading: string; rows: BarRow[] }) {
  const max = Math.max(0, ...rows.map((row) => row.count));

  return (
    <div className="ad-summary-group">
      <h3 className="ad-summary-heading">{heading}</h3>
      <ul className="ad-bars">
        {rows.map((row) => (
          <li className="ad-bar" key={row.key}>
            <span className="ad-bar-name">{row.key}</span>
            {/* The bar is redundant encoding, never the only encoding: the
                number beside it carries the data on its own, so a colourblind
                reader or a stylesheet that failed to load still gets every
                count. Hidden from assistive tech for the same reason - it would
                otherwise announce an element that says nothing the text does
                not already say. */}
            <span className="ad-bar-track" aria-hidden="true">
              <span
                className={`ad-bar-fill ad-bar-fill--${row.fill}`}
                style={{ width: barWidth(row.count, max) }}
              />
            </span>
            <span className="ad-bar-count">{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TicketSummary({ tickets }: { tickets: Ticket[] }) {
  // Descending, because the question this answers is literally "which page
  // generates the most". Sort is stable, so products on equal counts keep
  // PRODUCT_NAMES order instead of swapping places between renders.
  const byProduct: BarRow[] = tally(
    PRODUCT_NAMES,
    tickets.map((ticket) => ticket.product_name)
  )
    .map((row) => ({ ...row, fill: "product" }))
    .sort((a, b) => b.count - a.count);

  // Fixed severity order, never by count: a severity list that reorders itself
  // between loads is harder to read than one that holds still.
  const byCategory: BarRow[] = tally(
    CATEGORIES,
    tickets.map((ticket) => ticket.category)
  ).map((row) => ({ ...row, fill: row.key.toLowerCase() }));

  return (
    <section className="ad-summary" aria-labelledby="ad-summary-title">
      {/* States the filtered total rather than a bare "Summary", because these
          counts describe the rows currently matching the filters and not the
          whole table. Selecting one product collapses the product panel to a
          single bar, which is correct - the summary must always agree with the
          rows underneath it - but only honest if the panel says what set it is
          describing. With no filters set, which is the state on load, this is
          the whole table. */}
      <h2 className="ad-summary-title" id="ad-summary-title">
        Across the {tickets.length} ticket{tickets.length === 1 ? "" : "s"} matching these filters
      </h2>

      <div className="ad-summary-groups">
        <BarGroup heading="By product" rows={byProduct} />
        <BarGroup heading="By category" rows={byCategory} />
      </div>
    </section>
  );
}
