/**
 * Minimal, hand-written MCP server core (JSON-RPC 2.0). Transport-agnostic:
 * takes a parsed JSON value, returns the JSON-RPC response(s) or null when the
 * message was only notifications.
 *
 * Implemented methods: initialize, ping, tools/list, tools/call,
 * notifications/initialized (and any other notification, which is ignored).
 */
import { ProviderConfigError, ProviderNotWiredError, UpstreamError, ValidationError } from "../lib/errors";
import type { Providers } from "../providers/types";
import { TOOLS, TOOLS_BY_NAME } from "../tools";
import { validateArgs } from "./schema";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];
export const SERVER_INFO = { name: "readonly-mcp-worker", title: "Read-only Ops MCP", version: "0.1.0" };

export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

export type JsonRpcId = string | number | null;

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

export function errorResponse(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

/** Handles a single message or a batch. Returns null when nothing needs a reply. */
export async function handleJsonRpc(
  payload: unknown,
  providers: Providers,
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) return errorResponse(null, ErrorCode.InvalidRequest, "Empty batch");
    const results = await Promise.all(payload.map((m) => handleMessage(m, providers)));
    const replies = results.filter((r): r is JsonRpcResponse => r !== null);
    return replies.length > 0 ? replies : null;
  }
  return handleMessage(payload, providers);
}

function isValidId(id: unknown): id is string | number {
  return typeof id === "string" || (typeof id === "number" && Number.isFinite(id));
}

async function handleMessage(msg: unknown, providers: Providers): Promise<JsonRpcResponse | null> {
  if (typeof msg !== "object" || msg === null || Array.isArray(msg)) {
    return errorResponse(null, ErrorCode.InvalidRequest, "Request must be a JSON object");
  }
  const m = msg as Record<string, unknown>;
  const hasId = "id" in m;
  const id: JsonRpcId = isValidId(m.id) ? m.id : null;

  if (m.jsonrpc !== "2.0") {
    return errorResponse(id, ErrorCode.InvalidRequest, 'jsonrpc must be "2.0"');
  }
  if (typeof m.method !== "string") {
    // A response object sent by the client (we never send requests) is ignored.
    if (!("method" in m) && ("result" in m || "error" in m)) return null;
    return errorResponse(id, ErrorCode.InvalidRequest, "method must be a string");
  }
  if (hasId && !isValidId(m.id)) {
    return errorResponse(null, ErrorCode.InvalidRequest, "id must be a string or number");
  }
  if (m.params !== undefined && (typeof m.params !== "object" || m.params === null)) {
    return errorResponse(id, ErrorCode.InvalidRequest, "params must be an object or array");
  }

  // Notifications (no id) never get a response.
  if (!hasId) return null;

  try {
    const result = await dispatch(m.method, (m.params ?? {}) as Record<string, unknown>, providers);
    return { jsonrpc: "2.0", id, result };
  } catch (err) {
    if (err instanceof RpcError) return errorResponse(id, err.code, err.message, err.data);
    console.error("Unhandled error in", m.method, err);
    return errorResponse(id, ErrorCode.InternalError, "Internal error");
  }
}

async function dispatch(method: string, params: Record<string, unknown>, providers: Providers): Promise<unknown> {
  switch (method) {
    case "initialize":
      return initialize(params);
    case "ping":
      return {};
    case "tools/list":
      return {
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
          name,
          title,
          description,
          inputSchema,
          annotations,
        })),
      };
    case "tools/call":
      return callTool(params, providers);
    default:
      throw new RpcError(ErrorCode.MethodNotFound, `Method not found: ${method}`);
  }
}

function initialize(params: Record<string, unknown>) {
  const requested = params.protocolVersion;
  if (typeof requested !== "string") {
    throw new RpcError(ErrorCode.InvalidParams, "protocolVersion is required");
  }
  const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
  return {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
    instructions:
      "Read-only operational data (locations, shifts, bookings, calendar). All times are UTC. " +
      "Start with list_locations or get_daily_summary. No tool can modify data.",
  };
}

async function callTool(params: Record<string, unknown>, providers: Providers) {
  const name = params.name;
  if (typeof name !== "string") throw new RpcError(ErrorCode.InvalidParams, "params.name must be a string");
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) throw new RpcError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);

  try {
    const args = validateArgs(tool.inputSchema, params.arguments);
    const data = await tool.run(args, providers);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
      isError: false,
    };
  } catch (err) {
    // Tool execution errors are returned as results so the model can read and self-correct.
    return {
      content: [{ type: "text", text: toolErrorMessage(err) }],
      isError: true,
    };
  }
}

function toolErrorMessage(err: unknown): string {
  if (err instanceof ValidationError) return `Invalid arguments: ${err.message}`;
  if (err instanceof ProviderConfigError) return `Provider configuration error: ${err.message}`;
  if (err instanceof ProviderNotWiredError) return `Provider not available: ${err.message}`;
  if (err instanceof UpstreamError) return `Upstream API error: ${err.message}`;
  console.error("Unexpected tool error", err);
  return "Unexpected error while running the tool";
}
