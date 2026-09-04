# Monarch Rebuild — Plan v4 (Group 3: parity + monochrome redesign)

Scope: everything called out from the reference screenshots — monochrome theme, strategy
depth (expandable rows, 8 action modals, sharing, triggers/day, per-strategy risk/exec/
notification config), Performance analytics depth, Forex module depth, a classier option
chain, overview layout fix, and replacing the TradingView calendar/headlines widgets.

Backend and frontend are split per phase. **Every frontend item is built under the
`ui-ux-designer` skill** — design tokens first, then structure, motion, responsive, a11y,
browser QA. Backend items are plain server work and can land ahead of their UI.

---

## 0. Webhook guide — line-by-line parity diff

Source: the Webhook Strategy Guide screenshots (supplied 2026-08-10). The Notion page
itself is private and unreadable by tooling; the screenshots are the record of truth here.

### Already correct — verified in code, no work needed

| Spec item | Where |
|---|---|
| All 11 actions, case-insensitive | `lib/webhooks/parse-signal-message.ts:14` |
| `SLUG,ACTION,SYMBOL[,k=v]` grammar; symbol positional-but-optional via the `=` heuristic; keys lowercased | `parse-signal-message.ts:50-77` |
| Content types: JSON / form-urlencoded / plain text | `lib/webhooks/http.ts:5-34` |
| `percent` in (0,100]; `quantity` > 0; **quantity wins over percent**; oversized quantity capped at `openQuantity` → full close | `execute.ts:382, 412-414` |
| Tag scoping on close/modify/partial | `findMatchingOpenPositions` |
| `MODIFY` requires stopLoss and/or target; `side` defaults LONG; `type` defaults PRICE | `http.ts:71`, `build-signal.ts:23`, `execute.ts:499` |
| `risk=` default 1%, ignored on `BY_STRATEGY` | `execute.ts:162, 251` |
| `price=` conservative ₹0.05 rounding, ~60s fill-poll then cancel | `execute.ts`, `app/api/cron/poll-limit-orders` |
| `/tradingview` → `202 Accepted`, async, errors never returned | `app/api/webhook/tradingview/route.ts` |
| Generic `404 Invalid webhook request` for unknown *and* paused slug | `app/api/webhook/strategy/signal/route.ts` |
| `comment` / `basketId` / `basketName` on the open phase only | `execute.ts` `linkToBasket` |
| Webhook Info dialog contents (URL, slug+copy, payload docs, examples, cURL) | matches the Phase 2E modal spec below |

### Gaps — real work, folded into the phases below

1. **`paper=B`** — per-signal override of `tradingConfig.paperTrading`. Not implemented.
   The doc also settles the open question from PLAN_GROUP2 A.6: **in paper mode the entry
   fills at `price=` when no live tick is available.** That's a real, specified rule, so
   the feature is no longer blocked on a judgment call. → Phase 2C.
