# Webhook API Reference

## Endpoints

| Endpoint | Behavior |
|---|---|
| `POST /api/webhook/strategy/signal` | Synchronous. Replies with the real outcome — `200` success, `400` validation error, `404` unknown/paused strategy, `429` rate-limited. |
| `POST /api/webhook/tradingview` | Async. Replies `202` immediately; parsing, validation, and dispatch happen in the background. Errors are logged server-side only and never returned — check the strategy's signal log instead. Use this one for TradingView alerts specifically. |

Both accept the message in any of these body shapes:

- `application/json` — `{"message": "<the message string below>"}`
- `application/x-www-form-urlencoded` — `message=<the message string>`
- plain text / no content-type — the entire raw body is the message

## Message format

```
SLUG,ACTION[,SYMBOL][,key=value,...]
```

- **SLUG** — required, the strategy's slug (set when the strategy was created).
- **ACTION** — required, one of the actions listed below. Case-insensitive.
- **SYMBOL** — optional. If omitted, the strategy's configured default symbol is used; if neither exists, the signal is rejected. Must not itself contain `=` (a token right after ACTION that contains `=` is treated as the start of the key/value list, not a symbol).
- **key=value pairs** — comma-separated, keys are case-insensitive. A value containing a literal comma will be truncated at that comma — don't put commas inside `comment=`.

Example:
```
manthan-xauusd,BUY,XAUUSD,quantity=2,tag=setup1,stoploss=10,type=points
```

## Actions

| Action | Effect |
|---|---|
| `BUY` | Open a long position. |
| `SELL` | Open a short position. |
| `CLOSELONG` | Close all open long positions (optionally scoped by `tag=`). |
| `CLOSESHORT` | Close all open short positions (optionally scoped by `tag=`). |
| `CLOSELONGPARTIAL` | Partially close long positions — requires `percent=` or `quantity=`. |
| `CLOSESHORTPARTIAL` | Partially close short positions — requires `percent=` or `quantity=`. |
| `MODIFY` | Update stop-loss/target on existing positions — requires `stoploss=` and/or `target=`. |
| `CLOSELONGBUY` | Close all longs, then open a new long — a "flip" in one signal. |
| `CLOSELONGSELL` | Close all longs, then open a new short. |
| `CLOSESHORTBUY` | Close all shorts, then open a new long. |
| `CLOSESHORTSELL` | Close all shorts, then open a new short. |

## Fields

| Field | Applies to | Notes |
|---|---|---|
| `quantity=` | `BUY`/`SELL` and the compound entry actions | Position size. There's no automatic sizing from account risk % — the signal must say how big. |
| `tag=` | any action | Scopes `CLOSELONG`/`CLOSESHORT`/`MODIFY`/partial-closes to positions opened with the same tag. Omit to match all open positions on that side regardless of tag. |
| `stoploss=` | `BUY`/`SELL`, `MODIFY` | Combine with `type=` to say what unit it's in. |
| `target=` | `BUY`/`SELL`, `MODIFY` | Same as above. |
| `type=` | with `stoploss=`/`target=` | One of `PRICE`, `POINTS`, `PERCENTAGE`. Case-insensitive. |
| `risk=` | `BUY`/`SELL` on `AUTO`-handle strategies | Risk % of entry price used to calculate stop-loss automatically, if `stoploss=` isn't given directly. |
| `percent=` | `CLOSELONGPARTIAL`/`CLOSESHORTPARTIAL` | `(0, 100]`. Either this or `quantity=` is required. |
| `quantity=` (on partial closes) | `CLOSELONGPARTIAL`/`CLOSESHORTPARTIAL` | Exact lots/units to close instead of a percentage. |
| `price=` | `BUY`/`SELL` **only on `indian_options` strategies** | Places a limit entry instead of a market order (Motilal only). Rounded conservatively to the nearest ₹0.05. A background job polls and fills-or-cancels the order after ~60s. Rejected on every other market/action — silently ignoring it would risk a market fill the sender explicitly didn't want. |
| `comment=` | any action | Free-text metadata, stored but not acted on. Avoid commas. |
| `basketId=` / `basketName=` | `BUY`/`SELL` | Groups the resulting position under a named basket — pass an existing `basketId` to add to it, or a `basketName` to find-or-create one. |
| `side=` | `MODIFY` | `LONG` or `SHORT` — which side to modify when a strategy holds both. |
| `paper=` | any action | `true`/`false` — per-signal override of the strategy's paper-trading flag. |
| `secret=` | any action | Required only when the strategy has a webhook secret set. Never stored: it is stripped from the parsed fields and blanked out of the raw payload kept on the signal row. |

