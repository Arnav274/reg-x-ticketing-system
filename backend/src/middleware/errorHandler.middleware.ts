import { ErrorRequestHandler } from "express";

// Express 5 forwards a rejected promise from an async handler to the error
// chain automatically, which is what makes this a genuine safety net rather
// than something that only catches synchronous throws. createTicketController
// is async and has no try/catch, so a database failure arrives here.

function resolveStatus(error: unknown): number {
  // express.json() rejects a malformed body with a SyntaxError carrying
  // `status: 400`, which is the http-errors convention several Express
  // internals follow. Honour an explicit client-error status when one is
  // present, since the caller genuinely caused it.
  //
  // Only 4xx is honoured. Nothing in this codebase throws an error tagged with
  // a 5xx status: classify's 502 is returned directly by its controller, and
  // auth's 401 and validation's 400 are likewise returned rather than thrown.
  // So anything else reaching here is unexpected, and unexpected means 500.
  if (typeof error === "object" && error !== null) {
    const candidate = error as { status?: unknown; statusCode?: unknown };
    const status =
      typeof candidate.status === "number" ? candidate.status : candidate.statusCode;

    if (typeof status === "number" && status >= 400 && status <= 499) {
      return status;
    }
  }

  return 500;
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  // Once the response has started there is nothing left to rewrite, so hand
  // back to Express's default handler, which aborts the connection.
  if (res.headersSent) {
    next(error);
    return;
  }

  const status = resolveStatus(error);

  // Logged in full, always. The goal is to stop internals reaching the client,
  // not to lose them: without this the 500 path would discard the only record
  // of what actually failed.
  console.error("Unhandled error on request:", error);

  // A 4xx message is either written by this codebase or describes the caller's
  // own malformed input, so it is safe to return. A 5xx message can carry SQL
  // text, driver internals or absolute file paths, so it never is.
  const message =
    status < 500 && error instanceof Error ? error.message : "Internal server error";

  // Same `{ error }` shape auth.middleware and validate.middleware already
  // return, so clients have one error contract rather than two.
  res.status(status).json({ error: message });
};
