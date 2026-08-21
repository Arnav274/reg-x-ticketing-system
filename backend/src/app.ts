import express from "express";
import { env, allowedOrigins, devAuthEnabled } from "./config/env";
import ticketsRoute from "./routes/tickets.route";
import classifyRoute from "./routes/classify.route";
import devAuthRoute from "./routes/devAuth.route";
import { errorHandler } from "./middleware/errorHandler.middleware";

const app = express();

// Scoped to a configured allowlist (never "*"), so the header is only ever
// sent back to origins this deployment actually trusts.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    // GET is listed because the read endpoint accepts it, so the header
    // describes the API accurately. It is not what makes the browser's read
    // work: GET is a CORS-safelisted method, so a preflight passes its method
    // check whether or not GET appears here. Measured by removing it and
    // watching a real browser succeed anyway.
    //
    // PATCH is the opposite case and the distinction matters: it is NOT
    // a safelisted method, so for the status endpoint this list IS load-bearing.
    // Remove PATCH and curl still succeeds, because curl never preflights, while
    // every real browser fails the preflight before the request is ever sent.
    // Verified both ways in a real browser rather than assumed.
    //
    // Authorization in Allow-Headers below IS load-bearing, and it is the reason
    // an authenticated GET preflights at all. Removing it blocks the request in
    // a real browser while curl, which never preflights, still gets a 200.
    // Verified both ways rather than assumed.
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/v1/tickets", ticketsRoute);
app.use("/api/v1/tickets", classifyRoute);

// Mounted only when explicitly enabled, so a deployment with the flag off has
// no route to this at all and the URL 404s like any other unknown path. The
// alternative, always mounting it and returning 403 from inside the handler,
// would leave a live token-issuing endpoint in production whose safety rests on
// one correct comparison inside a request handler.
if (devAuthEnabled) {
  console.warn(
    "DEV_AUTH_ENABLED is true: POST /api/v1/dev/token will issue signed tokens without authentication. Never enable this in a deployed environment."
  );
  app.use("/api/v1/dev", devAuthRoute);
}

// Last in the chain, after every route, because Express only reaches an error
// handler that is registered downstream of whatever failed. Anything thrown or
// rejected in the routes above arrives here instead of at Express's default
// handler, which answers a JSON API with an HTML page.
app.use(errorHandler);

const port = Number(env.PORT);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
