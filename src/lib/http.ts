import { UpstreamError } from "./errors";

export interface ReadOnlyFetchOptions {
  headers?: Record<string, string>;
  query?: Record<string, string | undefined>;
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * The only HTTP helper real providers are allowed to use. It always issues a
 * GET with no body, so a provider cannot mutate upstream data through it.
 */
export async function readOnlyFetch<T = unknown>(
  baseUrl: string,
  path: string,
  opts: ReadOnlyFetchOptions = {},
): Promise<T> {
  const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json", ...opts.headers },
  });
  if (!res.ok) {
    throw new UpstreamError(`GET ${url.pathname} failed with HTTP ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}