## Action toggles

Every strategy has three switches, on the expanded row's **Actions** panel (`allow_entry`, `allow_exit`, `allow_modify` — all default on):

| Switch | Gates |
|---|---|
| **Entry** | `BUY`, `SELL` |
| **Exit** | `CLOSELONG`, `CLOSESHORT`, `CLOSELONGPARTIAL`, `CLOSESHORTPARTIAL` |
| **SL / Target** | `MODIFY` |

A signal whose action falls under a switched-off toggle is **cancelled with a reason** on the signal row (`Entry is disabled on this strategy — BUY cancelled`), not silently dropped.

Compound actions (`CLOSELONGBUY` and friends) are gated **per leg**, since each leg belongs to a different toggle:

- Entry off → the close leg still runs, the open leg is skipped.
- Exit off → the open leg still runs, the close leg is skipped.
- Both off → the whole signal is cancelled.

These toggles gate *signals only*. Stop-loss and target hits, trailing-stop rules, partial-booking rules, and manual closes from the Positions UI all run through their own paths and are never affected. The gate also covers the manual-confirmation path, so confirming a `pending_confirmation` signal whose action is now disabled rejects it rather than executing it.

## Webhook secret

Optional, per strategy (`webhook_secret`, null by default). With no secret set, the slug is the only credential — anyone who learns it can fire signals at that strategy. Generate or rotate one from the strategy's **Webhook info** dialog (requires `edit_execute`), then add `secret=<value>` to the message:

```
my-slug,BUY,XAUUSD,quantity=1,secret=8f2c…
```

- A missing or wrong secret gets the same uniform `404 Invalid webhook request` as an unknown slug, and is recorded on the strategy's own signal log as `invalid or missing webhook secret`.
- The secret is stripped out of `parsed_fields` and blanked (`secret=***`) in the `raw_payload` stored on every signal row, and in the server-side logs the async endpoint writes.
- Rotating invalidates every alert still sending the old value — update TradingView immediately after.

## Rate limiting

Both endpoints enforce, per strategy:
- **Cooldown** — signals within `coolDownPeriod` seconds of the last one are rejected with `429` (sync endpoint) or logged-and-dropped (async endpoint).
- **Daily cap** — once `maxTriggersPerDay` signals have been accepted today (UTC), further signals are rejected the same way.

Both are optional per-strategy settings (null = no limit) and can be viewed/edited from the strategy's settings.

## Errors (`strategy/signal` endpoint only)

The sync endpoint returns the same `404 {"error": "Invalid webhook request"}` for "no strategy with this slug exists", "strategy exists but is paused", and "wrong or missing webhook secret" — this is deliberate, so an unauthenticated caller probing slugs can't distinguish them. The activity is still recorded in the strategy's own signal log either way, just not disclosed to whoever sent the request.

## TradingView setup

The slug lives in the message body, not the URL, so every strategy in the product shares one webhook URL — the same design the reference product uses.

1. **Alert → Notifications → Webhook URL:** `https://<your-domain>/api/webhook/tradingview`
2. **Alert → Message:**
   ```
   {"message":"<slug>,{{strategy.order.action}},{{ticker}},quantity=1"}
   ```
   `{{strategy.order.action}}` resolves to `buy`/`sell` on a Pine *strategy* alert (the parser upper-cases it). On an *indicator* alert there is no such placeholder — write the action literally (`BUY`, `SELL`, `CLOSELONG`, …).
3. An exchange prefix on `{{ticker}}` (`OANDA:XAUUSD`, `NSE:NIFTY`) is stripped automatically, so the broker sees `XAUUSD` / `NIFTY`.

TradingView sends `Content-Type: text/plain`, which the plain-text body shape covers — the JSON wrapper above is accepted either way.

For users who shouldn't have to hand-write the message, [`tradingview-webhook-template.pine`](tradingview-webhook-template.pine) builds it from a `Strategy_Slug` input; the same template is copyable from the **TradingView** tab of the Webhook info dialog, pre-filled with that strategy's slug.
