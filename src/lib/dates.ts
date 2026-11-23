import { ValidationError } from "./errors";
import type { DateRange } from "../providers/types";

export const MAX_RANGE_DAYS = 31;
const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses a YYYY-MM-DD string as UTC midnight, rejecting impossible dates like 2026-02-30. */
export function parseDate(value: string, field = "date"): Date {
  if (!DATE_RE.test(value)) {
    throw new ValidationError(`${field} must be a date in YYYY-MM-DD format`);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`${field} is not a valid calendar date: ${value}`);
  }
  return d;
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return formatDate(new Date(parseDate(date).getTime() + days * DAY_MS));
}

/** Validates an inclusive range: end >= start and at most MAX_RANGE_DAYS days long. */
export function validateRange(start: string, end: string): DateRange {
  const s = parseDate(start, "start_date");
  const e = parseDate(end, "end_date");
  if (e < s) throw new ValidationError("end_date must be on or after start_date");
  const days = (e.getTime() - s.getTime()) / DAY_MS + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new ValidationError(`date range is ${days} days; the maximum is ${MAX_RANGE_DAYS}`);
  }
  return { start, end };
}

/** Lists every date in an inclusive range. */
export function eachDate(range: DateRange): string[] {
  const out: string[] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Half-open [start, end) instants for an inclusive date range. */
export function rangeBounds(range: DateRange): { from: number; to: number } {
  return {
    from: parseDate(range.start).getTime(),
    to: parseDate(range.end).getTime() + DAY_MS,
  };
}

/** True when [aStart, aEnd) overlaps [bStart, bEnd). */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** True when an item with ISO start/end overlaps the date range. */
export function inRange(item: { start: string; end: string }, range: DateRange): boolean {
  const { from, to } = rangeBounds(range);
  return overlaps(Date.parse(item.start), Date.parse(item.end), from, to);
}

/** 0 = Sunday ... 6 = Saturday, in UTC. */
export function weekday(date: string): number {
  return parseDate(date).getUTCDay();
}

export function isoAt(date: string, hour: number, minute = 0): string {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  if (hour === 24) return `${addDays(date, 1)}T00:${mm}:00Z`;
  return `${date}T${hh}:${mm}:00Z`;
}
