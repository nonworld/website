-- 002: the dimensions you actually slice by.
--
-- LOCATION IS COARSE ON PURPOSE. Country and region only — no city, no IP, no
-- geohash. Country tells you the market; city plus a distinctive question
-- starts to describe a person, and the privacy policy commits to not doing
-- that. The line is drawn here rather than left to whoever writes the next
-- query.
ALTER TABLE somm_log ADD COLUMN store   TEXT;  -- which storefront host the ask came from
ALTER TABLE somm_log ADD COLUMN country TEXT;  -- ISO-2, from Cloudflare's edge
ALTER TABLE somm_log ADD COLUMN region  TEXT;  -- state/county, from Cloudflare's edge
ALTER TABLE somm_log ADD COLUMN page    TEXT;  -- exact path, where context is only the surface type
ALTER TABLE somm_log ADD COLUMN device  TEXT;  -- mobile | desktop, coarse
ALTER TABLE somm_log ADD COLUMN model   TEXT;  -- which model wrote the prose

CREATE INDEX IF NOT EXISTS somm_log_country ON somm_log (country);
CREATE INDEX IF NOT EXISTS somm_log_store   ON somm_log (store);
