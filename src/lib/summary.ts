/**
 * Pure aggregation logic for get_daily_summary. No I/O: takes already-fetched
 * data and returns hourly staffing-vs-demand slots per location.
 *
 * Rules (per location, per hourly slot while open):
 * - staff_on_shift: assigned ("scheduled") shifts overlapping the slot. Open
 *   (unassigned) shifts do not count as staff, but are reported.
 * - guests: sum of guests of confirmed bookings overlapping the slot.
 * - required_staff: max(minStaff, ceil(guests / guestsPerStaff)).
 * - understaffed when staff_on_shift < required_staff.
 */
import { isoAt, overlaps } from "./dates";
import type { Booking, CalendarEvent, Location, Shift } from "../providers/types";

export interface Slot {
  start: string;
  end: string;
  staff_on_shift: number;
  guests: number;
  required_staff: number;
  shortfall: number;
  status: "ok" | "understaffed";
}

export interface LocationSummary {
  location_id: string;
  location_name: string;
  open_hours: { open: string; close: string };
  totals: {
    scheduled_shifts: number;
    open_shifts: number;
    staff_hours: number;
    confirmed_bookings: number;
    cancelled_bookings: number;
    guests: number;
  };
  slots: Slot[];
  understaffed_slots: number;
  peak_shortfall: number;
}

export interface DailySummary {
  date: string;
  locations: LocationSummary[];
  calendar_events: CalendarEvent[];
  alerts: string[];
}

const HOUR_MS = 3_600_000;

export function buildDailySummary(
  date: string,
  locations: Location[],
  shifts: Shift[],
  bookings: Booking[],
  events: CalendarEvent[],
): DailySummary {
  const alerts: string[] = [];

  const summaries = locations.map((loc): LocationSummary => {
    const locShifts = shifts.filter((s) => s.locationId === loc.id);
    const assigned = locShifts.filter((s) => s.status === "scheduled" && s.staffId);
    const openShifts = locShifts.filter((s) => s.status === "open" || !s.staffId);
    const locBookings = bookings.filter((b) => b.locationId === loc.id);
    const confirmed = locBookings.filter((b) => b.status === "confirmed");

    const slots: Slot[] = [];
    for (let h = loc.openHour; h < loc.closeHour; h++) {
      const start = isoAt(date, h);
      const end = isoAt(date, h + 1);
      const s = Date.parse(start);
      const e = s + HOUR_MS;
      const staff = new Set(
        assigned
          .filter((x) => overlaps(Date.parse(x.start), Date.parse(x.end), s, e))
          .map((x) => x.staffId),
      ).size;
      const guests = confirmed
        .filter((b) => overlaps(Date.parse(b.start), Date.parse(b.end), s, e))
        .reduce((sum, b) => sum + b.guests, 0);
      const required = Math.max(loc.minStaff, Math.ceil(guests / loc.guestsPerStaff));
      const shortfall = Math.max(0, required - staff);
      slots.push({
        start,
        end,
        staff_on_shift: staff,
        guests,
        required_staff: required,
        shortfall,
        status: shortfall > 0 ? "understaffed" : "ok",
      });
    }

    const under = slots.filter((x) => x.status === "understaffed");
    for (const run of contiguousRuns(under)) {
      const first = run[0]!;
      const last = run[run.length - 1]!;
      const worst = Math.max(...run.map((x) => x.shortfall));
      alerts.push(
        `${loc.name}: understaffed ${first.start.slice(11, 16)}-${last.end.slice(11, 16)} UTC ` +
          `(short by up to ${worst} staff)`,
      );
    }
    if (openShifts.length > 0) {
      alerts.push(`${loc.name}: ${openShifts.length} open shift(s) without assigned staff`);
    }

    const staffHours =
      assigned.reduce((sum, x) => sum + (Date.parse(x.end) - Date.parse(x.start)), 0) / HOUR_MS;

    return {
      location_id: loc.id,
      location_name: loc.name,
      open_hours: { open: isoAt(date, loc.openHour), close: isoAt(date, loc.closeHour) },
      totals: {
        scheduled_shifts: assigned.length,
        open_shifts: openShifts.length,
        staff_hours: Math.round(staffHours * 100) / 100,
        confirmed_bookings: confirmed.length,
        cancelled_bookings: locBookings.length - confirmed.length,
        guests: confirmed.reduce((sum, b) => sum + b.guests, 0),
      },
      slots,
      understaffed_slots: under.length,
      peak_shortfall: under.reduce((m, x) => Math.max(m, x.shortfall), 0),
    };
  });

  return { date, locations: summaries, calendar_events: events, alerts };
}

function contiguousRuns(slots: Slot[]): Slot[][] {
  const runs: Slot[][] = [];
  for (const slot of slots) {
    const current = runs[runs.length - 1];
    if (current && current[current.length - 1]!.end === slot.start) current.push(slot);
    else runs.push([slot]);
  }
  return runs;
}
