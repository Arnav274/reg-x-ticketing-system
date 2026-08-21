// defineConfig comes from vitest/config rather than vite so the `test` block
// below is typed. It is the same function re-exported, so the dev server and
// the production build are unaffected by the swap.
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The four paths fixed by the URL contract. They are written out here
// rather than derived from PRODUCT_NAMES or from detectProductPage.ts on
// purpose: the demo pages implement that contract independently of the
// detector, so that opening one proves detection works instead of proving the
// detector agrees with itself.
const DEMO_PAGE_PATHS = [
  "/analytics-hub",
  "/user-portal",
  "/billing-engine",
  "/settings-suite",
];

// Vite serves demo/analytics-hub.html at /demo/analytics-hub.html, but the
// contract puts the page at /analytics-hub, so the dev server rewrites the
// contract path onto the real file. Without this the paths would fall through
// to the SPA fallback, which serves the widget's own dev page at every URL and
// would make a passing detection test meaningless.
function demoPageRoutes(): Plugin {
  return {
    name: "demo-page-routes",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        // A trailing slash names the same page in the contract, so /user-portal
        // and /user-portal/ must not diverge here.
        const path = (req.url ?? "").split("?")[0].replace(/\/$/, "");
        if (DEMO_PAGE_PATHS.includes(path)) {
          req.url = `/demo${path}.html`;
        }
        // The admin table, served the same way and for the same reason:
        // without an explicit route the SPA fallback answers /admin with the
        // widget's own dev page, which looks like a working route while
        // rendering the wrong thing. Only the exact path is rewritten, so
        // /admin/main.tsx still resolves to the real module.
        if (path === "/admin") {
          req.url = "/admin/index.html";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), demoPageRoutes()],
  test: {
    // Component tests need a DOM. Headless only: no browser driver, so this
    // suite runs unchanged in CI.
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
  },
});
