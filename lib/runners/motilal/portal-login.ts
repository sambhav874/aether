/**
 * Motilal's portal login hands the auth token back on a plain redirect, with
 * no state parameter of its own — the API key the login was started with is
 * parked in this short-lived httpOnly cookie so the callback can finish the
 * connection. Shared by the server action that starts the flow and the route
 * that receives it.
 */
export const MOTILAL_API_KEY_COOKIE = "mo_connect_apikey";
export const MOTILAL_API_KEY_COOKIE_MAX_AGE = 600;
