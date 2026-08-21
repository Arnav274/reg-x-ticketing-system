import { Router } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

// The single fixed identity this endpoint will ever issue a token for. It
// deliberately takes no input: an endpoint that signs a token for a
// caller-supplied username/email is an identity-forgery endpoint, and the whole
// point of deriving identity from a verified JWT is lost if anyone can ask for
// any identity. Keeping it fixed means the worst case, if this is ever switched
// on by mistake, is one well-known demo user rather than arbitrary
// impersonation.
//
// The values match the mock previously hardcoded in the widget's
// useAuthContext, so tickets stay attributable to the same user whether they
// were created before this endpoint existed or after.
const DEV_IDENTITY = {
  username: "johndoe",
  email: "johndoe@example.com",
};

// Short-lived on purpose. The widget fetches a token on load, so a long life
// buys nothing and a leaked one would otherwise be a standing credential.
const DEV_TOKEN_TTL = "1h";

const router = Router();

// No auth middleware here, for the obvious reason that this is what produces
// the token auth middleware expects. Access control for this route is the
// DEV_AUTH_ENABLED check in app.ts, which decides whether it is mounted at all.
router.post("/token", (_req, res) => {
  // HS256 explicitly, matching the algorithm auth.middleware pins when
  // verifying. Leaving it implicit would work today but would break silently if
  // either side's default ever changed.
  const token = jwt.sign(DEV_IDENTITY, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: DEV_TOKEN_TTL,
  });

  res.status(200).json({ token });
});

export default router;
