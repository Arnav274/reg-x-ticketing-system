import { useEffect, useState } from "react";
import { API_BASE_URL } from "../api/config";

export interface AuthContext {
  username: string;
  email: string;
  token: string;
}

// Stands in for the host application's auth state. The identity is mirrored by
// hand from the fixed identity the backend's dev endpoint signs into the token,
// the same way PRODUCT_NAMES mirrors the backend's productPages.ts. Only the
// token is fetched, because it is the only part the backend actually verifies:
// a placeholder string is rejected by auth.middleware with 401, which is why
// this hook can no longer answer synchronously.
const DEV_IDENTITY = {
  username: "johndoe",
  email: "johndoe@example.com",
};

// Shared across every hook instance rather than held per component. Both
// consumers mount together when the modal opens, so a per-instance request
// would ask for two tokens every open and leave the two components holding
// different ones. Caching the promise means one request per page load, reused
// across close/reopen.
let tokenRequest: Promise<string> | null = null;

// How long the token request may hang before it is abandoned. Without it a
// backend that accepts the connection and never answers leaves every consumer
// on null forever, which the admin table cannot tell apart from "still loading".
// An abort rejects the fetch, so a hang arrives at the same catch below that a
// refused connection already arrives at, and both reach the same failure state.
const AUTH_FETCH_TIMEOUT_MS = 12_000;

function requestDevToken(): Promise<string> {
  if (tokenRequest === null) {
    tokenRequest = fetch(`${API_BASE_URL}/api/v1/dev/token`, {
      method: "POST",
      signal: AbortSignal.timeout(AUTH_FETCH_TIMEOUT_MS),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Token request failed with status ${response.status}`);
        }
        const body = (await response.json()) as { token: string };
        return body.token;
      })
      .catch((error) => {
        // Drop the cached promise so a later mount can try again. Without this
        // a single failure (backend not up yet, DEV_AUTH_ENABLED off) would be
        // remembered for the lifetime of the page.
        tokenRequest = null;
        throw error;
      });
  }

  return tokenRequest;
}

export interface AuthState {
  auth: AuthContext | null;
  // True once the token request has definitively failed, whether it was refused
  // outright or abandoned at the timeout. Purely additive: it exists so a
  // consumer can tell a null that is still pending from a null that never will
  // be, and it carries no reason or message beyond that.
  failed: boolean;
}

export function useAuthContextState(): AuthState {
  const [auth, setAuth] = useState<AuthContext | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    requestDevToken()
      .then((token) => {
        if (!cancelled) {
          setAuth({ ...DEV_IDENTITY, token });
        }
      })
      .catch(() => {
        // Auth stays null, so consumers that only read it degrade exactly as
        // they did before (submit disabled, no classify call) rather than
        // sending a request the backend would reject anyway.
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { auth, failed };
}

// The original contract, unchanged, and still what the widget's components use.
// They have no failure surface of their own by design, so widening what
// they receive would mean changing them to ignore it.
export function useAuthContext(): AuthContext | null {
  return useAuthContextState().auth;
}
