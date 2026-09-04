# Monarch

A multi-broker algo-trading platform: connect Indian equity/options/forex broker accounts, build strategies that dispatch orders on TradingView (or generic) webhook signals, and monitor everything from one dashboard. Multi-tenant (workspaces/organizations), 9-role RBAC, Telegram alerting, market news, and heatmaps built in.

This README is for engineers working on the codebase. See also:
- [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) — how to actually use the product (connect a broker, build a strategy, wire up TradingView).
- [`docs/WEBHOOK_API.md`](docs/WEBHOOK_API.md) — the webhook message format and field reference for integrators.
- [`PLAN_GROUP2.md`](PLAN_GROUP2.md) — status of vendor-gated work (billing, new markets, paper trading) and what's still open.

## Stack

- **Next.js 16** (App Router, Turbopack, Server Actions, `after()` for background work)
- **Drizzle ORM** + `postgres` (postgres.js driver) over a Supabase-hosted Postgres instance
- **better-auth** for auth + organizations/RBAC (`db/schema/auth-schema.ts` is generated — see below)
- **Tailwind v4** + shadcn/ui components (`components/ui/`)

## Getting started

```bash
npm install
npm run dev
```

Needs a `.env.local` — see [Environment variables](#environment-variables) below. Without it the app will fail at startup on the DB connection, not silently degrade.

## Repo layout

```
app/
  (user)/dashboard/          protected app shell — trading module, Monarch (strategies/performance/forex/
                              indian-options/indian-equity/research), heatmap, settings
  api/webhook/                the two signal-ingestion endpoints (see docs/WEBHOOK_API.md)
  api/cron/                   Bearer-$CRON_SECRET-protected background jobs (broker sync, limit-order polling)
  login/, onboarding/         pre-auth flow
db/
  schema/                     one file per domain (strategies, positions, broker-accounts, settings, enums, auth-schema)
  client.ts                   drizzle client
lib/
  runners/<provider>/         BrokerRunner adapters — metaapi, zerodha, dhan, motilal (see below)
  strategies/                 execute.ts (dispatch engine), rate-limits.ts, queries.ts, actions.ts
  webhooks/                   shared parsing/validation logic used by both webhook routes
  heatmap/, research/         vendor fetch wrappers (Yahoo/CoinGecko, Finnhub) — graceful-degradation contract
  telegram/                   Bot API wrapper + notification fan-out
  auth/                       better-auth config, session helpers, RBAC role definitions
  crypto.ts                   AES-256-GCM encryption for stored broker credentials
components/
  dashboard/nav-config.ts     the single source of truth for sidebar nav + page titles
  trading-module/, strategies/, heatmap/, research/   feature UI
```

## Architecture notes worth knowing before you touch anything

**BrokerRunner is the abstraction boundary.** Every broker adapter (`lib/runners/{metaapi,zerodha,dhan,motilal}/index.ts`) implements the same `BrokerRunner` interface (`connectAccount`, `getBalance`, `getPositions`, `placeOrder`, `closePosition`). `lib/strategies/execute.ts` and the webhook routes only ever talk to that interface — adding a broker means writing a new adapter, not touching dispatch logic. Credentials are stored AES-256-GCM encrypted (`lib/crypto.ts`, keyed by `BROKER_CREDENTIALS_ENCRYPTION_KEY`) and only decrypted inside the adapter that needs them.

**The webhook dispatch pipeline** (both `/api/webhook/strategy/signal` and `/api/webhook/tradingview`):
`parseSignalMessage` (parse the `SLUG,ACTION,SYMBOL,key=value...` string) → webhook-secret check (only if the strategy has one set) → `requiredFields` (per-action/market validation) → `checkStrategyRateLimit` (cooldown + daily cap) → `buildDispatchableSignal` → insert a `signals` row (status `received`, *before* dispatch) → `dispatchSignal` (`lib/strategies/execute.ts`, which first runs `gateAction` for the Entry/Exit/SL-Target toggles) → update that same `signals` row with the outcome. The insert-before-dispatch order matters: it's what lets an async pending limit order (Motilal options entries) come back later and update the same row instead of orphaning it. Full field/action reference: [`docs/WEBHOOK_API.md`](docs/WEBHOOK_API.md).

**The slug is the routing key, not the URL.** Every strategy in the product shares one webhook URL; `strategies.slug` is globally unique (`strategies_slug_uidx`) because the payload carries no workspace id. That's what lets a TradingView user paste one URL and set a `Strategy_Slug` input — see [`docs/tradingview-webhook-template.pine`](docs/tradingview-webhook-template.pine) and the TradingView tab of the Webhook info dialog. A slug alone is a bearer credential, so a strategy can optionally require a `secret=` field too (`strategies.webhook_secret`, null by default); the secret is stripped from `parsed_fields` and blanked in the `raw_payload` kept on every signal row.

**Per-action kill switches gate signals only.** `allow_entry` / `allow_exit` / `allow_modify` (`lib/strategies/action-gates.ts`) cancel a signal with a reason instead of dispatching it; compound close+open actions are gated per leg. Stop-loss/target hits, trailing rules and manual closes never pass through that gate, so switching Exit off doesn't strand a position without its stop.

**Two webhook endpoints, different contracts.** `/api/webhook/strategy/signal` is synchronous — it validates and replies with a real status/error. `/api/webhook/tradingview` acks `202` immediately and does everything in the background via `after()`, because TradingView's alert delivery doesn't meaningfully retry on 4xx — errors there are logged server-side only, never returned to the caller.

**Vendor fetch wrappers never throw.** `lib/heatmap/*.ts` and `lib/research/finnhub.ts` all return `{status: "ok", ...} | {status: "unavailable", reason}` — a vendor outage is a normal, renderable UI state, not an exception to catch somewhere upstream. Follow this contract for any new vendor integration.

**RBAC is two layers.** Workspace-level roles (Owner/Admin/Strategist/Trader/Analyst/Researcher/Integrations Manager/Integrations Viewer/Viewer — `lib/auth/permissions.ts`) gate broad capabilities (trading, broker management, billing, strategy CRUD). A separate `strategy_access` table (`db/schema/strategies.ts`) grants per-strategy view/execute/manage ACLs independent of workspace role, for "this one trader can run this one strategy" cases.

**Broker account status includes `whitelist_pending`.** SEBI requires Indian broker order placement to originate from a static, whitelisted IP. Auth succeeding doesn't mean an account can trade — Zerodha/Dhan/Motilal accounts sit in `whitelist_pending` until a human confirms the IP is whitelisted on the broker's own dashboard; nothing in those APIs reports that back to us automatically.

**Billing isn't real yet.** `app/(user)/dashboard/settings/billing-fallback-panel.tsx` is a static informational placeholder (every workspace has full access, no payment collection, no fake usage numbers). See `PLAN_GROUP2.md` section F before building anything billing-shaped.

## Environment variables

| Variable | Used for |
|---|---|
| `DATABASE_URL` | Postgres connection (Supabase) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase client |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Auth. `BETTER_AUTH_URL` **must match the dev server's actual origin/port** or you'll get "Invalid origin" on every auth call. |
| `BROKER_CREDENTIALS_ENCRYPTION_KEY` | AES-256-GCM key for encrypting stored broker credentials |
| `METAAPI_TOKEN` | MetaAPI/MT5 (forex) adapter |
| `CRON_SECRET` | Bearer auth for `app/api/cron/*` routes |
| `TELEGRAM_BOT_TOKEN` | Telegram notifications (`lib/telegram/`) |
| `FINNHUB_API_KEY` | Research/News page (`lib/research/finnhub.ts`) |

Zerodha/Dhan/Motilal credentials are per-workspace, entered via Settings → Integrations, not env vars.

## Database

**`drizzle-kit push` is broken in this environment** (`TypeError: Cannot read properties of undefined (reading 'replace')` — a tool bug, not caused by any schema here). Schema changes are applied via raw SQL (`ALTER TABLE`/`CREATE TYPE`/etc.) run through one-off Node scripts against `DATABASE_URL`, then reflected by hand in `db/schema/*.ts`. `db/schema/auth-schema.ts` is the exception — it's generated by `npm run auth:generate` from the better-auth config and shouldn't be hand-edited.

## Verification

No automated UI test suite exists. Before calling any UI change done:
- `npx tsc --noEmit` and `npx eslint .` — zero errors, non-negotiable.
- Walk the actual page in a browser, light and dark theme.
- For anything touching a webhook or broker adapter, a real curl call against a locally running server, using an isolated test strategy/account (fake or disposable credentials) — never trust the unit-level logic alone for money-moving code paths.
