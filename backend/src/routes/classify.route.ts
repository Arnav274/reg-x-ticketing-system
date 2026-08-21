import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { validateClassifyMiddleware } from "../middleware/validateClassify.middleware";
import { classifyRateLimitMiddleware } from "../middleware/rateLimit.middleware";
import { classifyController } from "../controllers/classify.controller";

const router = Router();

// Same order as the create chain, and for the same reasons. auth first
// because the limiter keys on a verified identity and throws without one.
// Validation before the limiter because a request rejected as too long never
// became a suggestion request and must not spend the user's quota; the check
// touches nothing external, so running it unthrottled is cheap.
//
// The limiter here is its own bucket, not the submission one: this endpoint
// creates no ticket, so counting it against a limit that promises "tickets per
// hour" would make that promise untrue.
router.post(
  "/classify",
  authMiddleware,
  validateClassifyMiddleware,
  classifyRateLimitMiddleware,
  classifyController
);

export default router;
