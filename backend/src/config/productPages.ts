// Canonical set of product pages the widget can be embedded on. This is the
// authority for validating `product_name`; nothing else should re-declare it.
//
// The URL -> product_name mapping the widget detects against (path-based, first
// path segment) is implemented separately in
// `frontend-widget/src/utils/detectProductPage.ts`. The frontend is its own npm
// project and cannot import from here, so that list is a deliberate mirror and
// must be kept in sync with this one by hand.
export const ALLOWED_PRODUCT_NAMES = [
  "Analytics Hub",
  "User Portal",
  "Billing Engine",
  "Settings Suite",
] as const;

export type ProductName = (typeof ALLOWED_PRODUCT_NAMES)[number];
