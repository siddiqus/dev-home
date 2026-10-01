import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

/** Convert a node:http request into a web Request (for proxy/core handle()). */
export function toWebRequest(req: IncomingMessage, origin: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = req.method || "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(new URL(req.url || "/", origin), {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // Required by Node's fetch when streaming a request body.
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);
}

/** Write a web Response to a node:http response. */
export async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  // Stop pulling from upstream if the client goes away.
  const onClose = () => void reader.cancel().catch(() => {});
  res.on("close", onClose);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (res.destroyed) return;
      if (!res.write(value)) {
        await new Promise<void>((resolve) => {
          const settle = () => {
            res.off("drain", settle);
            res.off("close", settle);
            resolve();
          };
          res.on("drain", settle);
          res.on("close", settle);
        });
      }
    }
    res.end();
  } finally {
    res.off("close", onClose);
  }
}
