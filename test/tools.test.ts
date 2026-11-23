import { describe, expect, it } from "vitest";
import { callTool } from "./helpers";

// Reference dates (UTC): 2026-12-04 is a Friday, 2026-12-05 a Saturday, 2026-12-07 a Monday.
const FRI = "2026-12-04";
const SAT = "2026-12-05";
const MON = "2026-12-07";

describe("list_locations", () => {
  it("returns the mock locations with staffing rules", async () => {
    const { isError, data } = await callTool("list_locations", {});
    expect(isError).toBe(false);
    expect(data.locations.map((l: any) => l.id)).toEqual(["loc-downtown", "loc-riverside"]);
    expect(data.locations[0]).toMatchObject({ guests_per_staff: 10, min_staff: 2 });
  });

  it("works with arguments omitted", async () => {
    const { isError } = await callTool("list_locations");
    expect(isError).toBe(false);
  });

  it("rejects unexpected arguments", async () => {
    const { isError, text } = await callTool("list_locations", { foo: 1 });
    expect(isError).toBe(true);
    expect(text).toMatch(/unknown argument: foo/);
  });
});

describe("list_shifts", () => {
  it("returns shifts for one day, sorted by start", async () => {
    const { data } = await callTool("list_shifts", { start_date: FRI, end_date: FRI });
    expect(data.count).toBe(7); // Downtown 4 + Riverside 3 (no Friday late cover)
    const starts = data.shifts.map((s: any) => s.start);
    expect([...starts].sort()).toEqual(starts);
    expect(data.shifts[0]).toMatchObject({ start: `${FRI}T09:00:00Z`, location_id: "loc-riverside" });
  });

  it("filters by location", async () => {
    const { data } = await callTool("list_shifts", { start_date: SAT, end_date: SAT, location_id: "loc-downtown" });
    expect(data.count).toBe(5);
    expect(data.shifts.every((s: any) => s.location_id === "loc-downtown")).toBe(true);
    const open = data.shifts.filter((s: any) => s.status === "open");
    expect(open).toHaveLength(1);
    expect(open[0].staff_id).toBeNull();
  });

  it("covers a multi-day range", async () => {
    const { data } = await callTool("list_shifts", { start_date: "2026-12-01", end_date: MON });
    expect(data.count).toBe(56);
  });

  it("is deterministic", async () => {
    const a = await callTool("list_shifts", { start_date: FRI, end_date: MON });
    const b = await callTool("list_shifts", { start_date: FRI, end_date: MON });
    expect(a.data).toEqual(b.data);
  });

  it("rejects an unknown location", async () => {
    const { isError, text } = await callTool("list_shifts", { start_date: FRI, end_date: FRI, location_id: "loc-moon" });
    expect(isError).toBe(true);
    expect(text).toMatch(/unknown location_id/);
  });

  it.each([
    [{ start_date: FRI }, /missing required argument: end_date/],
    [{ start_date: "04/12/2026", end_date: FRI }, /start_date has an invalid format/],
    [{ start_date: "2026-02-30", end_date: "2026-03-01" }, /not a valid calendar date/],
    [{ start_date: MON, end_date: FRI }, /end_date must be on or after start_date/],
    [{ start_date: "2026-01-01", end_date: "2026-03-01" }, /maximum is 31/],
    [{ start_date: 20261204, end_date: FRI }, /start_date must be a string/],
  ])("rejects invalid input %j", async (args, message) => {
    const { isError, text } = await callTool("list_shifts", args);
    expect(isError).toBe(true);
    expect(text).toMatch(message);
  });

  it("rejects non-object arguments", async () => {
    const { isError, text } = await callTool("list_shifts", ["2026-12-04"]);
    expect(isError).toBe(true);
    expect(text).toMatch(/arguments must be an object/);
  });
});

describe("list_bookings", () => {
  it("returns bookings including cancelled ones, counting only confirmed guests", async () => {
    const { data } = await callTool("list_bookings", { start_date: FRI, end_date: FRI, location_id: "loc-downtown" });
    expect(data.count).toBe(4);
    const cancelled = data.bookings.filter((b: any) => b.status === "cancelled");
    expect(cancelled).toHaveLength(1);
    expect(data.confirmed_guests).toBe(8 + 18 + 35);
  });

  it("returns the weekday bookings for one location", async () => {
    const { data } = await callTool("list_bookings", { start_date: MON, end_date: MON, location_id: "loc-riverside" });
    expect(data.count).toBe(2);
  });

  it("validates the range", async () => {
    const { isError } = await callTool("list_bookings", { start_date: "bad", end_date: FRI });
    expect(isError).toBe(true);
  });
});

describe("list_calendar_events", () => {
  it("returns that day's events", async () => {
    const { data } = await callTool("list_calendar_events", { start_date: FRI, end_date: FRI });
    expect(data.events.map((e: any) => e.title)).toEqual(["Ops stand-up", "Weekly staffing review"]);
  });

  it("does not accept a location filter", async () => {
    const { isError, text } = await callTool("list_calendar_events", {
      start_date: FRI,
      end_date: FRI,
      location_id: "loc-downtown",
    });
    expect(isError).toBe(true);
    expect(text).toMatch(/unknown argument: location_id/);
  });
});

describe("get_daily_summary", () => {
  it("flags Friday understaffing at both locations", async () => {
    const { isError, data } = await callTool("get_daily_summary", { date: FRI });
    expect(isError).toBe(false);
    expect(data.alerts).toEqual([
      "Downtown Arcade: understaffed 19:00-21:00 UTC (short by up to 2 staff)",
      "Riverside Trampoline Park: understaffed 17:00-20:00 UTC (short by up to 1 staff)",
    ]);
    const downtown = data.locations.find((l: any) => l.location_id === "loc-downtown");
    expect(downtown.understaffed_slots).toBe(2);
    expect(downtown.peak_shortfall).toBe(2);
    expect(downtown.totals).toMatchObject({ confirmed_bookings: 3, cancelled_bookings: 1, guests: 61 });
    expect(data.calendar_events).toHaveLength(2);
  });

  it("filters to one location and keeps global plus that location's events", async () => {
    const { data } = await callTool("get_daily_summary", { date: SAT, location_id: "loc-downtown" });
    expect(data.locations).toHaveLength(1);
    expect(data.alerts).toEqual([
      "Downtown Arcade: understaffed 11:00-13:00 UTC (short by up to 1 staff)",
      "Downtown Arcade: 1 open shift(s) without assigned staff",
    ]);
    expect(data.calendar_events.map((e: any) => e.title)).toEqual(["Fire safety walk-through"]);
  });

  it("reports no alerts on a well-staffed Monday", async () => {
    const { data } = await callTool("get_daily_summary", { date: MON });
    expect(data.alerts).toEqual([]);
    for (const loc of data.locations) expect(loc.understaffed_slots).toBe(0);
  });

  it("requires a valid date", async () => {
    expect((await callTool("get_daily_summary", {})).isError).toBe(true);
    const { isError, text } = await callTool("get_daily_summary", { date: "2026-13-01" });
    expect(isError).toBe(true);
    expect(text).toMatch(/not a valid calendar date/);
  });

  it("returns text content that mirrors structuredContent", async () => {
    const { data, text } = await callTool("get_daily_summary", { date: FRI });
    expect(JSON.parse(text)).toEqual(data);
  });
});
