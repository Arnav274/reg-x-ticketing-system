import { Request, Response, NextFunction } from "express";
import {
  ALLOWED_CATEGORIES,
  ISSUE_DESCRIPTION_MAX_LENGTH,
  TicketCategory,
} from "../db/models/ticket.model";
import { ALLOWED_PRODUCT_NAMES, ProductName } from "../config/productPages";

const ALLOWED_FIELDS = [
  "product_name",
  "category",
  "issue_description",
  "ai_suggested_category",
  "ai_mode_enabled",
] as const;

export interface ValidatedTicketBody {
  product_name: ProductName;
  category: TicketCategory;
  issue_description: string;
  ai_suggested_category?: TicketCategory | null;
  ai_mode_enabled?: boolean;
}

export function validateMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
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

  const { product_name, category, issue_description, ai_suggested_category, ai_mode_enabled } =
    body as Record<string, unknown>;

  if (typeof product_name !== "string" || product_name.trim().length === 0) {
    res.status(400).json({
      error: "product_name is required and must be a non-empty string",
    });
    return;
  }
  if (!ALLOWED_PRODUCT_NAMES.includes(product_name as ProductName)) {
    res.status(400).json({
      error: `product_name must be one of: ${ALLOWED_PRODUCT_NAMES.join(", ")}`,
    });
    return;
  }

  if (
    typeof category !== "string" ||
    !ALLOWED_CATEGORIES.includes(category as TicketCategory)
  ) {
    res.status(400).json({
      error: `category must be one of: ${ALLOWED_CATEGORIES.join(", ")}`,
    });
    return;
  }

  if (typeof issue_description !== "string" || issue_description.trim().length === 0) {
    res.status(400).json({
      error: "issue_description is required and must be a non-empty string",
    });
    return;
  }
  if (issue_description.length > ISSUE_DESCRIPTION_MAX_LENGTH) {
    res.status(400).json({
      error: `issue_description must be at most ${ISSUE_DESCRIPTION_MAX_LENGTH} characters`,
    });
    return;
  }
  // Postgres TEXT cannot hold a null byte, so one reaching the insert fails the
  // query and surfaces as a 500 for what is really bad input. Rejected here so
  // it returns 400 instead.
  //
  // Only the null byte. Other C0 controls were measured storing and reading back
  // without complaint, so rejecting the whole range would be guarding against a
  // problem that does not exist, and newline and tab are legitimate in a bug
  // report. The boundary is what the database physically cannot store, not a
  // general suspicion of unusual characters.
  if (issue_description.includes("\u0000")) {
    res.status(400).json({
      error: "issue_description must not contain null bytes",
    });
    return;
  }

  if (
    ai_suggested_category !== undefined &&
    ai_suggested_category !== null &&
    (typeof ai_suggested_category !== "string" ||
      !ALLOWED_CATEGORIES.includes(ai_suggested_category as TicketCategory))
  ) {
    res.status(400).json({
      error: `ai_suggested_category must be null or one of: ${ALLOWED_CATEGORIES.join(", ")}`,
    });
    return;
  }

  if (ai_mode_enabled !== undefined && typeof ai_mode_enabled !== "boolean") {
    res.status(400).json({ error: "ai_mode_enabled must be a boolean" });
    return;
  }

  next();
}
