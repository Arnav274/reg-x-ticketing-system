import { Request, Response, NextFunction } from "express";
import { ALLOWED_STATUSES, TicketStatus } from "../db/models/ticket.model";

// One file per body contract, which is the reasoning validateClassify.middleware
// already records: teaching validate.middleware.ts a second shape would make one
// function serve two endpoints with different rules.
//
// Unlike the classify path, this one writes to the database, so the create
// path's unexpected-field allowlist is mirrored here rather than skipped. It
// was left off classify specifically because nothing there is stored and a
// stray field therefore has no row to corrupt; that argument does not apply.
const ALLOWED_FIELDS = ["status"] as const;

// Deliberately stricter than Postgres, which also accepts braced and unhyphenated
// forms. The point is not to replicate the database's parser but to guarantee
// that whatever reaches it cannot throw: a malformed id makes Postgres raise
// `invalid input syntax for type uuid`, which reaches errorHandler and returns a
// generic 500 for what is plainly the caller's mistake. That exact failure shape
// was measured directly on query parameters.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ValidatedStatusBody {
  status: TicketStatus;
}

// Express 5 types params as `string | string[]`, because a name repeated in a
// path can capture more than once. `:ticket_id` appears exactly once in this
// route, so naming the shape here is a statement of what the path can produce
// rather than a cast that hides the union.
//
// A type alias rather than an interface on purpose: only aliases get an implicit
// index signature, so an interface of the same shape is not assignable to
// express's ParamsDictionary and the route registration below fails to compile.
export type TicketIdParams = {
  ticket_id: string;
};

export function validateStatusMiddleware(
  req: Request<TicketIdParams>,
  res: Response,
  next: NextFunction
): void {
  if (!UUID_PATTERN.test(req.params.ticket_id ?? "")) {
    res.status(400).json({ error: "ticket_id must be a UUID" });
    return;
  }

  const body: unknown = req.body;

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    res.status(400).json({ error: "Request body must be a JSON object" });
    return;
  }

  const unexpectedFields = Object.keys(body).filter(
    (key) => !ALLOWED_FIELDS.includes(key as (typeof ALLOWED_FIELDS)[number])
  );
  if (unexpectedFields.length > 0) {
    res.status(400).json({
      error: `Unexpected field(s): ${unexpectedFields.join(", ")}`,
    });
    return;
  }

  const { status } = body as Record<string, unknown>;

  if (typeof status !== "string" || !ALLOWED_STATUSES.includes(status as TicketStatus)) {
    res.status(400).json({
      error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}`,
    });
    return;
  }

  next();
}
