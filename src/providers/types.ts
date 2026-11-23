/**
 * Provider contracts. Every method is a read: providers must never create,
 * update or delete anything upstream. Real implementations must use
 * `readOnlyFetch` (src/lib/http.ts), which only allows GET requests.
 *
 * All timestamps are ISO 8601 strings in UTC (e.g. "2026-12-05T14:00:00Z").
 * Date ranges are inclusive calendar dates in UTC: { start: "2026-12-01", end: "2026-12-07" }.
 */

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD, inclusive
}

export interface Location {
  id: string;
  name: string;
  /** Opening hour (UTC, 0-23) used to build daily summary slots. */
  openHour: number;
  /** Closing hour (UTC, 1-24), exclusive. */
  closeHour: number;
  /** Staffing rule: one staff member per N guests on site. */
  guestsPerStaff: number;
  /** Minimum staff on site while open, regardless of bookings. */
  minStaff: number;
}

export interface Shift {
  id: string;
  locationId: string;
  /** Null when the shift is open (published but nobody assigned). */
  staffId: string | null;
  staffName: string | null;
  role: string;
  start: string;
  end: string;
  status: "scheduled" | "open";
}

export interface Booking {
  id: string;
  locationId: string;
  product: string;
  guests: number;
  start: string;
  end: string;
  status: "confirmed" | "cancelled";
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  /** Location id when the event relates to a site, otherwise null. */
  locationId: string | null;
  organizer: string;
}

export interface ShiftsProvider {
  readonly name: string;
  listLocations(): Promise<Location[]>;
  listShifts(range: DateRange, locationId?: string): Promise<Shift[]>;
}

export interface BookingsProvider {
  readonly name: string;
  listBookings(range: DateRange, locationId?: string): Promise<Booking[]>;
}

export interface CalendarProvider {
  readonly name: string;
  listEvents(range: DateRange): Promise<CalendarEvent[]>;
}

export interface Providers {
  shifts: ShiftsProvider;
  bookings: BookingsProvider;
  calendar: CalendarProvider;
}
