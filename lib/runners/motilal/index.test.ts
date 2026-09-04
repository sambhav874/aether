import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/runners/credentials", () => ({
  getStoredCredentials: vi.fn(),
  updateStoredCredentials: vi.fn(),
}));

import { getStoredCredentials, updateStoredCredentials } from "@/lib/runners/credentials";
import { motilalRunner } from "./index";

const storedCreds = vi.mocked(getStoredCredentials);
const savedCreds = vi.mocked(updateStoredCredentials);

function stored(extra: Record<string, string> = {}) {
  storedCreds.mockResolvedValue({
    externalAccountId: "AA020",
    credentials: { apiKey: "k", authToken: "t", clientCode: "AA020", ...extra },
  });
}

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  fetchMock.mockReset();
  savedCreds.mockReset();
  stored();
});

// Response shapes below are MOFSL's own documented samples (LimitAPI.html,
// PortfolioAPI.html) — the adapter used to expect flat marginused /
// marginavailable fields that MO never returns, which is what made every
// account read 0.00.
const MARGIN_SUMMARY = {
  status: "SUCCESS",
  message: "REPORT MARGIN SUMMARY",
  errorcode: "",
  data: [
    { srno: 102, particulars: "Total Available Margin for Cash", amount: 250000 },
    { srno: 103, particulars: "Total Available Margin for FNO", amount: 250000 },
    { srno: 104, particulars: "Total Available Margin for Curr", amount: 250000 },
    { srno: 105, particulars: "Total Available Margin for Comm", amount: 250000 },
    { srno: 201, particulars: "Cash deposit", amount: 300000 },
    { srno: 220, particulars: "Non cash deposit", amount: 50000 },
    { srno: 321, particulars: "Margin Usage(B) FO", amount: 100000 },
    { srno: 600, particulars: "Total Profit and Loss(MTM)", amount: 1500 },
    { srno: 700, particulars: "Total Profit and Loss(BPL)", amount: 500 },
  ],
};

describe("motilalRunner.getBalance", () => {
  it("reads balance/equity out of the srno-keyed margin summary rows", async () => {
    fetchMock.mockResolvedValueOnce(ok(MARGIN_SUMMARY)).mockResolvedValueOnce(ok({ status: "SUCCESS", data: [] }));

    const balance = await motilalRunner.getBalance("acc-1");

    // Deposits, not the per-segment available-margin rows: those repeat one
    // shared pool and would quadruple the balance if summed.
    expect(balance.balance).toBe(350000);
    expect(balance.equity).toBe(352000);
    expect(balance.currency).toBe("INR");
  });

  it("throws on a business-level failure instead of reporting 0.00", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ status: "ERROR", message: "Token Expired", errorcode: "MO8002", data: [] }),
    );

    await expect(motilalRunner.getBalance("acc-1")).rejects.toThrow(/MO8002/);
  });

  it("sends the headers MO makes mandatory on every call", async () => {
    fetchMock.mockResolvedValueOnce(ok(MARGIN_SUMMARY)).mockResolvedValueOnce(ok({ status: "SUCCESS", data: [] }));
    await motilalRunner.getBalance("acc-1");

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("MOSL/V.1.0.0");
    expect(headers.SourceId).toBe("Web");
    expect(headers.ApiKey).toBe("k");
    expect(headers.Authorization).toBe("t");
    expect(headers.ClientPublicIp).toBeTruthy();
    expect(headers.ClientLocalIp).toBeTruthy();
    expect(headers.MacAddress).toBeTruthy();
  });
});

describe("holdings valuation", () => {
  it("adds the unpledged demat book, marked at LTP, to equity", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ ...MARGIN_SUMMARY, data: MARGIN_SUMMARY.data.slice(0, 6) }))
      .mockResolvedValueOnce(
        ok({
          status: "SUCCESS",
          data: [
            {
              scripname: "RELAXO EQ",
              scripisinno: "INE131B01039",
              dpquantity: 100,
              collateralquantity: 40, // already counted as "Non cash deposit"
              buyavgprice: 800,
              nsesymboltoken: 123,
              bsescripcode: 50001,
            },
          ],
        }),
      )
      // getltpdata quotes in paise
      .mockResolvedValueOnce(ok({ status: "SUCCESS", data: [{ ltp: 90000 }] }));

    const balance = await motilalRunner.getBalance("acc-1");

    // deposits 350000, no MTM/BPL rows in this slice, plus 60 free shares @ 900
    expect(balance.balance).toBe(350000);
    expect(balance.equity).toBe(350000 + 54000);
  });

  it("still reports cash figures when the quote call fails", async () => {
    fetchMock
      .mockResolvedValueOnce(ok(MARGIN_SUMMARY))
      .mockResolvedValueOnce(ok({ status: "ERROR", message: "holding unavailable", errorcode: "MO9999" }));

    const balance = await motilalRunner.getBalance("acc-1");
    expect(balance.equity).toBe(352000);
  });
});