2. **`price=` on the open leg of compound actions — FIXED.** The doc allows it ("`BUY`,
   `SELL`, and the open leg of compound actions on `INDIAN_OPTIONS` strategies"), and
   `execute.ts`'s `dispatchCompound` already forwarded `signal.price` into its
   `dispatchEntry()` call correctly — the bug was purely at intake: `http.ts`'s
   `requiredFields` rejected anything that wasn't literally `BUY`/`SELL` before the signal
   ever reached the dispatcher. Fixed in `lib/webhooks/http.ts` (`PRICE_ELIGIBLE_ACTIONS`).
3. ~~Per-provider `price=` rejection~~ — **not a gap, already correct.** Re-read
   `execute.ts:168-180`: every non-Motilal provider already gets a clean per-account
   rejection with a real reason ("price= entries are only honored on Motilal — this
   adapter can't cancel a resting order yet"), which covers Dhan without needing a
   Dhan-specific message. No change made.
4. **Unfilled limit → doc says "the position is marked REJECTED."** Our model has no
   position row until a fill (by design — never record a position at a guessed price), so
   there's nothing to mark. Functionally equivalent: the `signals` row is updated to
   `status: "rejected"` with a real `resultMessage` (`poll-limit-orders/route.ts:101-145`),
   which the Phase 2E Signals tab already surfaces per-signal. No extra table needed —
   removed from Phase 4A.
5. **Slug collision behavior — FIXED.** Doc: auto-generated duplicates get a numeric
   suffix (`eurusd-ema-1`). `lib/strategies/actions.ts` now suffixes on collision only when
   the slug was auto-derived from the name; a slug the user typed by hand still hard-errors
   so they notice and pick their own.
6. **`409 Slug already in use`** — an HTTP status in the doc's error table. Ours is a
   server action returning `{error}`, never a 409. Only matters if a strategy REST API gets
   exposed; note it, don't build the API.
7. **404 also covers "instrument not found / inactive / not tradable"** and **400 covers
   "invalid LTP for the symbol"**. We have no instrument registry and don't pre-validate an
   LTP — symbols go straight to the broker. This is the doc's biggest architectural
   difference from us. Deferred, flagged: it needs a per-broker instrument master
   (Dhan publishes a scrip CSV; Motilal/Zerodha have their own). Not in this plan's scope.
8. ~~`type=` validation is MODIFY-only~~ — **not a gap.** Re-checked against every curl
   example in the doc: `stopLoss=`/`target=`/`type=` never appear on a `BUY`/`SELL`
   example — entry stop-loss is always driven by `risk=` instead. The "MODIFY Action"
   section is the only place `type=` is documented. Our validation already matches; the
   `docs/WEBHOOK_API.md` table that suggested otherwise was itself imprecise on this point.
   No change made.
9. **`market` enum: 3 of 7.** Missing `CRYPTO`, `US_EQUITY`, `COMMODITIES`, `BONDS`.
   Adding enum values is trivial; dispatching them needs a broker adapter per market.
   Still vendor-gated, still out of scope.
10. **"Disabled" is a distinct state from paused** in the doc's 404 list — which matches
    the disable/mute button in the reference screenshots. Modeled in Phase 2A.
11. **Endpoint path.** Theirs is `https://api.morwl.com/api/v1/webhook/strategy/signal`
    (separate API host; the legacy frontend path forwards for compatibility). Ours is
    `/api/webhook/strategy/signal` on the app itself. Keeping ours — the Webhook Info
    dialog shows the real, working URL for this deployment, not theirs.
12. **`{{ticker}}` exchange prefix — FIXED.** TradingView can send `OANDA:XAUUSD` rather
    than `XAUUSD`; `parseSignalMessage` now strips everything before a `:` in the symbol
    token, needed before a live TradingView alert can match a broker symbol.

### Connecting the live TradingView webhook

You offered to point the existing TradingView alert at us. Before that happens:

- **A live alert can place a real broker order.** Point it at a fixture strategy with
  `paper_trading = true` (Phase 2C) or with zero live-credentialed linked accounts —
  not at a strategy wired to a funded account.
- Needs a publicly reachable URL; `localhost:3000` won't receive TradingView's POST. A
  tunnel is fine for testing.
- `{{ticker}}` arrives as TradingView's own symbol string (`XAUUSD`, sometimes
  `OANDA:XAUUSD`). We have no symbol normalization layer — add exchange-prefix stripping
  to `parseSignalMessage`, or the symbol won't match the broker's.

---

## 1. Design system — monochrome (frontend only)

**Why the cards look gray:** in `app/globals.css` the dark theme sets
`--background: oklch(0.145 0 0)` but `--card: oklch(0.205 0 0)` — a card is a *lighter gray
fill* floating on near-black. The reference does the opposite: card ≈ background, and
separation comes from a hairline border. That single token pair is 80% of the "too gray"
complaint. `--brand: oklch(0.78 0.125 82)` is the gold; it feeds `--primary`,
`--sidebar-primary`, `--sidebar-accent`, `--warning`.

### 1.1 Token rewrite (`app/globals.css`)

| Token | Now (dark) | New (dark) | Note |
|---|---|---|---|
| `--background` | 0.145 | `oklch(0.115 0 0)` | true near-black base |
| `--card` | 0.205 | `oklch(0.145 0 0)` | barely above base |
| `--popover` | 0.205 | `oklch(0.175 0 0)` | one step up = elevation |
| `--muted` | 0.269 | `oklch(0.19 0 0)` | |
| `--border` | white/10% | `oklch(1 0 0 / 8%)` | hairline carries the structure |
| `--brand` | gold 82° | `oklch(0.985 0 0)` | white primary, black foreground |
| `--sidebar-accent` | gold/10% | `oklch(1 0 0 / 6%)` | |
| `--warning` | gold | `oklch(0.985 0 0)` | keep the token, drop the hue |
| `--positive` / `--negative` | green / red | **unchanged** | P&L sign is data, not decoration |

Light mode mirrors it: white base, white cards, `oklch(0.92)` borders, black primary.
Chart ramp stays neutral gray + positive/negative.

### 1.2 Sweep

- Grep every `bg-primary`, `text-brand`, `text-warning`, `bg-warning` and confirm none of
  them were relying on gold to mean something. Active tab pills, the "Forex 0" segmented
  control (screenshot 2), and the sidebar item become white-on-black / black-on-white.
- Add a `.surface` component class (bg-card + hairline border + no fill jump on hover) and
  retire the ad-hoc `card-elevated` shadows on data-dense panels — depth via border, not
  shadow, per the reference.
- One accent per screen, max. Data color is only green/red.

**Deliverable:** every existing page re-read in browser, light + dark, before Phase 2
starts. Nothing else in this plan should be built on the gold tokens.

---

## 2. Strategies

The biggest gap. Today `strategy-list.tsx` is a flat table with 5 dropdown items and no
detail view. Target: expandable rows + 9-item action menu + 8 modals + sharing.

### 2A. Backend — schema

New/changed in `db/schema/strategies.ts` (one Drizzle migration, `npx drizzle-kit generate`):

1. `strategy_accounts.multiplier` `numeric(8,4) default 1` + `enabled boolean default true`
   — the Execution modal's copier list ("×1", "0.5 is half, 2 is double").
2. `strategies.paper_trading boolean default false`.
3. `strategies.signals_hidden boolean default false` — the "Hide signals" menu item.
4. `strategies.config jsonb` — the Parameters modal's arbitrary key/value fields.
5. `strategies.chart_symbol text`, `strategies.chart_interval text` — Chart modal state.
6. **`strategy_risk_settings`** — per-strategy override of the workspace-level
   `trading_settings` row. Same columns (`sizing_method`, `total_capital`,
   `available_capital`, `max_concurrent_positions`, `max_positions_per_symbol`,
   `daily_trade_limit`, `max_risk_pct`, `max_risk_pips`, `stop_loss_type`,
   `default_stop_loss_pct`, `risk_reward_ratio`, `partial_booking_r`) plus
   `allow_multiple_same_side boolean`. Null row ⇒ inherit the workspace row; the modal
   shows inherited values grayed with an "inherited" hint.
7. **`strategy_trailing_rules`** — `(strategy_id, rr_level numeric, trailing_type enum
   ['EMA','ATR','LAST_4_CANDLES','LAST_CANDLE'], sort_order)`. Repeatable.
8. **`strategy_partial_rules`** — `(strategy_id, rr_level numeric, exit_pct numeric)`.
   Repeatable. Validate Σ exit_pct ≤ 100 server-side.
9. **`strategy_notification_prefs`** — `(strategy_id, event enum ['entry','partial','exit'],
   email bool, telegram bool, push bool)` + **`strategy_notification_channels`**
   `(strategy_id, event, telegram_connection_id)` for the per-event channel multiselect.
10. **`strategy_access.permission` enum replaced**: `view|execute|manage` →
    `view|view_execute|edit_execute|co_owner`. "No access" is the *absence* of a row, not a
    value — cleaner than storing a tombstone. Migration maps `view→view`,
    `execute→view_execute`, `manage→co_owner`.
11. `positions.is_paper boolean default false` — so paper fills never pollute real P&L.

### 2B. Backend — permission enforcement

- `lib/strategies/permissions.ts`: `resolveStrategyPermission(userId, strategyId)` →
  max(workspace role grant, `strategy_access` row). Ladder:
  `none < view < view_execute < edit_execute < co_owner`.
- Gate table:

| Capability | Min level |
|---|---|
| See strategy + its positions/signals | `view` |
| Manually trigger / close a position | `view_execute` |
| Edit trade-config, strategy-config, chart | `edit_execute` |
| Share, change permissions, delete | `co_owner` (or workspace Owner/Admin) |

- Every mutating server action in `lib/strategies/actions.ts` calls the gate. So does the
  webhook dispatch path where a human confirm is involved (`confirmSignal`).
- `lib/strategies/queries.ts` filters the list by `view` so a member with no access
  genuinely can't see the strategy or its positions.

### 2C. Backend — engine changes (`lib/strategies/execute.ts`) — DONE (partial-booking rule execution deferred, see below)

Built and curl-verified against a real running server (fixture strategy + two
fake-credentialed broker_accounts that never received a real order — cleaned
up after):

- **Copier fan-out with multiplier/enabled** — `strategy_accounts.multiplier`
  scales each account's quantity independently; `enabled=false` accounts are
  excluded from the linked-accounts query entirely. Verified: a 2x account
  got double the base quantity in the same dispatch; a disabled account got
  no position at all.
- **Per-strategy risk enforcement** — `resolveRiskLimits`/`enforceRiskLimits`
  in execute.ts, strategy-level override first, workspace `trading_settings`
  fallback second. Checks run **before any broker call**: max concurrent
  positions, max positions per symbol, daily trade limit, same-side
  blocking. Verified: setting `maxConcurrentPositions=1` on a strategy that
  already had one open position rejected the next BUY with
  `"max concurrent positions reached (1/1)"` and created zero new rows.
- **Paper trading** — `dispatchPaperEntry`, gated by `strategies.paperTrading`
  or a per-signal `paper=` override. Never calls `getRunner`/`placeOrder`.
  Per the webhook guide's own documented rule, the fill price is the
  signal's `price=`; since this codebase has no general live-quote source
  outside the Dhan option chain module, a paper entry without `price=` is
  rejected rather than fabricated. Verified: a paper BUY created a real
  `positions` row (`is_paper=true`, `external_position_id=null`) and a real
  `position_executions` row, at exactly the signal's price.
- **Partial-booking rule evaluation** — new `lib/strategies/rules.ts` +
  `app/api/cron/evaluate-partial-rules/route.ts`. Runs against open,
  non-paper positions whose strategy has partial rules configured; current R
  is derived from real broker data only (`unrealizedPnl` from
  `runner.getPositions()` implies current price; `positions.sl` is the risk
  distance) — never fabricated. Fires each rule at most once per position
  (new `strategy_rule_fires` table — a rule fires per-position, not once
  ever for the strategy, which the original `strategy_partial_rules.fired_at`
  column from Phase 2A got wrong; that column was dropped and replaced).
  Verified: endpoint runs cleanly against a real (empty) environment,
  `{"checked":0,"fired":0,"errors":[]}`.
- **Trailing-stop rule EXECUTION — not built, on purpose.** The schema
  (`strategy_trailing_rules`) and the Risk & exits UI for configuring it
  both exist (Phase 2A/2E). Execution doesn't, for two real reasons: (1)
  `positions.sl` may already reflect a prior manual MODIFY, not the
  position's original stop distance — there's no stored "initial risk
  distance" field to trail correctly against; (2) the EMA/ATR/candle
  trailing *types* need real OHLC history this codebase doesn't fetch
  anywhere yet (the plan's own note said to source it from
  `lib/heatmap/yahoo.ts`'s Yahoo chart endpoint, which was never wired up
  for this). Shipping an approximation that moves a stop-loss on a live
  position without either of those would be exactly the kind of guess this
  project's own conventions repeatedly reject (see `POINTS`-for-forex,
  Motilal's UserAgent investigation, exitPrice/pnl-on-close). Needs its own
  pass: add the risk-distance column, wire the OHLC fetch, then implement.

<details>
<summary>Original Phase 2C scope note (superseded by the above)</summary>

### 2C. Backend — engine changes (`lib/strategies/execute.ts`)

- **Copier fan-out:** per linked account, `quantity × multiplier`, skip `enabled=false`.
  Round per instrument's lot rules; **reject rather than silently round to 0**.
- **Per-strategy risk:** resolve `strategy_risk_settings` first, fall back to
  `trading_settings`. Enforce `max_concurrent_positions`, `max_positions_per_symbol`,
  `daily_trade_limit`, `allow_multiple_same_side` before dispatch — today none of these
  are enforced anywhere.
- **Paper trading:** when `strategies.paper_trading` (or `paper=true` on the signal),
  create `positions` rows with `is_paper=true` and **no broker call**. Entry price = the
  signal's `price=` if given, else the broker's live quote for the symbol —
  **never a fabricated number; reject the signal if no real quote is available.** Every
  P&L query gets an explicit paper filter (default: excluded).
- **Trailing / partial rules:** evaluated on the existing broker sync cron
  (`app/api/cron/sync-broker-accounts`). For each open position with rules, compute current
  R from live price vs entry/SL; fire the highest un-fired partial rule (broker partial
  close, already supported) and move SL per the trailing type. `EMA`/`ATR`/`LAST_N_CANDLES`
  need OHLC — Phase 2C.2, sourced from the same Yahoo chart endpoint `lib/heatmap/yahoo.ts`
  already uses. Ship `LAST_CANDLE`/`LAST_4_CANDLES` and `ATR` first; each fired rule writes
  an audit row so it's auditable.
- **Max triggers/day** is already in `lib/strategies/rate-limits.ts` — only the UI is missing.

</details>

### 2D. Backend — new server actions

`updateStrategyRisk`, `updateStrategyExitRules`, `updateStrategyExecution` (max/day +
paper + copier accounts), `updateStrategyNotifications`, `updateStrategyParameters`,
`updateStrategyChart`, `setMaxTriggersPerDay` (inline, small), `toggleSignalsHidden`,
`shareStrategy(memberId, level)`, `revokeStrategyAccess`, plus
`getStrategyDetail(id)` returning config + paged signals + paged positions.

### 2F. Backend — webhook spec fixes — DONE

Gaps 2, 5, 12 fixed, tsc/eslint clean:

- `lib/webhooks/http.ts`: `price=` now valid on `BUY`/`SELL` and the four compound
  open-leg actions (`PRICE_ELIGIBLE_ACTIONS`).
- `lib/strategies/actions.ts`: numeric-suffix slug collisions when the slug was
  auto-derived from the name; explicit user-typed slugs still hard-error.
- `lib/webhooks/parse-signal-message.ts`: strips an `EXCHANGE:` prefix from the symbol
  token.

Gaps 3, 4, 8 turned out not to need code changes on closer read — see §0. Gaps 6, 7, 9 are
out of scope and stay documented, not built.

### 2E. Frontend — `ui-ux-designer`

**Row (collapsed).** Avatar chip (2-letter, monochrome), name + description, status pill,
inline "Handle by" select, sparkline + "3 signals · last 24h", last-triggered (relative +
absolute), **triggers/day ring** (∞ when null) opening a popover with a number input,
"Set to unlimited", Save, and "used today: N", a mute/disable icon button, and the ⋮ menu.
Whole row is a button that toggles expansion — today nothing is clickable.

**Row (expanded).** Motion-animated accordion (height + opacity, ~280ms ease-out,
`prefers-reduced-motion` respected). Two columns: left rail = webhook URL (copy + open) +
slug + CONFIGURATION definition list (market, signal type, handle by, max/day, cooldown,
accounts, created); right = `Signals | Positions` tabs, "Showing 10 of 200", each signal a
card with side pill, symbol, market, status badge, `Px`/`SL`/`Action` mono line, result
message, relative + absolute time. Load-more, not pagination.

**⋮ menu:** Webhook URL · Chart · Parameters · Risk & exits · Execution · Notifications ·
View/Hide signals · Share · Delete. Items disabled (not hidden) below the required
permission, with a tooltip saying which level is needed.

**8 modals:**

| Modal | Content |
|---|---|
| Webhook URL | Full URL + editable slug + tabs Overview / Actions / Params / cURL, link to the guide |
| Chart | Full TradingView advanced chart for the strategy's symbol (reuse `components/charts/tradingview-advanced-chart.tsx`), interval persisted |
| Parameters | Cooldown seconds + dynamic config fields. **Replaces the reference's `window.prompt("Enter field name")`** with a proper inline add-field row — that native prompt is the one thing in the screenshots worth *not* copying |
| Risk & exits | Tabs: *Risk & Sizing* (sizing method, capital, max concurrent/per-symbol/daily, allow-same-side switch, risk %, risk pips, SL type, default SL %, RR, partial booking R) and *Exit Rules* (repeatable trailing rules: R:R level + type; repeatable partial rules: R:R level + exit %) |
| Execution | Max triggers/day, Paper trading switch, copier account list (switch + × multiplier per account), "Default account" hint |
| Notifications | 3 groups (Entry / Partial / Exit) × Email / Telegram / Push + a Telegram channel multiselect per group |
| Share | Workspace member list, per-member select: No access / View only / View + Execute / Edit + Execute / Co-owner, each with the one-line description; current owner pinned and non-editable |
| Signal history | Existing dialog, restyled; the menu item just expands the row + focuses the Signals tab |

Mobile: the row collapses to a card, the expanded panel stacks, modals become sheets.

---

## 3. Performance page

Today: KPI row + calendar + drilldown. Target adds four whole sections.

### 3A. Backend (`lib/performance/queries.ts`)

- `computeEquityCurve(positions, mode: '₹' | '%' | 'R')` → cumulative series + starting /
  current / peak / drawdown.
- `computePnlDistribution(positions, bucketCount)` → histogram buckets.
- `computeStreaks(positions)` → current streak, longest win, longest loss, avg win streak,
  avg loss streak, recent-N trades.
- `computeSymbolPerformance(positions)` → per-symbol trades / win rate / net / avg R.
- `generateInsights(positions)` → rule-based diagnostics only (overtrading days, loss
  clustering after a loss, best/worst hour-of-day, win rate by side, drawdown breach vs the
  configured risk settings). **No invented numbers, no LLM narration** — each insight cites
  the trades it came from.
- Range presets Today / 1W / 1M / 3M / YTD / Custom (replaces today's 30d/90d/all), plus an
  **asset selector** (Forex ↔ Indian Options) that replaces the current side-by-side
  two-currency layout — screenshot 3 shows one asset at a time.
- **Excel export** — `Export` (whole window) and the trade log's `Excel` button. Check
  `package.json` first; if no xlsx dep, prefer generating real `.xlsx` with a small library
  over mislabeling a CSV.

### 3B. Frontend — `ui-ux-designer`

- **Editorial hero:** eyebrow `PERFORMANCE ANALYSIS · AUGUST 2026`, display serif headline
  with an italic accent word, one-sentence narrative, right-aligned mono net P&L +
  drawdown. The `--font-display` (Fraunces) is already wired.
- **Filter bar:** one row, labeled segments (RANGE / ASSET / ACCOUNT / SYMBOL / SIDE) +
  Live dot + Export. Scrolls horizontally on mobile.
- **KPI strip:** six cells inside *one* bordered container with vertical dividers — not six
  cards. Mono numerals, tone only on the signed values.
- **Trading calendar:** month grid with week numbers (W31…), P&L heatmap cells, header
  "0 trading days · 0 green · 0 red · 0 flat", month stepper, and a persistent right-side
  selection panel (empty state: "Pick a trading day").
- **Equity & behavior:** 2×2 — equity curve (₹ / % / R toggle + STARTING/CURRENT/PEAK/
  DRAWDOWN row), win/loss streaks, P&L distribution histogram, symbol performance.
- **Trade log:** full-width table + search + Excel, columns symbol / side / P&L / date-time
  / entry / exit / size / P&L %.
- **Insights & alerts:** stacked cards, severity by border weight, empty state kept.

Every panel keeps a real empty state — the screenshots are a zero-trade account and still
read well; that's the bar.

---

## 4. Forex / trading module

### 4A. Backend

1. **`position_executions`** table — `(position_id, external_order_id, occurred_at,
   type enum['bought','sold'], side, quantity, price, fee, source)`. Populated by the
   broker sync job and at dispatch time. This is what the expanded row's "EXECUTIONS · 2
   FILLS" sub-table renders; nothing equivalent exists today.
2. **`position_notes`** — `(position_id, author_id, body, created_at)` for "Add note".
3. Broker deep-link resolver per provider for the "Broker order" action (URL template per
   `broker_provider`; omit the button where the provider has no deep link rather than
   linking somewhere wrong).
4. Points-move + time-in-trade derived in `lib/positions/queries.ts` (`+373.00 pts`,
   `1 hrs`) — instrument point size per market, no guessing for unknown symbols.
5. Baskets grouping already has schema (`baskets`, `basket_positions`); wire the
   `Time | Baskets` toggle to a real grouped query.

(The rejected-limit-order surface originally planned here isn't needed — see §0 item 4:
the signal's own `resultMessage` already carries it, surfaced by Phase 2E's Signals tab.)

### 4B. Frontend — `ui-ux-designer`

- Header: live status pill ("9 trades · today · 9 closed"), title + subtitle, right-side
  filters (All Symbols / Strategies / Accounts / Settings).
- **KPI block:** 2×4 grid of compact cards, each with a caption line and a colored bottom
  accent rule (green/red only), sharing a row with a large cumulative-P&L chart card that
  carries PEAK / TROUGH / BEST / WORST in its corner.
- Filter tabs (All / Today / Last 7 Days / Most Profitable / Most Losing) + Time|Baskets +
  Columns.
- **Group header row**: `GROUP · TODAY … TOTAL −$332.78 · 9 trades`.
- **Expandable position row** → executions sub-table + footer actions (Open chart, Broker
  order, Add note).
- Columns: symbol w/ instrument avatar, side pill w/ trend glyph, `entry → exit` stacked,
  `0 / 0.01` quantity, status dot, close reason, P&L + points, RR, SL, strategy (name +
  tag sub-line), account, TIT. Column visibility already exists — extend its list.
- Table keeps a real horizontal scroll container; the page body never scrolls sideways.

---

## 5. Option chain

Backend (`lib/runners/dhan/option-chain.ts`): add underlying LTP, snapshot vs tick
timestamps, per-side totals (total OI calls/puts, total volume, PCR), bid/ask when Dhan
returns them, ATM strike detection.

Frontend — `ui-ux-designer`: `CALLS · STRIKE · PUTS` with tinted side headers, moneyness
shading that deepens toward ATM, **sticky strike column**, highlighted ATM row, an OI bar
drawn as a cell background, mono tabular figures throughout, a Greeks on/off toggle so the
default view is readable, instrument + expiry as segmented controls with the underlying
price beside them, and a footer totals bar. Reference screenshot 8 (ours) is a raw grid;
screenshot 7 is the target density — we go one step calmer than both.

---

## 6. Overview layout

`components/overview/overview-shell.tsx` currently puts positions and accounts side by side
(`xl:grid-cols-3`). **Accounts moves to a full-width block below positions**, as asked.
Small change, no backend.

---

## 7. News + economic calendar (replacing the TradingView widgets)

`app/(user)/dashboard/page.tsx` embeds `TradingViewEconomicCalendar` and
`TradingViewTopStories`. Both go.

### 7A. News — RSS aggregation (free, no key)

Screenshot 1 is exactly an RSS aggregate: CNBC Top News, LiveMint Markets, MarketWatch Top
Stories, Yahoo Finance, CoinDesk. Build `lib/research/rss.ts`:

- Server-side fetch + parse of a curated feed list, 5-minute revalidate, same
  `{status:"ok"|"unavailable"}` contract the heatmap/Finnhub wrappers use.
- Per-feed static metadata: source name + market tag (INDIA / US / GLOBAL / CRYPTO).
- Dedupe by normalized title; ticker chips extracted by matching a symbol dictionary
  against the headline (keep it conservative — a wrong ticker chip is worse than none).
- **Impact badge**: the reference shows "Medium" on literally every row, which suggests a
  constant. We derive it from source tier + keyword list, or drop the badge entirely rather
  than shipping a field that's always the same value.
- Merges with the existing Finnhub company-news search (`lib/research/finnhub.ts`) on one
  page: RSS for breadth, Finnhub for per-ticker depth.
- **Every feed URL gets verified live during implementation** — feed URLs rot.

### 7B. Economic calendar

Candidates, in order:
1. **FMP `/stable/economic-calendar`** — free tier is ~250 req/day and most endpoints are
   included, but whether *this* endpoint is free-tier is not confirmed by the docs.
   **Verify with a real key before building against it.**
2. **FRED release-dates API** — genuinely free, US-only, gives release dates but not
   forecast/actual inline.
3. Keep the TradingView widget for the calendar only, if 1 and 2 both fail.

Frontend: own table — time, country, event, impact (3-dot scale), actual / forecast /
previous, today-first grouping, mono figures. Same monochrome language as everything else.

Sources: [FMP economic calendar](https://site.financialmodelingprep.com/developer/docs/stable/economics-calendar) ·
[FMP free-tier limits](https://www.findmymoat.com/tools/financial-modeling-prep-fmp) ·
[Financial news RSS index](https://rss.feedspot.com/financial_news_rss_feeds/)

---

## Suggested order

1. **Phase 1** — tokens + sweep. Everything else inherits it; doing it later means
   restyling twice.
2. **Phase 2A/2B** — strategies schema + permissions (unblocks the whole strategies UI).
3. **Phase 2E** — strategies UI: rows, menu, modals.
4. **Phase 4A → 4B** — executions table then the forex module.
5. **Phase 3** — performance backend then UI.
6. **Phase 5 / 6 / 7** — option chain, overview swap, news/calendar. Independent; can run
   in parallel with anything.
7. **Phase 2C** — engine (paper, copier multipliers, risk enforcement, trailing rules).
   Last on purpose: it's the only part that can place or mis-size a **real order**, so it
   lands when everything around it is stable and gets its own curl-level verification.

## Verification bar (unchanged from prior plans)

- `npx tsc --noEmit` and `npx eslint .` clean.
- Every new fetch wrapper uses the `{status:"ok"|"unavailable"}` contract — never throw on
  a vendor outage.
- Every webhook/engine change gets a real curl test against a fixture strategy with no
  live-credentialed accounts.
- No fabricated prices, fills, or P&L anywhere — reject cleanly when the real number isn't
  available.
- Browser walkthrough of every changed page, light + dark, desktop + mobile.
