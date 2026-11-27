import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { Promise.resolve(handler(req, res, next)).catch(next); };
}
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;
  if (error instanceof ZodError) { res.status(400).json({ message: "Invalid request data" }); return; }
  if (error instanceof HttpError) { res.status(error.status).json({ message: error.message }); return; }
  const type = (error as { type?: string })?.type;
  if (type === "entity.parse.failed") { res.status(400).json({ message: "Invalid JSON" }); return; }
  if (type === "entity.too.large") { res.status(413).json({ message: "Request too large" }); return; }
  res.status(500).json({ message: "Internal server error" });
}
