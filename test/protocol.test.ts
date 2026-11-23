import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { BASE, post, rpc } from "./helpers";

describe("MCP protocol over HTTP", () => {
  it("initialize negotiates a supported protocol version and advertises tools", async () => {
    const res = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(res.jsonrpc).toBe("2.0");
    expect(res.result.protocolVersion).toBe("2025-06-18");
    expect(res.result.capabilities.tools).toBeDefined();
    expect(res.result.serverInfo.name).toBe("readonly-mcp-worker");
  });

  it("initialize echoes older supported versions", async () => {
    const res = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {} });
    expect(res.result.protocolVersion).toBe("2024-11-05");
  });

  it("initialize falls back to the latest version for unknown versions", async () => {
    const res = await rpc("initialize", { protocolVersion: "1999-01-01", capabilities: {} });
    expect(res.result.protocolVersion).toBe("2025-06-18");
  });

  it("initialize without protocolVersion is invalid params", async () => {
    const res = await rpc("initialize", {});
    expect(res.error.code).toBe(-32602);
  });

  it("ping returns an empty result", async () => {
    const res = await rpc("ping");
    expect(res.result).toEqual({});
  });

  it("tools/list returns every tool with a schema and read-only annotations", async () => {
    const res = await rpc("tools/list");
    const names = res.result.tools.map((t: any) => t.name);
    expect(names).toEqual([
      "list_locations",
      "list_shifts",
      "list_bookings",
      "list_calendar_events",
      "get_daily_summary",
    ]);
    for (const tool of res.result.tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
      expect(typeof tool.description).toBe("string");
    }
  });

  it("notifications get 202 with no body", async () => {
    const res = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("unknown method returns -32601", async () => {
    const res = await rpc("resources/list");
    expect(res.error.code).toBe(-32601);
  });

  it("unknown tool returns -32602", async () => {
    const res = await rpc("tools/call", { name: "delete_everything", arguments: {} });
    expect(res.error.code).toBe(-32602);
    expect(res.error.message).toMatch(/Unknown tool/);
  });

  it("tools/call without a name returns -32602", async () => {
    const res = await rpc("tools/call", {});
    expect(res.error.code).toBe(-32602);
  });

  it("invalid JSON returns a -32700 parse error with HTTP 400", async () => {
    const res = await post(null, { raw: "{not json" });
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.error.code).toBe(-32700);
    expect(body.id).toBeNull();
  });

  it("wrong jsonrpc version is an invalid request", async () => {
    const res = await post({ jsonrpc: "1.0", id: 1, method: "ping" });
    const body: any = await res.json();
    expect(body.error.code).toBe(-32600);
    expect(body.id).toBe(1);
  });

  it("missing method is an invalid request", async () => {
    const body: any = await (await post({ jsonrpc: "2.0", id: 2 })).json();
    expect(body.error.code).toBe(-32600);
  });

  it("non-object message is an invalid request", async () => {
    const body: any = await (await post(42)).json();
    expect(body.error.code).toBe(-32600);
  });

  it("invalid id type is an invalid request", async () => {
    const body: any = await (await post({ jsonrpc: "2.0", id: { x: 1 }, method: "ping" })).json();
    expect(body.error.code).toBe(-32600);
    expect(body.id).toBeNull();
  });

  it("batches return one response per request and skip notifications", async () => {
    const res = await post([
      { jsonrpc: "2.0", id: "a", method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: "b", method: "nope" },
    ]);
    const body: any[] = (await res.json()) as any[];
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({ jsonrpc: "2.0", id: "a", result: {} });
    expect(body[1].error.code).toBe(-32601);
  });

  it("empty batch is an invalid request", async () => {
    const body: any = await (await post([])).json();
    expect(body.error.code).toBe(-32600);
  });

  it("rejects non-JSON content type with 415", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "ping" }, { headers: { "Content-Type": "text/plain" } });
    expect(res.status).toBe(415);
  });

  it("rejects an unsupported MCP-Protocol-Version header with 400", async () => {
    const res = await post(
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { headers: { "MCP-Protocol-Version": "2000-01-01" } },
    );
    expect(res.status).toBe(400);
  });

  it("accepts a supported MCP-Protocol-Version header", async () => {
    const res = await post(
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { headers: { "MCP-Protocol-Version": "2025-06-18" } },
    );
    expect(res.status).toBe(200);
  });

  it("GET /mcp returns 405 (no SSE stream)", async () => {
    const res = await worker.fetch(new Request(BASE), {});
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toContain("POST");
  });

  it("OPTIONS /mcp answers the CORS preflight", async () => {
    const res = await worker.fetch(
      new Request(BASE, { method: "OPTIONS", headers: { Origin: "https://app.example.com" } }),
      {},
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });

  it("enforces ALLOWED_ORIGINS when configured", async () => {
    const env = { ALLOWED_ORIGINS: "https://good.example.com" };
    const bad = await post({ jsonrpc: "2.0", id: 1, method: "ping" }, { env, headers: { Origin: "https://evil.example.com" } });
    expect(bad.status).toBe(403);
    const good = await post({ jsonrpc: "2.0", id: 1, method: "ping" }, { env, headers: { Origin: "https://good.example.com" } });
    expect(good.status).toBe(200);
  });

  it("GET /health reports status without data", async () => {
    const res = await worker.fetch(new Request("http://localhost/health"), {});
    const body: any = await res.json();
    expect(body.status).toBe("ok");
    expect(body.read_only).toBe(true);
    expect(body.auth).toBe("none");
  });

  it("unknown paths return 404", async () => {
    const res = await worker.fetch(new Request("http://localhost/nope"), {});
    expect(res.status).toBe(404);
  });
});
