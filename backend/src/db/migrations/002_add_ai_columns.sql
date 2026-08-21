ALTER TABLE tickets
    ADD COLUMN ai_suggested_category ticket_category,
    ADD COLUMN ai_mode_enabled BOOLEAN NOT NULL DEFAULT TRUE;
