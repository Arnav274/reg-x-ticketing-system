import { Request, Response, NextFunction } from "express";
import { ISSUE_DESCRIPTION_MAX_LENGTH } from "../db/models/ticket.model";

// Separate from validate.middleware.ts, which validates the create body against
// its five-field contract. Teaching that function a second contract would make
// one file serve two endpoints, the same reasoning that keeps the read path's
// query-parameter parsing out of it too.
//
// Middleware rather than a helper the controller calls, because it has to run
// before the rate limiter: a request rejected as too long never became a
// suggestion request, so it must not spend the user's quota, the same ordering
// argument that governs the create chain.
//
// Only the length and the type are checked here. The create path's
// unexpected-field allowlist and its null-byte rejection are deliberately not
// mirrored: nothing on this path is stored, so a null byte has no database to
// break, and the allowlist is a separate decision that was never made for this
// endpoint.
export function validateClassifyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const body: unknown = req.body;

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    res.status(400).json({ error: "Request body must be a JSON object" });
    return;
  }

  const { issue_description } = body as Record<string, unknown>;

  if (typeof issue_description !== "string" || issue_description.trim().length === 0) {
    res.status(400).json({
      error: "issue_description is required and must be a non-empty string",
    });
    return;
  }

  // The same cap the create path applies to the same field, imported rather
  // than repeated. Without it this endpoint would forward an unbounded body to
  // the provider on every authenticated call.
  if (issue_description.length > ISSUE_DESCRIPTION_MAX_LENGTH) {
    res.status(400).json({
      error: `issue_description must be at most ${ISSUE_DESCRIPTION_MAX_LENGTH} characters`,
    });
    return;
  }

  next();
}
