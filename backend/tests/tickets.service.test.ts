import assert from "node:assert/strict";
import { before, describe, it, mock, type TestContext } from "node:test";
import type { NewTicket, Ticket } from "../src/db/models/ticket.model";
import type { ValidatedTicketBody } from "../src/middleware/validate.middleware";

// Populated in `before`, for the same reason as the classifier suite: a static
// import hoists above the environment assignment, and config/env.ts calls
// process.exit(1) at import without PORT, DATABASE_URL and JWT_SECRET. It is
// reached from here through db/index.ts.
let createTicket: (
  identity: { username: string; email: string },
  payload: ValidatedTicketBody
) => Promise<Ticket>;

// The model's exports, substituted in `before` so tests can swap `insertTicket`.
let modelStub: Record<string, unknown>;
let realInsertTicket: unknown;

before(async () => {
  process.env.PORT = "3000";
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:1/test";
  process.env.JWT_SECRET = "test-secret-not-a-real-credential";

  // The seam, and why it is this one rather than the obvious one. Patching the
  // model's export directly does not work here: tsx compiles to CommonJS and
  // esbuild defines each export as a getter with no setter and
  // `configurable: false`, so `mock.method(ticketModel, "insertTicket")` reports
  // the method as undefined and `Object.defineProperty` throws "Cannot redefine
  // property". Replacing the module's entry in `require.cache` with an ordinary
  // mutable object achieves the same interception without touching production
  // code, which is the constraint that matters. It has to happen before the
  // service is imported, because the service captures the module object once at
  // load; it then reads `insertTicket` off that object at every call, which is
  // what lets each test install its own stub below.
  const modelPath = require.resolve("../src/db/models/ticket.model");
  const realModel = require(modelPath) as Record<string, unknown>;
  realInsertTicket = realModel.insertTicket;
  modelStub = { ...realModel };
  require.cache[modelPath]!.exports = modelStub;

  ({ createTicket } = await import("../src/services/tickets.service"));
});

// A recognisable row, so "the service returned what the model returned" can be
// asserted by identity rather than by shape.
const MODEL_RESULT = { ticket_id: "11111111-2222-3333-4444-555555555555" } as unknown as Ticket;

// Installs a stub for one test and puts the real function back afterwards, so a
// failure to intercept shows up as a connection attempt to a fake database
// rather than as a quietly passing test.
function stubInsertTicket(t: TestContext) {
  const fn = mock.fn(async (_ticket: NewTicket): Promise<Ticket> => MODEL_RESULT);
  modelStub.insertTicket = fn;
  t.after(() => {
    modelStub.insertTicket = realInsertTicket;
  });
  return fn;
}

const VALID_PAYLOAD: ValidatedTicketBody = {
  product_name: "Analytics Hub",
  category: "High",
  issue_description: "The export button returns a 500.",
};

const IDENTITY = { username: "johndoe", email: "johndoe@example.com" };

describe("createTicket", () => {
  it("takes username and email from the identity argument", async (t) => {
    const insert = stubInsertTicket(t);

    await createTicket(IDENTITY, VALID_PAYLOAD);

    // Call count first: a patch that failed to intercept would leave this at 0
    // while every value assertion below still passed against a stale stub.
    assert.equal(insert.mock.callCount(), 1);
    const written = insert.mock.calls[0].arguments[0];
    assert.equal(written.username, "johndoe");
    assert.equal(written.email, "johndoe@example.com");
  });

  it("ignores username and email carried on the payload", async (t) => {
    const insert = stubInsertTicket(t);
    // Cast past the type deliberately: this is the compromised or buggy caller
    // the architecture's security note is about, and the type is exactly what
    // stops it in normal code. The point of the test is that the service does
    // not read these fields even when they are present.
    const hostile = {
      ...VALID_PAYLOAD,
      username: "attacker",
      email: "attacker@evil.example",
    } as unknown as ValidatedTicketBody;

    await createTicket(IDENTITY, hostile);

    assert.equal(insert.mock.callCount(), 1);
    const written = insert.mock.calls[0].arguments[0];
    assert.equal(written.username, "johndoe");
    assert.equal(written.email, "johndoe@example.com");
  });

  it("defaults an omitted ai_suggested_category to null", async (t) => {
    const insert = stubInsertTicket(t);

    await createTicket(IDENTITY, VALID_PAYLOAD);

    assert.equal(insert.mock.callCount(), 1);
    assert.equal(insert.mock.calls[0].arguments[0].ai_suggested_category, null);
  });

  it("defaults an omitted ai_mode_enabled to false", async (t) => {
    const insert = stubInsertTicket(t);

    await createTicket(IDENTITY, VALID_PAYLOAD);

    assert.equal(insert.mock.callCount(), 1);
    assert.equal(insert.mock.calls[0].arguments[0].ai_mode_enabled, false);
  });

  it("passes both AI fields through verbatim when supplied", async (t) => {
    const insert = stubInsertTicket(t);

    await createTicket(IDENTITY, {
      ...VALID_PAYLOAD,
      ai_suggested_category: "Medium",
      ai_mode_enabled: true,
    });

    assert.equal(insert.mock.callCount(), 1);
    const written = insert.mock.calls[0].arguments[0];
    assert.equal(written.ai_suggested_category, "Medium");
    assert.equal(written.ai_mode_enabled, true);
  });

  it("returns exactly what the model returned", async (t) => {
    const insert = stubInsertTicket(t);

    const result = await createTicket(IDENTITY, VALID_PAYLOAD);

    assert.equal(insert.mock.callCount(), 1);
    // Reference equality, so a service that rebuilt an equivalent object rather
    // than passing the row through would fail here.
    assert.equal(result, MODEL_RESULT);
  });
});
