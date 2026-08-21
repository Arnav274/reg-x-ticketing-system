import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";

declare global {
  namespace Express {
    interface Request {
      identity?: { username: string; email: string };
    }
  }
}

const BEARER_PREFIX = "Bearer ";

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();

  let payload: JwtPayload;
  try {
    // Pinning the algorithm prevents a forged token from selecting its own
    // (e.g. "none") via the JWT header.
    const verified = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (typeof verified === "string") {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    payload = verified;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const { username, email } = payload;

  if (typeof username !== "string" || typeof email !== "string") {
    res.status(401).json({ error: "Token is missing required identity claims" });
    return;
  }

  req.identity = { username, email };
  next();
}
