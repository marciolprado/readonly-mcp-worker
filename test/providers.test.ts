import { describe, expect, it, vi } from "vitest";
import { ProviderConfigError, ProviderNotWiredError, UpstreamError } from "../src/lib/errors";
import { readOnlyFetch } from "../src/lib/http";
import {
  createBookingsProvider,
  createCalendarProvider,
  createShiftsProvider,
} from "../src/providers";
import { MockShiftsProvider } from "../src/providers/mock";
import { callTool } from "./helpers";

describe("provider selection", () => {
  it("defaults to mock providers", () => {
    expect(createShiftsProvider({}).name).toBe("mock");
    expect(createBookingsProvider({}).name).toBe("mock");
    expect(createCalendarProvider({}).name).toBe("mock");
  });

  it("is case-insensitive", () => {
    expect(createShiftsProvider({ SHIFTS_PROVIDER: " MOCK " })).toBeInstanceOf(MockShiftsProvider);
  });

  it("throws on an unknown provider name", () => {
    expect(() => createShiftsProvider({ SHIFTS_PROVIDER: "excel" })).toThrow(ProviderConfigError);
  });

  it.each([
    ["shifts", () => createShiftsProvider({ SHIFTS_PROVIDER: "connecteam" }), /CONNECTEAM_BASE_URL, CONNECTEAM_API_KEY/],
    ["bookings", () => createBookingsProvider({ BOOKINGS_PROVIDER: "roller" }), /ROLLER_BASE_URL, ROLLER_API_TOKEN/],
    ["calendar", () => createCalendarProvider({ CALENDAR_PROVIDER: "msgraph" }), /MSGRAPH_BASE_URL/],
  ])("real %s provider without config throws a clear error", (_kind, make, message) => {
    expect(make).toThrow(ProviderConfigError);
    expect(make).toThrow(message);
  });

  it("rejects a non-https base URL", () => {
    expect(() =>
      createBookingsProvider({ BOOKINGS_PROVIDER: "roller", ROLLER_BASE_URL: "http://x.test", ROLLER_API_TOKEN: "t" }),
    ).toThrow(/https/);
  });

  it("configured real providers are skeletons that say they are not wired", async () => {
    const p = createBookingsProvider({
      BOOKINGS_PROVIDER: "roller",
      ROLLER_BASE_URL: "https://api.example.com",
      ROLLER_API_TOKEN: "t",
    });
    await expect(p.listBookings({ start: "2026-12-01", end: "2026-12-01" })).rejects.toBeInstanceOf(
      ProviderNotWiredError,
    );
  });
});

describe("provider errors surface as tool errors", () => {
  it("missing config is reported as isError, not a crash", async () => {
    const { isError, text } = await callTool(
      "list_bookings",
      { start_date: "2026-12-04", end_date: "2026-12-04" },
      { BOOKINGS_PROVIDER: "roller" },
    );
    expect(isError).toBe(true);
    expect(text).toMatch(/Provider configuration error: roller provider selected but missing config/);
  });

  it("a broken calendar provider does not break shift tools", async () => {
    const env = { CALENDAR_PROVIDER: "msgraph" };
    expect((await callTool("list_shifts", { start_date: "2026-12-04", end_date: "2026-12-04" }, env)).isError).toBe(false);
    expect((await callTool("get_daily_summary", { date: "2026-12-04" }, env)).isError).toBe(true);
  });

  it("not-wired providers are reported clearly", async () => {
    const { isError, text } = await callTool(
      "list_calendar_events",
      { start_date: "2026-12-04", end_date: "2026-12-04" },
      {
        CALENDAR_PROVIDER: "msgraph",
        MSGRAPH_BASE_URL: "https://graph.microsoft.com/v1.0",
        MSGRAPH_ACCESS_TOKEN: "t",
        MSGRAPH_CALENDAR_USER: "u@example.com",
      },
    );
    expect(isError).toBe(true);
    expect(text).toMatch(/Provider not available: msgraph provider is a skeleton and is not wired yet/);
  });
});

describe("readOnlyFetch", () => {
  it("only issues GET requests with no body", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const data = await readOnlyFetch("https://api.example.com/v1", "/shifts", {
      query: { from: "2026-12-01", skip: undefined },
      headers: { Authorization: "Bearer t" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(data).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/shifts?from=2026-12-01");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("throws UpstreamError on non-2xx", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 }));
    await expect(
      readOnlyFetch("https://api.example.com", "x", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(UpstreamError);
  });
});
