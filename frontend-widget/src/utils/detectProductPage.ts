import { PRODUCT_NAMES, ProductName } from "../api/ticketsApi";

/**
 * Maps the page the widget is embedded on to its product name: the first path
 * segment is the product's slug, so `/analytics-hub`, `/analytics-hub/` and
 * `/analytics-hub/reports/42` all mean the Analytics Hub page.
 *
 * Slugs are derived from `PRODUCT_NAMES` rather than listed again, so the
 * mapping cannot drift from the one frontend product list. Returns `null` for
 * anything else, including `/`. A page we cannot identify is never guessed at,
 * because `product_name` is meant to record where the user actually was.
 */
export function detectProductPage(): ProductName | null {
  const [firstSegment] = window.location.pathname.split("/").filter(Boolean);
  if (firstSegment === undefined) {
    return null;
  }

  const slug = firstSegment.toLowerCase();
  return PRODUCT_NAMES.find((name) => name.toLowerCase().replaceAll(" ", "-") === slug) ?? null;
}
