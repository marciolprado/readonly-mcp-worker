import worker from "../src/index";
import type { Env } from "../src/env";

export const BASE = "http://localhost/mcp";

export async function post(
  body: unknown,
  opts: { env?: Env; headers?: Record<string, string>; raw?: string } = {},
): Promise<Response> {
  const request = new Request(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...opts.headers },
    body: opts.raw ?? JSON.stringify(body),
  });
  return worker.fetch(request, opts.env ?? {});
}

let nextId = 1;

/** Sends one JSON-RPC request and returns the parsed response object. */
export async function rpc(method: string, params?: unknown, env?: Env): Promise<any> {
  const res = await post({ jsonrpc: "2.0", id: nextId++, method, params }, { env });
  return res.json();
}

/** Calls a tool and returns { isError, data, text }. */
export async function callTool(name: string, args?: unknown, env?: Env) {
  const res = await rpc("tools/call", { name, arguments: args }, env);
  if (res.error) throw new Error(`JSON-RPC error: ${JSON.stringify(res.error)}`);
  const text: string = res.result.content[0].text;
  return { isError: res.result.isError as boolean, data: res.result.structuredContent as any, text };
}
