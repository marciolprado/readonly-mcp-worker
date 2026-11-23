/**
 * Deterministic seed data for the mock providers. All names and businesses are
 * fictional. Data is expressed as weekly templates (by UTC weekday) so any date
 * returns a stable, predictable result. Times are whole UTC hours.
 *
 * Weekday numbers: 0 = Sunday, 1 = Monday ... 6 = Saturday.
 */
import type { Location } from "../types";

export const LOCATIONS: Location[] = [
  { id: "loc-downtown", name: "Downtown Arcade", openHour: 10, closeHour: 22, guestsPerStaff: 10, minStaff: 2 },
  { id: "loc-riverside", name: "Riverside Trampoline Park", openHour: 9, closeHour: 20, guestsPerStaff: 8, minStaff: 2 },
];

export const STAFF: Record<string, string> = {
  "stf-ana": "Ana Silva",
  "stf-ben": "Ben Okafor",
  "stf-cara": "Cara Novak",
  "stf-dev": "Dev Patel",
  "stf-eli": "Eli Brooks",
  "stf-fay": "Fay Moreau",
  "stf-gus": "Gus Lindqvist",
  "stf-hana": "Hana Sato",
};

export interface ShiftTemplate {
  locationId: string;
  days: number[];
  /** null = open shift (published, nobody assigned). */
  staffId: string | null;
  role: string;
  startHour: number;
  endHour: number;
}

const WEEKDAYS = [1, 2, 3, 4, 5];
const MON_THU = [1, 2, 3, 4];
const WEEKEND = [0, 6];

export const SHIFT_TEMPLATES: ShiftTemplate[] = [
  // Downtown Arcade, Mon-Fri
  { locationId: "loc-downtown", days: WEEKDAYS, staffId: "stf-ana", role: "Host", startHour: 10, endHour: 16 },
  { locationId: "loc-downtown", days: WEEKDAYS, staffId: "stf-ben", role: "Technician", startHour: 10, endHour: 18 },
  { locationId: "loc-downtown", days: WEEKDAYS, staffId: "stf-cara", role: "Host", startHour: 16, endHour: 22 },
  { locationId: "loc-downtown", days: WEEKDAYS, staffId: "stf-dev", role: "Technician", startHour: 18, endHour: 22 },
  // Downtown Arcade, weekend
  { locationId: "loc-downtown", days: WEEKEND, staffId: "stf-ana", role: "Host", startHour: 10, endHour: 16 },
  { locationId: "loc-downtown", days: WEEKEND, staffId: "stf-ben", role: "Technician", startHour: 10, endHour: 18 },
  { locationId: "loc-downtown", days: WEEKEND, staffId: "stf-cara", role: "Host", startHour: 14, endHour: 22 },
  { locationId: "loc-downtown", days: WEEKEND, staffId: "stf-dev", role: "Technician", startHour: 16, endHour: 22 },
  { locationId: "loc-downtown", days: [6], staffId: null, role: "Party Host", startHour: 12, endHour: 18 },
  // Riverside Trampoline Park, Mon-Fri (no late cover on Fridays)
  { locationId: "loc-riverside", days: WEEKDAYS, staffId: "stf-eli", role: "Coach", startHour: 9, endHour: 15 },
  { locationId: "loc-riverside", days: WEEKDAYS, staffId: "stf-fay", role: "Coach", startHour: 9, endHour: 17 },
  { locationId: "loc-riverside", days: WEEKDAYS, staffId: "stf-gus", role: "Coach", startHour: 14, endHour: 20 },
  { locationId: "loc-riverside", days: MON_THU, staffId: "stf-hana", role: "Coach", startHour: 15, endHour: 20 },
  // Riverside Trampoline Park, weekend
  { locationId: "loc-riverside", days: WEEKEND, staffId: "stf-eli", role: "Coach", startHour: 9, endHour: 15 },
  { locationId: "loc-riverside", days: WEEKEND, staffId: "stf-fay", role: "Coach", startHour: 9, endHour: 17 },
  { locationId: "loc-riverside", days: WEEKEND, staffId: "stf-gus", role: "Coach", startHour: 12, endHour: 20 },
  { locationId: "loc-riverside", days: WEEKEND, staffId: "stf-hana", role: "Coach", startHour: 14, endHour: 20 },
];

export interface BookingTemplate {
  locationId: string;
  days: number[];
  product: string;
  guests: number;
  startHour: number;
  startMinute?: number;
  endHour: number;
  endMinute?: number;
  status?: "confirmed" | "cancelled";
}

export const BOOKING_TEMPLATES: BookingTemplate[] = [
  // Downtown Arcade
  { locationId: "loc-downtown", days: WEEKDAYS, product: "Walk-in Group", guests: 8, startHour: 12, endHour: 13 },
  { locationId: "loc-downtown", days: WEEKDAYS, product: "Arcade Party Package", guests: 18, startHour: 17, endHour: 19 },
  { locationId: "loc-downtown", days: [5], product: "Corporate Night", guests: 35, startHour: 19, endHour: 21 },
  { locationId: "loc-downtown", days: [5], product: "School Trip", guests: 50, startHour: 14, endHour: 15, status: "cancelled" },
  { locationId: "loc-downtown", days: WEEKEND, product: "Birthday Party", guests: 24, startHour: 11, endHour: 13 },
  { locationId: "loc-downtown", days: WEEKEND, product: "Birthday Party", guests: 20, startHour: 15, endHour: 17 },
  // Riverside Trampoline Park
  { locationId: "loc-riverside", days: WEEKDAYS, product: "School Group", guests: 16, startHour: 10, endHour: 11, endMinute: 30 },
  { locationId: "loc-riverside", days: WEEKDAYS, product: "Open Jump", guests: 12, startHour: 16, endHour: 17 },
  { locationId: "loc-riverside", days: [6], product: "Mega Party", guests: 40, startHour: 14, endHour: 16 },
  { locationId: "loc-riverside", days: [0], product: "Family Jump", guests: 14, startHour: 10, endHour: 12 },
];

export interface EventTemplate {
  days: number[];
  title: string;
  locationId: string | null;
  organizer: string;
  startHour: number;
  startMinute?: number;
  endHour: number;
  endMinute?: number;
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  { days: WEEKDAYS, title: "Ops stand-up", locationId: null, organizer: "ops@example.com", startHour: 8, startMinute: 30, endHour: 9 },
  { days: [2], title: "Equipment maintenance", locationId: "loc-riverside", organizer: "facilities@example.com", startHour: 7, endHour: 9 },
  { days: [5], title: "Weekly staffing review", locationId: null, organizer: "ops@example.com", startHour: 13, endHour: 14 },
  { days: [6], title: "Fire safety walk-through", locationId: "loc-downtown", organizer: "safety@example.com", startHour: 8, endHour: 8, endMinute: 30 },
];
