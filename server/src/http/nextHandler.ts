import { configFromHeaders, runWithConfig } from "../config";
import { toErrorResponse } from "../utils/errors";

export interface ApiRequest {
  query: Record<string, string | undefined>;
  params: Record<string, string>;
  body: any;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => unknown | Promise<unknown>;

/**
 * Adapts an Express-style handler to a Next.js route handler. Credentials from
 * the request headers are bound to the async context so getConfig() works in
 * the existing clients.
 */
export function nextHandler(handler: ApiHandler) {
  return async (
    request: Request,
    ctx: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const url = new URL(request.url);
    const params = (await ctx?.params) ?? {};

    const config = configFromHeaders((name) => request.headers.get(name));

    try {
      let body: any = undefined;
      if (request.method !== "GET" && request.method !== "HEAD") {
        const text = await request.text();
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            return Response.json({ error: "Invalid JSON body" }, { status: 400 });
          }
        } else {
          body = {};
        }
      }

      let status = 200;
      let payload: unknown = null;
      const res: ApiResponse = {
        status(code) {
          status = code;
          return res;
        },
        json(value) {
          payload = value;
        },
      };

      await runWithConfig(config, () =>
        handler({ query: Object.fromEntries(url.searchParams), params, body }, res),
      );
      return Response.json(payload, { status });
    } catch (err) {
      const { status: errStatus, body: errBody } = toErrorResponse(
        err,
        request.method,
        url.pathname,
      );
      return Response.json(errBody, { status: errStatus });
    }
  };
}
