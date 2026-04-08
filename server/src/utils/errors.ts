import { Request, Response, NextFunction } from "express";

/**
 * Express error-handling middleware.
 * Used with express-async-errors so routes can just throw
 * instead of wrapping everything in try/catch.
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  const status = err.response?.status || 500;
  const message = err.response?.data ? JSON.stringify(err.response.data) : err.message;
  console.error(`[${req.method} ${req.path}] Error:`, status, message);
  res.status(status).json({ error: message });
}
