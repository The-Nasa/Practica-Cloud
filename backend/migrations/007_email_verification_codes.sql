CREATE TABLE IF NOT EXISTS identity.email_verification_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    attempts int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS email_verification_codes_email_idx ON identity.email_verification_codes(email);
