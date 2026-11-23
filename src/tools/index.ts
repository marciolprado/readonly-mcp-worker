/**
 * MCP tool definitions. Every tool is read-only: it only calls provider list/get
 * methods and never mutates state. Each tool advertises readOnlyHint: true.
 */
import { validateRange, parseDate } from "../lib/dates";
import { ValidationError } from "../lib/errors";
import { buildDailySummary } from "../lib/summary";
import type { ObjectSchema } from "../mcp/schema";
import type { Booking, CalendarEvent, Providers, Shift } from "../providers/types";

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: ObjectSchema;
  annotations: {
    readOnlyHint: true;
    destructiveHint: false;
    idempotentHint: true;
    openWorldHint: boolean;
  };
  run(args: Record<string, unknown>, providers: Providers): Promise<unknown>;
}

const DATE = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", format: "date" } as const;
const LOCATION_ID = {
  type: "string",
  maxLength: 64,
  description: "Optional location id (see list_locations). Omit for all locations.",
} as const;
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const rangeSchema = (extra: ObjectSchema["properties"] = {}): ObjectSchema => ({
  type: "object",
  properties: {
    start_date: { ...DATE, description: "First day, YYYY-MM-DD (UTC)." },
    end_date: { ...DATE, description: "Last day, inclusive, YYYY-MM-DD (UTC). Max 31-day range." },
    ...extra,
  },
  required: ["start_date", "end_date"],
  additionalProperties: false,
});

async function checkLocation(providers: Providers, locationId: unknown): Promise<string | undefined> {
  if (locationId === undefined) return undefined;
  const id = String(locationId);
  const locations = await providers.shifts.listLocations();
  if (!locations.some((l) => l.id === id)) {
    throw new ValidationError(
      `unknown location_id "${id}". Valid ids: ${locations.map((l) => l.id).join(", ")}`,
    );
  }
  return id;
}

const shiftOut = (s: Shift) => ({
  id: s.id,
  location_id: s.locationId,
  staff_id: s.staffId,
  staff_name: s.staffName,
  role: s.role,
  start: s.start,
  end: s.end,
  status: s.status,
});

const bookingOut = (b: Booking) => ({
  id: b.id,
  location_id: b.locationId,
  product: b.product,
  guests: b.guests,
  start: b.start,
  end: b.end,
  status: b.status,
});

const eventOut = (e: CalendarEvent) => ({
  id: e.id,
  title: e.title,
  start: e.start,
  end: e.end,
  location_id: e.locationId,
  organizer: e.organizer,
});

export const TOOLS: ToolDefinition[] = [
  {
    name: "list_locations",
    title: "List locations",
    description:
      "List the business locations (sites) with opening hours and staffing rules. Use the ids with other tools.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ_ONLY,
    async run(_args, providers) {
      const locations = await providers.shifts.listLocations();
      return {
        locations: locations.map((l) => ({
          id: l.id,
          name: l.name,
          open_hour_utc: l.openHour,
          close_hour_utc: l.closeHour,
          guests_per_staff: l.guestsPerStaff,
          min_staff: l.minStaff,
        })),
      };
    },
  },
  {
    name: "list_shifts",
    title: "List shifts",
    description:
      "List scheduled and open (unassigned) staff shifts in a date range, optionally for one location. Read-only.",
    inputSchema: rangeSchema({ location_id: LOCATION_ID }),
    annotations: READ_ONLY,
    async run(args, providers) {
      const range = validateRange(String(args.start_date), String(args.end_date));
      const locationId = await checkLocation(providers, args.location_id);
      const shifts = await providers.shifts.listShifts(range, locationId);
      return { range, count: shifts.length, shifts: shifts.map(shiftOut) };
    },
  },
  {
    name: "list_bookings",
    title: "List bookings",
    description:
      "List customer bookings (tickets, parties, groups) in a date range, optionally for one location. Includes cancelled bookings with status 'cancelled'. Read-only.",
    inputSchema: rangeSchema({ location_id: LOCATION_ID }),
    annotations: READ_ONLY,
    async run(args, providers) {
      const range = validateRange(String(args.start_date), String(args.end_date));
      const locationId = await checkLocation(providers, args.location_id);
      const bookings = await providers.bookings.listBookings(range, locationId);
      const guests = bookings
        .filter((b) => b.status === "confirmed")
        .reduce((sum, b) => sum + b.guests, 0);
      return { range, count: bookings.length, confirmed_guests: guests, bookings: bookings.map(bookingOut) };
    },
  },
  {
    name: "list_calendar_events",
    title: "List calendar events",
    description:
      "List operational calendar events (meetings, maintenance, inspections) in a date range. Read-only.",
    inputSchema: rangeSchema(),
    annotations: READ_ONLY,
    async run(args, providers) {
      const range = validateRange(String(args.start_date), String(args.end_date));
      const events = await providers.calendar.listEvents(range);
      return { range, count: events.length, events: events.map(eventOut) };
    },
  },
  {
    name: "get_daily_summary",
    title: "Daily staffing summary",
    description:
      "Aggregate one day: hourly staff on shift vs. guests booked per location, flagging understaffed slots " +
      "(staff < max(min_staff, ceil(guests / guests_per_staff))), open shifts, and that day's calendar events. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        date: { ...DATE, description: "Day to summarize, YYYY-MM-DD (UTC)." },
        location_id: LOCATION_ID,
      },
      required: ["date"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, providers) {
      const date = String(args.date);
      parseDate(date, "date");
      const locationId = await checkLocation(providers, args.location_id);
      const range = { start: date, end: date };
      const [locations, shifts, bookings, events] = await Promise.all([
        providers.shifts.listLocations(),
        providers.shifts.listShifts(range, locationId),
        providers.bookings.listBookings(range, locationId),
        providers.calendar.listEvents(range),
      ]);
      const selected = locationId ? locations.filter((l) => l.id === locationId) : locations;
      const relevantEvents = locationId
        ? events.filter((e) => e.locationId === null || e.locationId === locationId)
        : events;
      const summary = buildDailySummary(date, selected, shifts, bookings, relevantEvents);
      return { ...summary, calendar_events: summary.calendar_events.map(eventOut) };
    },
  },
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
