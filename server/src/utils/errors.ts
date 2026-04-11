import { Request, Response, NextFunction } from "express";

/**
 * Express error-handling middleware.
 * Used with express-async-errors so routes can just throw
 * instead of wrapping everything in try/catch.
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  const status = err.response?.status || 500;
  const internalMessage = err.response?.data ? JSON.stringify(err.response.data) : err.message;
  console.error(`[${req.method} ${req.path}] Error:`, status, internalMessage);

  // For 5xx errors, return a generic message to avoid leaking internal details
  const clientMessage =
    status >= 500
      ? "An internal server error occurred"
      : err.response?.data?.message || err.message || "Request failed";
  res.status(status).json({ error: clientMessage });
}
