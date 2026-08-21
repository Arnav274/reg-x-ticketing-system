import assert from "node:assert/strict";
import { before, describe, it, type TestContext } from "node:test";

// Populated in `before`, because importing the service at module scope would
// execute config/aiProvider.ts before the environment below exists, and that
// module calls process.exit(1) on a missing key. That kills the test runner
// outright with no assertion output, so the import has to be deferred.
let classifyIssue: (issueDescription: string) => Promise<string | null>;

before(async () => {
  // Set before the import, never after. The base URL is a deliberately
  // unroutable host: if a test ever fails to stub fetch, it fails there rather
  // than quietly reaching a real provider and passing for the wrong reason.
  process.env.AI_PROVIDER_API_KEY = "test-key-not-a-real-credential";
  process.env.AI_PROVIDER_BASE_URL = "https://ai-provider.invalid/v1";
  process.env.AI_PROVIDER_MODEL = "test-model";

  // config/env.ts is a second exit-at-import module, reached transitively: the
  // service imports ALLOWED_CATEGORIES from db/models/ticket.model, which
  // imports the pg pool from db/index, which imports env. Nothing here opens a
  // connection, since pg only dials on the first query and no test issues one,
  // but the variables still have to exist for the import to survive.
  process.env.PORT = "3000";
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
  process.env.JWT_SECRET = "test-secret-not-a-real-credential";

  ({ classifyIssue } = await import("../src/services/aiClassifier.service"));
});

// Replaces global fetch for one test and restores it when that test ends, so a
// stub can never leak into the next case.
function stubFetch(t: TestContext, impl: typeof globalThis.fetch): void {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  t.after(() => {
    globalThis.fetch = original;
  });
}

// The shape the provider actually returns: the classification is a JSON string
// inside the message content, not a nested object.
function providerResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("classifyIssue", () => {
  it("returns the category when the provider answers with an allowed label", async (t) => {
    // Every allowed label, so a check that happens to admit only the first one
    // is not mistaken for a working check.
    for (const category of ["High", "Medium", "Low", "Suggestion", "Request"]) {
      const original = globalThis.fetch;
      globalThis.fetch = async () => providerResponse(JSON.stringify({ category }));
      try {
        assert.equal(await classifyIssue("The export button returns a 500."), category);
      } finally {
        globalThis.fetch = original;
      }
    }
    t.diagnostic("all five allowed labels round-tripped");
  });

  it("returns null when the provider names a category outside the five", async (t) => {
    // The case that matters most: this is the guarantee that a model inventing
    // a label never reaches the frontend or the database.
    stubFetch(t, async () => providerResponse(JSON.stringify({ category: "Critical" })));

    assert.equal(await classifyIssue("Everything is on fire."), null);
  });

  it("returns null when the message content is not JSON", async (t) => {
    stubFetch(t, async () => providerResponse("High, probably"));

    assert.equal(await classifyIssue("The export button returns a 500."), null);
  });

  it("returns null when the response has no choices", async (t) => {
    stubFetch(
      t,
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );

    assert.equal(await classifyIssue("The export button returns a 500."), null);
  });

  it("returns null on a non-ok HTTP status", async (t) => {
    stubFetch(t, async () => providerResponse(JSON.stringify({ category: "High" }), 500));

    assert.equal(await classifyIssue("The export button returns a 500."), null);
  });

  it("returns null when the request is aborted", async (t) => {
    // What the service's own 800ms timeout produces once it fires.
    stubFetch(t, async () => {
      throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    });

    assert.equal(await classifyIssue("The export button returns a 500."), null);
  });

  it("returns null when fetch rejects outright", async (t) => {
    // The provider being unreachable, which is a different arrival than an
    // abort even though both land in the same catch.
    stubFetch(t, async () => {
      throw new TypeError("fetch failed");
    });

    assert.equal(await classifyIssue("The export button returns a 500."), null);
  });
});
