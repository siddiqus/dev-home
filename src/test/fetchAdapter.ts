import { afterEach, beforeEach, vi } from "vitest";
import { GITHUB_API } from "../api/http/github";
import { JIRA_PROXY_BASE } from "../api/http/jira";

/** What a test adapter sees for each request (a flat config object, for terse assertions). */
export interface AdapterRequest {
  baseURL: string;
  /** Path relative to `baseURL` (or the full URL when no known base matches). */
  url: string;
  method: string;
  headers: Record<string, string>;
  /** Query params; values are strings, as sent on the wire. */
  params: Record<string, string>;
  /** Raw request body (JSON string) or undefined. */
  data: string | undefined;
  signal?: AbortSignal | null;
}

export interface AdapterResponse {
  data: any;
  status?: number;
  headers?: Record<string, string>;
}

/**
 * Throw `{ response: { status, data } }` from an adapter to answer with that HTTP
 * status; any other throw becomes a network failure (fetch rejection).
 */
export type Adapter = (req: AdapterRequest) => Promise<AdapterResponse>;

const BASES = [
  GITHUB_API,
  `${JIRA_PROXY_BASE}/rest/api/3`,
  `${JIRA_PROXY_BASE}/rest/api/2`,
  `${JIRA_PROXY_BASE}/rest/agile/1.0`,
];

export const httpMock: { adapter: Adapter | undefined } = { adapter: undefined };

function toResponse({ data, status = 200, headers = {} }: AdapterResponse): Response {
  const nullBody = status === 204 || status === 304;
  const body = nullBody || data === undefined ? null : JSON.stringify(data);
  return new Response(body, { status, headers });
}

async function fakeFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const [path, search = ""] = String(input).split("?");
  const baseURL = BASES.find((b) => path.startsWith(b)) ?? "";
  const req: AdapterRequest = {
    baseURL,
    url: path.slice(baseURL.length),
    method: (init.method ?? "GET").toLowerCase(),
    headers: { ...(init.headers as Record<string, string>) },
    params: Object.fromEntries(new URLSearchParams(search)),
    data: init.body as string | undefined,
    signal: init.signal,
  };
  if (!httpMock.adapter) throw new TypeError(`No fetch adapter for ${String(input)}`);
  try {
    return toResponse(await httpMock.adapter(req));
  } catch (err: any) {
    if (err?.response) return toResponse({ status: 500, ...err.response });
    throw err;
  }
}

/** Route global fetch through `httpMock.adapter` for every test in the file. */
export function useFetchAdapter(): void {
  beforeEach(() => {
    httpMock.adapter = undefined;
    vi.stubGlobal("fetch", vi.fn(fakeFetch));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
}
