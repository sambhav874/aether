# Monarch — User Guide

Monarch connects your broker accounts to automated strategies. A strategy listens for signals (from TradingView, or any system that can send a webhook), and dispatches real orders to whichever broker accounts you've linked to it.

## 1. Create a workspace, invite your team

Every account lives inside a workspace (your firm/desk). The first person in creates it; everyone else joins by invite.

**Roles**, from broadest to narrowest:

| Role | Can trade | Manage strategies | Manage brokers | Billing |
|---|---|---|---|---|
| Owner | Yes | Yes | Yes | Yes |
| Admin | Yes | Yes | Yes | — |
| Strategist | Yes | Yes | — | — |
| Trader | Yes | View only | — | — |
| Analyst | View only | View only | — | — |
| Researcher | View only | — | — | — |
| Integrations Manager | View only | View only | Yes | — |
| Integrations Viewer | View only | — | View only | — |
| Viewer | View only | — | — | — |

Pick the narrowest role that lets someone do their job — an Analyst can watch every position and read every strategy's performance without being able to place or close a single order.

## 2. Connect a broker

**Settings → Integrations.** Supported today:

- **MetaAPI / MT5** — for forex (and, if your broker's MT5 account supports them, commodity CFDs). Requires a MetaAPI account token.
- **Zerodha, Dhan, Motilal Oswal** — Indian equity and options. Each needs that broker's own API credentials (API key + secret, or similarly named fields depending on the broker).

After connecting a Zerodha/Dhan/Motilal account, it lands in a **"Whitelist pending"** state even if the login itself succeeded. This isn't a bug — SEBI requires order placement to originate from a static, pre-approved IP, and none of these brokers' APIs report whitelist status back automatically. You need to confirm the static IP shown in the panel is whitelisted on that broker's own dashboard before the account can actually place trades.

## 3. Build a strategy

**Monarch → Strategies → New strategy.**

- **Name** — anything descriptive (e.g. "Manthan | XAUUSD").
- **Slug** — auto-generated from the name if left blank. This is what identifies the strategy in every webhook signal, so keep it stable once you're using it live.
- **Market** — Forex, Indian Options, or Indian Equity. Determines which linked broker accounts are eligible and which webhook fields are required (see below).
- **Handle type**:
  - **AUTO** — signals dispatch immediately; stop-loss is calculated from a risk % of entry price.
  - **MANUAL** — every signal is held as "awaiting confirmation" until a human approves it from the strategy's signal log.
  - **BY STRATEGY** — dispatches immediately, no automatic stop-loss — you're saying the strategy's own logic (inside the alert itself) owns exits entirely.
- **Default symbol** *(optional)* — used when a webhook signal doesn't include one.
- **Cooldown** *(optional)* — minimum seconds between accepted signals. Leave blank for no cooldown.
- **Max triggers/day** *(optional)* — hard daily cap on accepted signals (resets at UTC midnight). Leave blank for unlimited.

Once created, link it to one or more of your connected broker accounts — a strategy with no linked accounts accepts signals but has nothing to dispatch them to.

## 4. Wire up TradingView (or anything else that can send a webhook)

Two webhook URLs exist:

- `POST /api/webhook/strategy/signal` — replies synchronously with the real result (success, rejection reason, or validation error). Use this for testing, or for any system that reads the response.
- `POST /api/webhook/tradingview` — for TradingView alerts specifically. Acks instantly and never talks back about what went wrong (TradingView doesn't meaningfully retry failed deliveries anyway) — check the signal log in the strategy's detail page to see what actually happened to each alert.

Both URLs are the same for every strategy — what identifies yours is the **slug** at the start of the message body, so there's no per-strategy URL to hand out.

In TradingView: **Alert → Notifications → Webhook URL** = `https://<your-domain>/api/webhook/tradingview`, and **Message**:

```
{"message":"<your-slug>,{{strategy.order.action}},{{ticker}},quantity=1"}
```

If you'd rather not hand-write that, drop [`tradingview-webhook-template.pine`](tradingview-webhook-template.pine) on the chart and set its **Strategy_Slug** input — everything else is built for you. The same template, pre-filled with the strategy's slug, is copyable from the **TradingView** tab of the Webhook info dialog (strategy row menu → Webhook info).

**Webhook secret** *(optional)* — by default the slug is the only credential, so anyone who learns it can send signals to your strategy. Generate a secret in the Webhook info dialog and every signal then has to carry `secret=<value>`; the Pine template has an input for it.

**Actions** — the expanded strategy row has three switches: **Entry** (BUY/SELL), **Exit** (CLOSE signals), **SL / Target** (MODIFY signals). Turn one off and matching signals are cancelled with a reason in the log instead of trading. Your stop-losses, targets, trailing rules and manual closes keep running either way — switching Exit off never strands an open position.

The message format and every supported field are documented in [`WEBHOOK_API.md`](WEBHOOK_API.md) — that's the one to hand to whoever is writing the TradingView alert message.

## 5. Monitor

- **Strategy detail page** — signal history, triggers-today count against your daily cap, cooldown status, pending manual confirmations.
- **Trading Module** (Forex / Indian Options / Indian Equity under Monarch) — live positions per market, and for Indian Options, an **Option Chain** modal (strike ladder with Greeks, sourced from Dhan) to check live prices before/while a strategy is running.
- **Performance** — P&L and stats rolled up across strategies and accounts.
- **Heatmap** — market-cap/volume treemaps across Crypto, US Equity, India F&O, India Equity, India Broad indices, Commodities, and Forex.
- **Research** — market news, filterable by category (General/Forex/Crypto/M&A) or searchable by ticker.

## 6. Notifications

**Settings → Notifications.** Toggle what you want delivered: strategy signals, broker disconnections, strategy pauses (security alerts are always on). Delivery today is via **Telegram** — add the bot to a chat or group, click "detect chats" in the panel, pick the right one. Email delivery isn't wired up yet.

## 7. Billing

There's no real billing yet — every workspace currently has full access at no cost while a payment provider is being finalized. The Billing & plan and Usage & credits tabs in Settings say exactly that; nothing will start charging you unexpectedly.

## Things that don't exist yet

- **Paper trading** — no simulated-fill mode. Every signal that reaches a linked, whitelisted broker account places a real order.
- **Crypto, US equity, commodities (dedicated), and bonds as tradable markets** — the strategy `Market` picker only offers Forex, Indian Options, and Indian Equity today; other markets need a broker integration that doesn't exist yet.
