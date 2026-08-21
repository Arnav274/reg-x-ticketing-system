import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { validateMiddleware } from "../middleware/validate.middleware";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";
import { validateStatusMiddleware } from "../middleware/validateStatus.middleware";
import {
  createTicketController,
  listTicketsController,
  updateTicketStatusController,
} from "../controllers/tickets.controller";

const router = Router();

// Order matters. auth first, because the limiter keys on a verified identity
// and throws without one. validate before the limiter, because the 429 promises
// a number of tickets per hour, so a request rejected as malformed never became
// a submission and must not spend the user's quota. Validation touches no
// database and makes no AI call, so running it on unthrottled traffic is cheap.
router.post(
  "/create",
  authMiddleware,
  validateMiddleware,
  rateLimitMiddleware,
  createTicketController
);

// Read side. Authenticated like every other protected route, and deliberately
// NOT rate limited: the limiter counts ticket submissions, so putting it here
// would let ten refreshes of the admin table exhaust a user's quota for
// actually filing tickets, and its own 429 message would then be untrue.
//
// Any valid token reads every ticket, including other users'. That is an
// accepted limitation rather than an oversight: the specification asks for JWT
// verification on all endpoints and never mentions roles, so this is
// authentication without authorization.
router.get("/", authMiddleware, listTicketsController);

// Status changes. PATCH rather than POST because this is a partial update to an
// existing resource, and rather than PUT because the body is not the whole
// ticket. The path names the sub-resource being changed so this cannot quietly
// grow into a general ticket editor.
//
// Deliberately NOT rate limited, and that is a decision rather than an omission.
// The 10/hour bucket counts ticket submissions and its own 429 message says so,
// which is why it stays off the read path too; this endpoint creates no ticket.
// The separate classify bucket exists because that path spends provider money
// per call, while this one costs a single UPDATE.
//
// Authorization is the same as everywhere else in this API, which is to say
// none: any valid token may change any ticket's status, including another
// user's. That is an acknowledged limitation, not something that slipped
// through unnoticed.
router.patch(
  "/:ticket_id/status",
  authMiddleware,
  validateStatusMiddleware,
  updateTicketStatusController
);

export default router;
