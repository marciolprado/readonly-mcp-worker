import type { Env } from "./env";

/**
 * Optional bearer auth. If MCP_AUTH_TOKEN is unset or empty, every request is
 * allowed (open mode, intended for local mock data). Otherwise the request must
 * carry `Authorization: Bearer <MCP_AUTH_TOKEN>`.
 */
export async function isAuthorized(request: Request, env: Env): Promise<boolean> {
  const expected = env.MCP_AUTH_TOKEN?.trim();
  if (!expected) return true;
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  return constantTimeEqual(match[1]!.trim(), expected);
}

/** Compares SHA-256 digests byte by byte so timing does not leak the token. */
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}
