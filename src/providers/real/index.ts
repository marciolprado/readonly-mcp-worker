/**
 * Real provider SKELETONS. NOT WIRED YET.
 *
 * Each class validates its configuration (base URL + credential) in the
 * constructor and throws ProviderConfigError if anything is missing. The data
 * methods throw ProviderNotWiredError: the upstream API calls and the mapping to
 * our domain types have not been implemented or tested against a real account.
 *
 * To wire one up: call `readOnlyFetch` (GET only) with the vendor's documented
 * endpoint, map the response to the types in ../types.ts (normalize times to
 * UTC ISO strings), and add tests with recorded fixtures. See README.
 */
import type { Env } from "../../env";
import { ProviderConfigError, ProviderNotWiredError } from "../../lib/errors";
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

function requireVars(provider: string, env: Env, keys: (keyof Env)[]): Record<string, string> {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new ProviderConfigError(
      `${provider} provider selected but missing config: ${missing.join(", ")}. ` +
        `Set them in .dev.vars (local) or as Worker secrets, or switch back to the mock provider.`,
    );
  }
  for (const k of keys) {
    if (k.endsWith("_BASE_URL")) {
      try {
        const u = new URL(env[k] as string);
        if (u.protocol !== "https:") throw new Error("not https");
      } catch {
        throw new ProviderConfigError(`${provider}: ${k} must be a valid https:// URL`);
      }
    }
  }
  return Object.fromEntries(keys.map((k) => [k, env[k] as string]));
}

function notWired(provider: string, method: string): never {
  throw new ProviderNotWiredError(
    `${provider} provider is a skeleton and is not wired yet (${method}). ` +
      `Implement it in src/providers/real/index.ts or use the mock provider.`,
  );
}

/** Workforce/scheduling API (e.g. Connecteam). Not wired. */
export class ConnecteamShiftsProvider implements ShiftsProvider {
  readonly name = "connecteam";
  readonly config: Record<string, string>;
  constructor(env: Env) {
    this.config = requireVars("connecteam", env, ["CONNECTEAM_BASE_URL", "CONNECTEAM_API_KEY"]);
  }
  async listLocations(): Promise<Location[]> {
    return notWired(this.name, "listLocations");
  }
  async listShifts(_range: DateRange, _locationId?: string): Promise<Shift[]> {
    return notWired(this.name, "listShifts");
  }
}

/** Ticketing/booking API (e.g. Roller). Not wired. */
export class RollerBookingsProvider implements BookingsProvider {
  readonly name = "roller";
  readonly config: Record<string, string>;
  constructor(env: Env) {
    this.config = requireVars("roller", env, ["ROLLER_BASE_URL", "ROLLER_API_TOKEN"]);
  }
  async listBookings(_range: DateRange, _locationId?: string): Promise<Booking[]> {
    return notWired(this.name, "listBookings");
  }
}

/** Microsoft Graph calendar (read-only calendarView). Not wired. */
export class GraphCalendarProvider implements CalendarProvider {
  readonly name = "msgraph";
  readonly config: Record<string, string>;
  constructor(env: Env) {
    this.config = requireVars("msgraph", env, [
      "MSGRAPH_BASE_URL",
      "MSGRAPH_ACCESS_TOKEN",
      "MSGRAPH_CALENDAR_USER",
    ]);
  }
  async listEvents(_range: DateRange): Promise<CalendarEvent[]> {
    return notWired(this.name, "listEvents");
  }
}