describe("motilalRunner.getPositions", () => {
  it("derives net side/quantity/average price and merges demat holdings", async () => {
    fetchMock
      .mockResolvedValueOnce(
        ok({
          status: "SUCCESS",
          data: [
            {
              exchange: "NSEFO",
              symboltoken: 43110,
              symbol: "NIFTY 26-Dec-2024 CE 24000",
              productname: "NORMAL",
              buyquantity: 150,
              buyamount: 15000,
              sellquantity: 75,
              sellamount: 8000,
              LTP: 105,
              marktomarket: 375,
              optiontype: "CE",
              strikeprice: 24000,
            },
            {
              exchange: "NSE",
              symboltoken: 1660,
              symbol: "INFY",
              productname: "NORMAL",
              buyquantity: 0,
              buyamount: 0,
              sellquantity: 0,
              sellamount: 0,
              LTP: 1500,
              marktomarket: 0,
              optiontype: "XX",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        ok({
          status: "SUCCESS",
          data: [
            {
              scripname: "RELAXO EQ",
              scripisinno: "INE131B01039",
              dpquantity: 1119,
              buyavgprice: 813.66,
              nsesymboltoken: 123,
              bsescripcode: 50001,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(ok({ status: "SUCCESS", data: [{ ltp: 90000 }] }));

    const positions = await motilalRunner.getPositions("acc-1");

    expect(positions).toHaveLength(2); // flat INFY row dropped
    expect(positions[0]).toMatchObject({
      externalPositionId: "43110",
      side: "long",
      quantity: 75,
      entryPrice: 100,
      unrealizedPnl: 375,
      market: "indian_options",
    });
    expect(positions[1]).toMatchObject({
      externalPositionId: "holding:123",
      symbol: "RELAXO EQ",
      quantity: 1119,
      entryPrice: 813.66,
      market: "indian_equity",
    });
    // (900 - 813.66) * 1119, from the paise-quoted LTP
    expect(positions[1].unrealizedPnl).toBeCloseTo(96614.46, 2);
  });
});

describe("motilalRunner.placeOrder", () => {
  it("converts units to lots and routes F&O to NSEFO", async () => {
    fetchMock
      // scrip master for NSEFO
      .mockResolvedValueOnce(
        ok({
          status: "SUCCESS",
          data: [
            {
              scripcode: 43110,
              scripname: "NIFTY 26-Dec-2024 CE 24000",
              scripshortname: "NIFTY24DEC24000CE",
              marketlot: 25,
              instrumentname: "OPTIDX",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(ok({ status: "SUCCESS", uniqueorderid: "2400155AA020" }));

    const result = await motilalRunner.placeOrder("acc-1", {
      symbol: "NIFTY24DEC24000CE",
      side: "buy",
      quantity: 75,
      price: 105.5,
    });

    expect(result.status).toBe("executed");
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body).toMatchObject({
      exchange: "NSEFO",
      symboltoken: 43110,
      buyorsell: "BUY",
      ordertype: "LIMIT",
      quantityinlot: 3, // 75 units / lot size 25
      price: 105.5,
    });
  });

  it("rejects a symbol that isn't in the scrip master rather than sending a bad token", async () => {
    fetchMock.mockResolvedValueOnce(ok({ status: "SUCCESS", data: [] }));

    const result = await motilalRunner.placeOrder("acc-1", {
      symbol: "NOTREAL",
      side: "buy",
      quantity: 1,
    });

    expect(result).toMatchObject({ status: "rejected" });
    expect(result.message).toMatch(/scrip master/);
  });
});

describe("vendor key", () => {
  it("falls back to the platform key and vendor tag when the account carries none", async () => {
    process.env.MOTILAL_VENDOR_API_KEY = "vendorkey";
    process.env.MOTILAL_VENDOR_TAG = "AETH";
    storedCreds.mockResolvedValue({
      externalAccountId: "AA020",
      credentials: { apiKey: "", authToken: "t", clientCode: "AA020" },
    });
    fetchMock.mockResolvedValueOnce(ok(MARGIN_SUMMARY)).mockResolvedValueOnce(ok({ status: "SUCCESS", data: [] }));

    await motilalRunner.getBalance("acc-1");

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.ApiKey).toBe("vendorkey");
    // FAQ Q35: vendors send their short name here, not the client code.
    expect(headers.vendorinfo).toBe("AETH");

    delete process.env.MOTILAL_VENDOR_API_KEY;
    delete process.env.MOTILAL_VENDOR_TAG;
  });
});

describe("daily token refresh", () => {
  it("re-logs in with the stored password when MO rejects the token, then retries", async () => {
    stored({ password: "s3cret", twoFa: "01/01/1990" });
    fetchMock
      .mockResolvedValueOnce(
        ok({ status: "ERROR", message: "Authorization is Invalid In Header Parameter", errorcode: "MO2007" }),
      )
      .mockResolvedValueOnce(ok({ status: "SUCCESS", AuthToken: "newtoken_M", isAuthTokenVerified: "TRUE" }))
      .mockResolvedValueOnce(ok(MARGIN_SUMMARY))
      .mockResolvedValueOnce(ok({ status: "SUCCESS", data: [] }));

    const balance = await motilalRunner.getBalance("acc-1");
    expect(balance.balance).toBe(350000);

    // SHA256("s3cret" + "k") — MO hashes the password concatenated with the
    // API key, not the password alone.
    const loginBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(fetchMock.mock.calls[1][0]).toContain("/rest/login/v3/authdirectapi");
    expect(loginBody.userid).toBe("AA020");
    expect(loginBody.password).toBe(
      createHash("sha256").update("s3cretk").digest("hex"),
    );
    expect(loginBody["2FA"]).toBe("01/01/1990");

    // Retry carries the new token, and it's persisted so the next request
    // (or another server instance) skips the login round-trip.
    const retryHeaders = fetchMock.mock.calls[2][1].headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe("newtoken_M");
    expect(savedCreds).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({ authToken: "newtoken_M" }),
    );
  });

  it("gives up without a stored password instead of looping", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ status: "ERROR", message: "Authorization is Invalid", errorcode: "MO2007" }),
    );

    await expect(motilalRunner.getBalance("acc-1")).rejects.toThrow(/MO2007/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("motilalRunner.connectAccount", () => {
  it("rejects an email in the client code field before storing it", async () => {
    await expect(
      motilalRunner.connectAccount({
        apiKey: "k",
        authToken: "t",
        clientCode: "someone@example.com",
      }),
    ).rejects.toThrow(/client code looks like an email/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves the client code from the profile when the portal login supplies only a token", async () => {
    fetchMock
      .mockResolvedValueOnce(
        ok({ status: "SUCCESS", data: { clientcode: "AA020", name: "CLIENT NAME", usertype: "Investor Client" } }),
      )
      .mockResolvedValueOnce(ok(MARGIN_SUMMARY));

    const result = await motilalRunner.connectAccount({
      apiKey: "k",
      authToken: "portal_M",
      clientCode: "",
    });

    expect(fetchMock.mock.calls[0][0]).toContain("/rest/login/v1/getprofile");
    expect(result.account.externalAccountId).toBe("AA020");
    expect(result.credentials.clientCode).toBe("AA020");
  });

  it("mints an auth token from the password when none is pasted", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ status: "SUCCESS", AuthToken: "minted_M", isAuthTokenVerified: "TRUE" }))
      .mockResolvedValueOnce(ok(MARGIN_SUMMARY));

    const result = await motilalRunner.connectAccount({
      apiKey: "k",
      authToken: "",
      clientCode: "AA020",
      password: "s3cret",
    });

    expect(result.credentials.authToken).toBe("minted_M");
    expect(result.account.externalAccountId).toBe("AA020");
  });
});
