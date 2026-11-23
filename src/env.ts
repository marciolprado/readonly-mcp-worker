/** Worker bindings. Every value is optional so the server runs with zero config (mock mode). */
export interface Env {
  /** If set, /mcp requires `Authorization: Bearer <MCP_AUTH_TOKEN>`. */
  MCP_AUTH_TOKEN?: string;
  /**
   * Optional comma-separated list of browser origins allowed to call /mcp.
   * Requests without an Origin header (CLI tools, server-side clients) are unaffected.
   */
  ALLOWED_ORIGINS?: string;

  SHIFTS_PROVIDER?: string; // "mock" (default) | "connecteam"
  BOOKINGS_PROVIDER?: string; // "mock" (default) | "roller"
  CALENDAR_PROVIDER?: string; // "mock" (default) | "msgraph"

  CONNECTEAM_BASE_URL?: string;
  CONNECTEAM_API_KEY?: string;
  ROLLER_BASE_URL?: string;
  ROLLER_API_TOKEN?: string;
  MSGRAPH_BASE_URL?: string;
  MSGRAPH_ACCESS_TOKEN?: string;
  MSGRAPH_CALENDAR_USER?: string;
}
