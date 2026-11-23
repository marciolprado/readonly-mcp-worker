import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { post } from "./helpers";

const PING = { jsonrpc: "2.0", id: 1, method: "ping" };
const env = { MCP_AUTH_TOKEN: "s3cret-token" };

describe("bearer auth", () => {
  it("is open when MCP_AUTH_TOKEN is not set", async () => {
    expect((await post(PING)).status).toBe(200);
  });

  it("is open when MCP_AUTH_TOKEN is empty", async () => {
    expect((await post(PING, { env: { MCP_AUTH_TOKEN: "  " } })).status).toBe(200);
  });

  it("rejects requests without a token", async () => {
    const res = await post(PING, { env });
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("Bearer");
    const body: any = await res.json();
    expect(body.error.message).toBe("Unauthorized");
  });

  it("rejects a wrong token", async () => {
    const res = await post(PING, { env, headers: { Authorization: "Bearer wrong" } });
    expect(res.status).toBe(401);
  });

  it("rejects a non-bearer scheme", async () => {
    const res = await post(PING, { env, headers: { Authorization: "Basic czNjcmV0LXRva2Vu" } });
    expect(res.status).toBe(401);
  });

  it("rejects a token that is a prefix of the real one", async () => {
    const res = await post(PING, { env, headers: { Authorization: "Bearer s3cret" } });
    expect(res.status).toBe(401);
  });

  it("accepts the correct token", async () => {
    const res = await post(PING, { env, headers: { Authorization: "Bearer s3cret-token" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
  });

  it("checks auth before parsing the body", async () => {
    const res = await post(null, { env, raw: "{broken" });
    expect(res.status).toBe(401);
  });

  it("health endpoint reports bearer mode without requiring the token", async () => {
    const res = await worker.fetch(new Request("http://localhost/health"), env);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).auth).toBe("bearer");
  });
});
