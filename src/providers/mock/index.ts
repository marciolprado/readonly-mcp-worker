import { eachDate, isoAt, weekday } from "../../lib/dates";
import type {
  Booking,
  BookingsProvider,
  CalendarEvent,
  CalendarProvider,
  DateRange,
  Location,
  Shift,
  ShiftsProvider,
} from "../types";
import { BOOKING_TEMPLATES, EVENT_TEMPLATES, LOCATIONS, SHIFT_TEMPLATES, STAFF } from "./fixtures";

const byStart = (a: { start: string; id: string }, b: { start: string; id: string }) =>
  a.start === b.start ? a.id.localeCompare(b.id) : a.start.localeCompare(b.start);

export class MockShiftsProvider implements ShiftsProvider {
  readonly name = "mock";

  async listLocations(): Promise<Location[]> {
    return LOCATIONS.map((l) => ({ ...l }));
  }

  async listShifts(range: DateRange, locationId?: string): Promise<Shift[]> {
    const out: Shift[] = [];
    for (const date of eachDate(range)) {
      const wd = weekday(date);
      SHIFT_TEMPLATES.forEach((t, i) => {
        if (!t.days.includes(wd) || (locationId && t.locationId !== locationId)) return;
        out.push({
          id: `shf-${date}-${i}`,
          locationId: t.locationId,
          staffId: t.staffId,
          staffName: t.staffId ? (STAFF[t.staffId] ?? null) : null,
          role: t.role,
          start: isoAt(date, t.startHour),
          end: isoAt(date, t.endHour),
          status: t.staffId ? "scheduled" : "open",
        });
      });
    }
    return out.sort(byStart);
  }
}

export class MockBookingsProvider implements BookingsProvider {
  readonly name = "mock";

  async listBookings(range: DateRange, locationId?: string): Promise<Booking[]> {
    const out: Booking[] = [];
    for (const date of eachDate(range)) {
      const wd = weekday(date);
      BOOKING_TEMPLATES.forEach((t, i) => {
        if (!t.days.includes(wd) || (locationId && t.locationId !== locationId)) return;
        out.push({
          id: `bkg-${date}-${i}`,
          locationId: t.locationId,
          product: t.product,
          guests: t.guests,
          start: isoAt(date, t.startHour, t.startMinute),
          end: isoAt(date, t.endHour, t.endMinute),
          status: t.status ?? "confirmed",
        });
      });
    }
    return out.sort(byStart);
  }
}

export class MockCalendarProvider implements CalendarProvider {
  readonly name = "mock";

  async listEvents(range: DateRange): Promise<CalendarEvent[]> {
    const out: CalendarEvent[] = [];
    for (const date of eachDate(range)) {
      const wd = weekday(date);
      EVENT_TEMPLATES.forEach((t, i) => {
        if (!t.days.includes(wd)) return;
        out.push({
          id: `evt-${date}-${i}`,
          title: t.title,
          start: isoAt(date, t.startHour, t.startMinute),
          end: isoAt(date, t.endHour, t.endMinute),
          locationId: t.locationId,
          organizer: t.organizer,
        });
      });
    }
    return out.sort(byStart);
  }
}
