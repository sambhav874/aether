-- Webhook secrets become mandatory.
--
-- A strategy's slug is derived from its name and is unique across the whole
-- product, so a null secret ("slug-only auth") meant a guessable string was
-- sufficient to place live orders on someone else's broker account.
--
-- BREAKING FOR EXISTING ALERTS: every strategy that previously had no secret
-- gets one here, and its TradingView alerts will be rejected until the owner
-- copies the new value into the alert body (Strategy row -> Webhook -> Reveal).
-- That is the intended outcome — those alerts were unauthenticated.
--
-- gen_random_uuid() is builtin from Postgres 13 and CSPRNG-backed, so this
-- needs no extension. Two uuids give 64 hex chars; the app's own generator
-- emits 48, so match it.
UPDATE "strategies"
SET "webhook_secret" = substr(
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  1, 48
)
WHERE "webhook_secret" IS NULL;--> statement-breakpoint

ALTER TABLE "strategies" ALTER COLUMN "webhook_secret" SET NOT NULL;--> statement-breakpoint

-- New strategies start in paper mode. Existing rows are deliberately left
-- alone: silently flipping a live strategy to paper would stop real orders
-- the owner is expecting, which is its own kind of incident.
ALTER TABLE "strategies" ALTER COLUMN "paper_trading" SET DEFAULT true;
