-- NON Somm capture.
--
-- One row per answered question. Deliberately free of anything that could
-- identify a person: see the note in wrangler.toml.
CREATE TABLE IF NOT EXISTS somm_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Unix ms. Stored as an integer so range queries do not depend on string
  -- formatting, and rendered on export.
  at          INTEGER NOT NULL,
  -- What was asked, verbatim. The reason this table exists.
  question    TEXT    NOT NULL,
  -- What was said back. Without it a bad answer is unreviewable — you would
  -- see the question that failed and have no idea how.
  answer      TEXT,
  -- home | product | pairing | stockists. Which surface it came from.
  context     TEXT,
  -- The bottle being viewed, on a product page only.
  product     TEXT,
  -- Which branch of the router ran: pairing, facts, brand, decline.
  route       TEXT,
  -- What the extractor understood, as JSON. Null when nothing was extracted,
  -- which is itself the signal worth looking for.
  intent      TEXT,
  -- Which bottles were recommended, comma separated.
  picks       TEXT,
  locale      TEXT,
  -- Milliseconds from request to answer, for spotting the slow paths.
  ms          INTEGER,
  -- Set when the answer came from the canned fallback rather than the model.
  fallback    INTEGER DEFAULT 0,
  -- Set when the request failed outright. A failure is a question we could not
  -- answer, which is the most important kind to keep.
  error       TEXT
);

-- Retention is 24 months per the published policy, and it is ENFORCED — the
-- Worker's hourly scheduled handler purges anything older, using
-- RETENTION_MONTHS from wrangler.toml so the policy's number and the code's
-- number are the same number.
--
-- This used to be a DELETE written here as a comment, for a human to run when
-- they remembered. That is not a retention policy, it is an intention, and it
-- is the sentence a regulator reads back to you.
CREATE INDEX IF NOT EXISTS somm_log_at      ON somm_log (at);
CREATE INDEX IF NOT EXISTS somm_log_route   ON somm_log (route);
CREATE INDEX IF NOT EXISTS somm_log_context ON somm_log (context);
