/**
 * Map a thrown error to an HTTP response. Upstream (axios) statuses pass
 * through; 5xx details are hidden from the client. Never logs request headers.
 */
export function toErrorResponse(
  err: any,
  method: string,
  path: string,
): { status: number; body: { error: string } } {
  const status = err.status ?? err.response?.status ?? 500;
  const internalMessage = err.response?.data ? JSON.stringify(err.response.data) : err.message;
  console.error(`[${method} ${path}] Error:`, status, internalMessage);

  const error =
    status >= 500
      ? "An internal server error occurred"
      : err.response?.data?.message || err.message || "Request failed";
  return { status, body: { error } };
}
