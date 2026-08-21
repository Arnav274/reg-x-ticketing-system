import { Request, Response, NextFunction } from "express";
import { classifyRateLimitMaxPerHour, rateLimitMaxPerHour } from "../config/env";

const WINDOW_MS = 60 * 60 * 1000;

interface RequestWindow {
  count: number;
  startedAt: number;
}

interface RateLimitOptions {
  max: number;
  // Builds the 429 message, so each limiter names the action it actually counts.
  // The submission limiter promises a number of tickets per hour, and the
  // ordering of middleware in the create chain rests on that promise being
  // true; a second limiter reusing that wording on an endpoint that creates no
  // ticket would make it false.
  describeLimit: (max: number) => string;
}

// A factory rather than one module-level counter, because classify and create
// are different actions and must not share a bucket. Each call closes over its
// own Map, so the two limits are independent by construction rather than by
// remembering to key them apart.
//
// In-memory by design: fine for the single backend instance this project runs,
// and a known simplification rather than an oversight. Two consequences worth
// being explicit about: the counts reset whenever the process restarts, and a
// second instance would keep its own separate counts, so the effective limit
// would double.
export function createRateLimiter({ max, describeLimit }: RateLimitOptions) {
  const windows = new Map<string, RequestWindow>();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const identity = req.identity;

    // Deliberately not the `req.identity!` assertion tickets.controller uses. If
    // this middleware is ever wired ahead of auth.middleware, that assertion would
    // make the limiter silently count everyone under one undefined key or skip
    // entirely, which is a security control failing open without a sound. Throwing
    // makes the misconfiguration immediate and loud instead.
    if (identity === undefined) {
      throw new Error(
        "rate limiting requires a verified identity: it must be mounted after authMiddleware"
      );
    }

    // Keyed on a claim from the verified token, never on the request body and
    // never on IP. Body fields are attacker-controlled, and IP would limit a whole
    // office to 10 tickets an hour while letting one user bypass the limit by
    // changing network. Email rather than username because it is the claim more
    // likely to be unique per person.
    const key = identity.email;
    const now = Date.now();
    const current = windows.get(key);

    // Fixed window: the first request starts the hour, and the hour resets whole
    // rather than sliding. This is what "hourly reset" in the spec describes, and
    // it accepts a known edge case, that a user can send the limit twice across a
    // window boundary.
    if (current === undefined || now - current.startedAt >= WINDOW_MS) {
      windows.set(key, { count: 1, startedAt: now });
      next();
      return;
    }

    if (current.count >= max) {
      res.status(429).json({
        error: `Rate limit exceeded. ${describeLimit(max)}`,
      });
      return;
    }

    current.count += 1;
    next();
  };
}

// The create-ticket limiter, unchanged in name, behaviour and message so
// tickets.route.ts needs no edit and the create path stays provably as it was.
export const rateLimitMiddleware = createRateLimiter({
  max: rateLimitMaxPerHour,
  describeLimit: (max) => `You may submit up to ${max} tickets per hour.`,
});

// Its own bucket. Classify spends money per call but creates nothing, so it is
// counted separately from submissions and says so in its own 429.
export const classifyRateLimitMiddleware = createRateLimiter({
  max: classifyRateLimitMaxPerHour,
  describeLimit: (max) => `You may request up to ${max} category suggestions per hour.`,
});
