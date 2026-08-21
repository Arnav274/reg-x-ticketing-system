-- Ticket lifecycle status. The original schema deliberately left this out
-- ("I'd deliberately not add a status (open/closed) field yet ... that's a
-- clean, additive migration later"), so this is that later addition on the
-- terms the design already anticipated, not a correction to it.
--
-- An enum rather than VARCHAR + CHECK because ticket_category on this same table
-- is already an enum, and one table using two conventions for the same kind of
-- field is worse than either convention applied consistently.
CREATE TYPE ticket_status AS ENUM ('open', 'in progress', 'resolved');

-- Existing rows take the default, which is correct on its own terms: every
-- ticket filed before this migration is open.
ALTER TABLE tickets
    ADD COLUMN status ticket_status NOT NULL DEFAULT 'open';
