CREATE TYPE ticket_category AS ENUM ('High', 'Medium', 'Low', 'Suggestion', 'Request');

CREATE TABLE tickets (
    ticket_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    datetime TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    product_name VARCHAR(100) NOT NULL,
    category ticket_category NOT NULL,
    issue_description TEXT NOT NULL
);

CREATE INDEX idx_tickets_username ON tickets (username);
CREATE INDEX idx_tickets_email ON tickets (email);
CREATE INDEX idx_tickets_product_name ON tickets (product_name);
CREATE INDEX idx_tickets_product_category_datetime ON tickets (product_name, category, datetime);
