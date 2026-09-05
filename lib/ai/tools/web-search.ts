import "server-only";
import { z } from "zod";
import { ok, unavailable, type ToolResult } from "./shared";
import { fetchWithTimeout, CONTENT_TIMEOUT_MS } from "@/lib/http";

/**
 * Keiro Labs web search/research — see PLAN_AI_COPILOT.md §2.1 "Web search
 * & research". PARTIALLY VERIFIED, not fully: endpoint names (`/search`,
 * `/research`, `/answer`, all POST) come from Keiro's own official MCP
 * server's README (github.com/Neptaverse/Keiro-MCP-TS), not guessed. The
 * base API host does NOT — that repo's stated default (`keiro.dev`)
 * actually resolves to an unrelated French web-design company, not Keiro
 * Labs, so it is deliberately NOT hardcoded here (their real docs site,
 * platform.keirolabs.cloud, is a JS-rendered SPA that couldn't be
 * confirmed via fetch). Auth is assumed to be a standard
 * `Authorization: Bearer <key>` header and the body a `{query}` field —
 * both are near-universal conventions across this class of API (Tavily,
 * Exa, Serper), not confirmed against Keiro specifically.
 *
 * KEIRO_API_BASE_URL is therefore a REQUIRED env var with no default —
 * shipping a guessed default here would silently call the wrong host
 * instead of failing loudly. Get the confirmed base URL from Keiro's own
 * dashboard/docs once logged in, set it, and smoke-test both endpoints
 * before trusting this in the tool loop. Every failure mode below
 * (missing config, non-2xx, unexpected shape, network error) degrades to
 * `unavailable` rather than throwing — same contract as every other tool
 * in this codebase — so a wrong assumption here fails safely, not loudly
 * mid-conversation.
 */

function getConfig(): { apiKey: string; baseUrl: string } | null {
  const apiKey = process.env.KEIRO_API_KEY;
  const baseUrl = process.env.KEIRO_API_BASE_URL;
  if (!apiKey || !baseUrl) return null;
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, "") };
}

function resolveEndpointUrl(baseUrl: string, path: string): string {
  const clean = baseUrl.replace(/\/$/, "");
  if (clean.endsWith(path) || (path === "/search" && clean.endsWith("/search/fast"))) {
    return clean;
  }
  return `${clean}${path}`;
}

async function post<T>(path: string, body: unknown): Promise<ToolResult<T>> {
  const config = getConfig();
  if (!config) {
    return unavailable("Keiro isn't configured — set KEIRO_API_KEY and KEIRO_API_BASE_URL (see this file's docstring; the base URL isn't safe to default).");
  }

  try {
    const url = resolveEndpointUrl(config.baseUrl, path);
    const response = await fetchWithTimeout(url, {
      timeoutMs: CONTENT_TIMEOUT_MS,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) {
      return unavailable(`Keiro returned HTTP ${response.status} for ${path}`);
    }
    const data = (await response.json()) as T;
    return ok(data);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "network error");
  }
}

// --- web_search ------------------------------------------------------

export const webSearchInputSchema = z.object({
  query: z.string().min(1),
  recency: z.enum(["day", "week", "month", "year", "any"]).default("any"),
  allowedDomains: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(20).default(8),
});
export type WebSearchInput = z.infer<typeof webSearchInputSchema>;

export type WebSearchHit = { title: string; url: string; snippet: string; publishedAt: string | null; source: string };

type RawSearchResponse = { results?: { title?: string; url?: string; snippet?: string; content?: string; published_at?: string; source?: string }[] };

/**
 * Fast single-hop search — headline results only, model synthesizes.
 * Trust tier matches search_news (news.ts): results are untrusted
 * retrieved content, wrapped as data not instructions, snippet-length only
 * (never full page bodies) — see PLAN_AI_COPILOT.md §7.
 */
export async function webSearch(input: WebSearchInput): Promise<ToolResult<{ results: WebSearchHit[] }>> {
  const result = await post<RawSearchResponse>("/search", {
    query: input.query,
    recency: input.recency === "any" ? undefined : input.recency,
    domains: input.allowedDomains,
    limit: input.limit,
  });
  if (result.status === "unavailable") return result;

  const results: WebSearchHit[] = (result.data.results ?? []).slice(0, input.limit).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: (r.snippet ?? r.content ?? "").slice(0, 500),
    publishedAt: r.published_at ?? null,
    source: r.source ?? (r.url ? new URL(r.url).hostname : "unknown"),
  }));

  return ok({ results });
}

// --- web_research ------------------------------------------------------

export const webResearchInputSchema = z.object({
  query: z.string().min(1),
  maxSources: z.number().int().min(1).max(15).default(6),
});
export type WebResearchInput = z.infer<typeof webResearchInputSchema>;

export type WebResearchCitation = { title: string; url: string; quote: string };

type RawResearchResponse = { answer?: string; citations?: { title?: string; url?: string; quote?: string; snippet?: string }[] };

/**
 * Keiro's own multi-step research + cited-answer pipeline — for genuinely
 * open questions ("what happened with X this week"), not single-fact
 * lookups (use web_search or an internal tool for those). The synthesized
 * `answer` is treated as one more citable data point by the caller, never
 * as an instruction — same untrusted-content handling as web_search.
 */
export async function webResearch(input: WebResearchInput): Promise<ToolResult<{ answer: string; citations: WebResearchCitation[] }>> {
  const result = await post<RawResearchResponse>("/research", { query: input.query, max_sources: input.maxSources });
  if (result.status === "unavailable") return result;

  if (!result.data.answer) {
    return unavailable("Keiro returned no answer for this query");
  }

  const citations: WebResearchCitation[] = (result.data.citations ?? []).map((c) => ({
    title: c.title ?? "",
    url: c.url ?? "",
    quote: (c.quote ?? c.snippet ?? "").slice(0, 300),
  }));

  return ok({ answer: result.data.answer, citations });
}
