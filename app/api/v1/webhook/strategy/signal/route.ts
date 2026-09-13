/**
 * Versioned alias for the public webhook contract.
 *
 * This endpoint is configured by third parties inside TradingView alerts, so
 * the message grammar is a published interface — without a version prefix any
 * change to it silently breaks every alert already in the wild, with no way
 * to run old and new side by side.
 *
 * The unversioned path stays live indefinitely: alerts configured against it
 * exist and cannot be migrated from this side. New integrations should use
 * /api/v1.
 */
export { POST, maxDuration } from "@/app/api/webhook/strategy/signal/route";
