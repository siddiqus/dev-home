import { toApiError } from "./errors";

export interface RequestConfig {
  params?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Statuses that resolve instead of reject. Default: 2xx. */
  validateStatus?: (status: number) => boolean;
}

export interface HttpResponse<T = any> {
  data: T;
  status: number;
  /** Response headers, keys lower-cased. */
  headers: Record<string, string>;
}

export interface HttpClient {
  get<T = any>(url: string, config?: RequestConfig): Promise<HttpResponse<T>>;
  post<T = any>(url: string, data?: unknown, config?: RequestConfig): Promise<HttpResponse<T>>;
}

/**
 * Minimal fetch wrapper. Absolute URLs bypass `baseURL`; null/undefined params
 * are dropped; JSON bodies are parsed (text otherwise). Every failure, HTTP or
 * network, rejects with an ApiError via toApiError.
 */
export async function request<T = any>(
  method: string,
  url: string,
  { params, headers, signal, validateStatus, data }: RequestConfig & { data?: unknown } = {},
): Promise<HttpResponse<T>> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null) query.append(k, String(v));
  }
  const qs = query.toString();
  const fullUrl = qs ? `${url}${url.includes("?") ? "&" : "?"}${qs}` : url;
  const hasBody = data !== undefined;
  const reqHeaders: Record<string, string> = {
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    ...headers,
  };

  let status: number;
  let body: any;
  let resHeaders: Record<string, string>;
  try {
    const res = await fetch(fullUrl, {
      method: method.toUpperCase(),
      headers: reqHeaders,
      body: hasBody ? JSON.stringify(data) : undefined,
      signal,
    });
    status = res.status;
    resHeaders = Object.fromEntries(res.headers.entries());
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : "";
    } catch {
      body = text;
    }
  } catch (err) {
    throw toApiError(err);
  }
  const ok = validateStatus ? validateStatus(status) : status >= 200 && status < 300;
  if (!ok) {
    throw toApiError({
      response: { status, data: body },
      message: `Request failed with status code ${status}`,
    });
  }
  return { data: body as T, status, headers: resHeaders };
}

/** A client bound to a base URL and default headers (per-call headers win). */
export function createClient(baseURL: string, defaultHeaders: Record<string, string>): HttpClient {
  const resolve = (url: string) => (/^https?:\/\//i.test(url) ? url : `${baseURL}${url}`);
  const merge = (config: RequestConfig = {}) => ({
    ...config,
    headers: { ...defaultHeaders, ...config.headers },
  });
  return {
    get: (url, config) => request("get", resolve(url), merge(config)),
    post: (url, data, config) => request("post", resolve(url), { ...merge(config), data }),
  };
}
