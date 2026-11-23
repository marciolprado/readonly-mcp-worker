/**
 * Cloudflare Worker entry point: MCP over Streamable HTTP (stateless, JSON responses).
 *
 *   POST /mcp       JSON-RPC 2.0 request, notification or batch
 *   GET  /mcp       405 (this server does not open server-initiated SSE streams)
 *   OPTIONS /mcp    CORS preflight
 *   GET  /, /health Server info (no data)
 */
import { isAuthorized } from "./auth";
import type { Env } from "./env";
import {
  ErrorCode,
  SERVER_INFO,
  SUPPORTED_PROTOCOL_VERSIONS,
  errorResponse,
  handleJsonRpc,
} from "./mcp/protocol";
import { lazyProviders } from "./providers";

const MAX_BODY_BYTES = 1_000_000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

function rpcHttpError(status: number, code: number, message: string, extra: Record<string, string> = {}): Response {
  return json(errorResponse(null, code, message), status, extra);
}

function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  const list = env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  if (!origin || list.length === 0) return true;
  return list.includes(origin);
}

function withCors(response: Response, request: Request): Response {
  const origin = request.headers.get("Origin");
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  headers.set("Access-Control-Allow-Origin", origin ?? "*");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, headers });
}

async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") {
    return rpcHttpError(405, ErrorCode.InvalidRequest, "Method not allowed. Use POST.", { Allow: "POST, OPTIONS" });
  }
  if (!(await isAuthorized(request, env))) {
    return rpcHttpError(401, ErrorCode.InvalidRequest, "Unauthorized", { "WWW-Authenticate": 'Bearer realm="mcp"' });
  }

  const version = request.headers.get("MCP-Protocol-Version");
  if (version && !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
    return rpcHttpError(400, ErrorCode.InvalidRequest, `Unsupported MCP-Protocol-Version: ${version}`);
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return rpcHttpError(415, ErrorCode.InvalidRequest, "Content-Type must be application/json");
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return rpcHttpError(413, ErrorCode.InvalidRequest, "Request body too large");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return rpcHttpError(400, ErrorCode.ParseError, "Parse error: body is not valid JSON");
  }

  const result = await handleJsonRpc(payload, lazyProviders(env));
  if (result === null) return new Response(null, { status: 202 });
  return json(result);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/mcp") {
      if (!originAllowed(request, env)) {
        return rpcHttpError(403, ErrorCode.InvalidRequest, "Origin not allowed");
      }
      return withCors(await handleMcp(request, env), request);
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({
        ...SERVER_INFO,
        status: "ok",
        mcp_endpoint: "/mcp",
        read_only: true,
        auth: env.MCP_AUTH_TOKEN?.trim() ? "bearer" : "none",
      });
    }

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
