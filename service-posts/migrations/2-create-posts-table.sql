-- +migrate Up
CREATE TABLE
  posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    created timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted timestamptz,
    user_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL
  );

CREATE TRIGGER set_timestamp BEFORE
UPDATE
  ON posts FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp ();
