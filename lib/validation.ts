import { z } from "zod";

/**
 * Shared runtime shapes for server actions.
 *
 * Server actions are public HTTP endpoints wearing function signatures — the
 * TypeScript parameter types erase at build, so anything not checked here is
 * simply not checked.
 */

export const idSchema = z.string().trim().min(1).max(128);
export const labelSchema = z.string().trim().min(1).max(120);
export const noteBodySchema = z.string().trim().min(1).max(5_000);
export const emailSchema = z.string().trim().email().max(254);

/**
 * Hostnames that must never be fetched on behalf of a user.
 *
 * 169.254.169.254 is the one that matters most: on every major cloud it is
 * the instance metadata endpoint, and on a misconfigured instance it hands
 * out credentials to anyone who can make the server request it.
 */
const BLOCKED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "metadata.google.internal"]);

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return true;

  // IPv4 private and link-local ranges.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // cloud metadata
    if (a >= 224) return true; // multicast / reserved
  }

  // IPv6 loopback, unique-local and link-local.
  if (host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;

  return false;
}

/**
 * A URL the server is allowed to fetch on a user's behalf.
 *
 * RSS feed URLs are submitted by users and then fetched server-side, which
 * without this is a server-side request forgery hole: the request originates
 * inside the deployment's network, so it reaches anything the app can reach.
 *
 * This blocks the addresses that matter by hostname. It does not defeat DNS
 * rebinding — a public name that resolves to a private address still passes
 * — which needs resolution-time checking at the fetch layer. Worth knowing
 * rather than assuming this is complete.
 */
export const fetchableUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .refine((value) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      return !isPrivateHost(url.hostname);
    } catch {
      return false;
    }
  }, "Must be a public http(s) URL");

export { isPrivateHost };
