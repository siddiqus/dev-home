/**
 * Error thrown by every API call. `response.data.error` mirrors the old server
 * error body so existing UI code (`err.response?.data?.error || err.message`)
 * keeps working unchanged.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly response: { status: number; data: { error: string } };

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.response = { status, data: { error: message } };
  }
}

/** Normalize axios / proxy / GitHub / Jira errors. Status 0 = network or CORS failure. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const e = err as { message?: string; response?: { status?: number; data?: any } };
  const data = e?.response?.data;
  const fromBody =
    data && typeof data === "object"
      ? data.error ||
        (Array.isArray(data.errorMessages) ? data.errorMessages[0] : undefined) ||
        data.message
      : undefined;
  return new ApiError(e?.response?.status ?? 0, String(fromBody || e?.message || "Request failed"));
}
