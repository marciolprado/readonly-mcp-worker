import type { Env } from "../env";
import { ProviderConfigError } from "../lib/errors";
import { MockBookingsProvider, MockCalendarProvider, MockShiftsProvider } from "./mock";
import { ConnecteamShiftsProvider, GraphCalendarProvider, RollerBookingsProvider } from "./real";
import type { BookingsProvider, CalendarProvider, Providers, ShiftsProvider } from "./types";

function pick<T>(kind: string, value: string | undefined, options: Record<string, () => T>): T {
  const key = (value ?? "mock").trim().toLowerCase() || "mock";
  const factory = options[key];
  if (!factory) {
    throw new ProviderConfigError(
      `Unknown ${kind} provider "${value}". Valid options: ${Object.keys(options).join(", ")}`,
    );
  }
  return factory();
}

export function createShiftsProvider(env: Env): ShiftsProvider {
  return pick<ShiftsProvider>("SHIFTS_PROVIDER", env.SHIFTS_PROVIDER, {
    mock: () => new MockShiftsProvider(),
    connecteam: () => new ConnecteamShiftsProvider(env),
  });
}

export function createBookingsProvider(env: Env): BookingsProvider {
  return pick<BookingsProvider>("BOOKINGS_PROVIDER", env.BOOKINGS_PROVIDER, {
    mock: () => new MockBookingsProvider(),
    roller: () => new RollerBookingsProvider(env),
  });
}

export function createCalendarProvider(env: Env): CalendarProvider {
  return pick<CalendarProvider>("CALENDAR_PROVIDER", env.CALENDAR_PROVIDER, {
    mock: () => new MockCalendarProvider(),
    msgraph: () => new GraphCalendarProvider(env),
  });
}

/**
 * Lazily builds providers so a misconfigured provider only fails the tools
 * that use it (e.g. a broken calendar config does not break list_shifts).
 */
export function lazyProviders(env: Env): Providers {
  let shifts: ShiftsProvider | undefined;
  let bookings: BookingsProvider | undefined;
  let calendar: CalendarProvider | undefined;
  return {
    get shifts() {
      return (shifts ??= createShiftsProvider(env));
    },
    get bookings() {
      return (bookings ??= createBookingsProvider(env));
    },
    get calendar() {
      return (calendar ??= createCalendarProvider(env));
    },
  };
}
