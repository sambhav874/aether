# Broker Credentials — Dhan & Motilal Oswal

Dhan and Motilal Oswal are **per-user, not platform-level**. Aether ships no
app-wide API key for either broker — each user generates their own
credentials on the broker's own site and pastes them into
**Settings → Integrations → Add connection**. Stored encrypted
(`credentialsEncrypted`, AES-256-GCM via `BROKER_CREDENTIALS_ENCRYPTION_KEY`)
in `broker_accounts`. See [db/schema/broker-accounts.ts](../db/schema/broker-accounts.ts)
and [lib/runners/motilal/index.ts](../lib/runners/motilal/index.ts) /
[lib/runners/dhan](../lib/runners) for the adapters.

This is unlike Zerodha (platform-owned `ZERODHA_API_KEY`/`SECRET`, OAuth login)
and MetaApi (fully platform-owned bridge token) — see
[DEPLOYMENT_KEYS.md](../DEPLOYMENT_KEYS.md).

---

## Dhan

Fields asked in the connect form: **Client ID**, **Access token**, PIN
(optional), **TOTP secret** (optional).

1. Log in at [web.dhan.co](https://web.dhan.co).
2. Click your profile picture (top-right) → **Access DhanHQ APIs**.
3. First time only: click **Request Access**, refresh the page — access is
   granted within seconds.
4. Go to **Profile & Account Details** → copy your **Client ID**.
5. On the DhanHQ APIs page, generate an **Access token** (Trading APIs tab).
   Valid ~24h — copy and store it immediately, it's shown once.
6. *(Optional, for auto-refresh)* Enable **Setup TOTP** on that page, save
   the 32-character base32 setup key (not the 6-digit code) — Aether uses
   this to show you a live code so you don't need a separate authenticator
   app open when generating a fresh token each day.
7. Paste Client ID + Access token (+ PIN/TOTP secret if set up) into the
   Dhan connect form.

Token expires daily — reconnect (regenerate on Dhan's site, repaste here)
when the account shows "needs reauth".

Source: [Dhan support — how to generate API access token](https://dhan.freshdesk.com/support/solutions/articles/82000891153-how-to-generate-api-access-token-),
[Dhan support — how to access Dhan API](https://dhan.co/support/platforms/dhanhq-api/how-to-access-dhan-api/).

---

## Motilal Oswal

Three ways to connect. All of them need the **API key** from
[invest.motilaloswal.com/moapi](https://invest.motilaloswal.com/moapi/) —
MO sends it as a header on every call, so there is no key-free path.

1. **Log in with Motilal (no password stored).** Paste the API key, click
   *Log in with Motilal*: MO's own page takes your MOFSL ID and password and
   redirects back with the auth token. Requires the redirect URL on your MO
   API portal app to point at
   `https://<your-deployment>/api/integrations/motilal/callback`. Token dies
   6 AM daily, so repeat each trading morning.
2. **Password (automatic daily tokens).** Client code + API key + MOFSL
   password (+ TOTP secret and 2FA for Investor accounts). Aether calls
   `/rest/login/v3/authdirectapi` with `SHA256(password + APIKey)` and mints a
   new token itself whenever MO rejects the old one — nothing to repaste.
   The password is stored encrypted.
3. **Paste an auth token.** Client code + API key + a current `…_M` token from
   the portal. Expires 6 AM daily.

Setup on MO's side:

1. Log in at [invest.motilaloswal.com/moapi](https://invest.motilaloswal.com/moapi/).
2. Create an API key (Direct/self-built app, Trading API type) — activates
   automatically for retail clients.
3. Note your **client code** — the MOFSL login ID (e.g. `AA020`), **not** the
   email you use on the website. An email here fails every call with
   `MO2007 Authorization is Invalid In Header Parameter`.
4. *(Investor accounts)* Copy the 32-character **TOTP secret** from the portal
   dashboard, and note your **2FA** value — DOB (dd/mm/yyyy) or PAN.
5. If your account requires IP whitelisting for order placement, add Aether's
   static IP (shown under "whitelist pending") to the MO portal's whitelist,
   then click "Mark as whitelisted".

> Note: the adapter's endpoints, mandatory headers and response shapes are
> verified against MOFSL's own Open API docs
> ([header parameters](https://invest.motilaloswal.com/OpenApi/Dashboard/API_Documentation/HeaderParameters.html),
> [margin](https://invest.motilaloswal.com/OpenApi/Dashboard/API_Documentation/LimitAPI.html),
> [portfolio](https://invest.motilaloswal.com/OpenApi/Dashboard/API_Documentation/PortfolioAPI.html),
> [orders](https://invest.motilaloswal.com/OpenApi/Dashboard/API_Documentation/OrdersAPI.html),
> [LTP](https://invest.motilaloswal.com/OpenApi/Dashboard/API_Documentation/PriceLTPAPI.html)).
> MO requires `User-Agent`, `ClientLocalIp`, `ClientPublicIp`, `MacAddress`
> and `SourceId` on **every** call (SEBI audit trail) — set
> `BROKER_RUNNER_STATIC_IP` (and optionally `BROKER_RUNNER_LOCAL_IP` /
> `BROKER_RUNNER_MAC_ADDRESS`) in the deployment, otherwise MO answers HTTP
> 200 with `status: "ERROR"` and balances read as 0.00.

Sources: [MOFSL Open API — Authentication](https://invest.motilaloswal.com/OpenApi/Dashboard/API_Documentation/AuthenticationProfileAPI.html),
[Motilal Oswal API FAQ](https://invest.motilaloswal.com/moAPI/APIDocumentation/FAQ).
