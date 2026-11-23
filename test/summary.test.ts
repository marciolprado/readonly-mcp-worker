import { describe, expect, it } from "vitest";
import { buildDailySummary } from "../src/lib/summary";
import type { Booking, Location, Shift } from "../src/providers/types";

const D = "2026-06-01";
const loc: Location = { id: "L", name: "Test Site", openHour: 10, closeHour: 14, guestsPerStaff: 5, minStaff: 1 };

const shift = (id: string, staffId: string | null, start: number, end: number): Shift => ({
  id,
  locationId: "L",
  staffId,
  staffName: staffId,
  role: "Crew",
  start: `${D}T${String(start).padStart(2, "0")}:00:00Z`,
  end: `${D}T${String(end).padStart(2, "0")}:00:00Z`,
  status: staffId ? "scheduled" : "open",
});

const booking = (id: string, guests: number, start: string, end: string, status: Booking["status"] = "confirmed"): Booking => ({
  id,
  locationId: "L",
  product: "Ticket",
  guests,
  start: `${D}T${start}:00Z`,
  end: `${D}T${end}:00Z`,
  status,
});

describe("buildDailySummary", () => {
  it("builds one slot per open hour", () => {
    const s = buildDailySummary(D, [loc], [], [], []);
    expect(s.locations[0]!.slots.map((x) => x.start.slice(11, 16))).toEqual(["10:00", "11:00", "12:00", "13:00"]);
  });

  it("applies the minimum staff rule when there are no guests", () => {
    const s = buildDailySummary(D, [loc], [], [], []);
    const l = s.locations[0]!;
    expect(l.slots.every((x) => x.required_staff === 1 && x.status === "understaffed")).toBe(true);
    expect(s.alerts).toEqual(["Test Site: understaffed 10:00-14:00 UTC (short by up to 1 staff)"]);
  });

  it("uses ceil(guests / guestsPerStaff) for required staff", () => {
    const s = buildDailySummary(
      D,
      [loc],
      [shift("a", "s1", 10, 14), shift("b", "s2", 10, 14)],
      [booking("b1", 11, "11:00", "12:00")],
      [],
    );
    const slot = s.locations[0]!.slots[1]!;
    expect(slot).toMatchObject({ guests: 11, required_staff: 3, staff_on_shift: 2, shortfall: 1, status: "understaffed" });
    expect(s.locations[0]!.slots[0]!.status).toBe("ok");
  });

  it("counts partial overlaps for bookings and shifts", () => {
    const s = buildDailySummary(D, [loc], [shift("a", "s1", 10, 11)], [booking("b1", 3, "10:30", "11:15")], []);
    const [s10, s11] = s.locations[0]!.slots;
    expect(s10).toMatchObject({ guests: 3, staff_on_shift: 1, status: "ok" });
    expect(s11).toMatchObject({ guests: 3, staff_on_shift: 0, status: "understaffed" });
  });

  it("ignores cancelled bookings and open shifts", () => {
    const s = buildDailySummary(
      D,
      [loc],
      [shift("a", "s1", 10, 14), shift("open", null, 10, 14)],
      [booking("x", 100, "10:00", "14:00", "cancelled")],
      [],
    );
    const l = s.locations[0]!;
    expect(l.understaffed_slots).toBe(0);
    expect(l.totals).toMatchObject({ open_shifts: 1, scheduled_shifts: 1, cancelled_bookings: 1, guests: 0, staff_hours: 4 });
    expect(s.alerts).toEqual(["Test Site: 1 open shift(s) without assigned staff"]);
  });

  it("does not double count one person with two overlapping shifts", () => {
    const s = buildDailySummary(D, [loc], [shift("a", "s1", 10, 12), shift("b", "s1", 11, 14)], [], []);
    expect(s.locations[0]!.slots[1]!.staff_on_shift).toBe(1);
  });

  it("splits non-contiguous understaffed periods into separate alerts", () => {
    const s = buildDailySummary(D, [loc], [shift("a", "s1", 11, 13)], [], []);
    expect(s.alerts).toEqual([
      "Test Site: understaffed 10:00-11:00 UTC (short by up to 1 staff)",
      "Test Site: understaffed 13:00-14:00 UTC (short by up to 1 staff)",
    ]);
  });

  it("handles locations open until midnight", () => {
    const late: Location = { ...loc, openHour: 22, closeHour: 24 };
    const s = buildDailySummary(D, [late], [], [], []);
    expect(s.locations[0]!.slots[1]!.end).toBe("2026-06-02T00:00:00Z");
  });
});
