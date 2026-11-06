import type { NextFunction, Request, Response } from "express";

export type Guard = (req: Request, res: Response, next: NextFunction) => unknown;

/** The guards `registerRoutes` passes to route modules that live outside `server/routes.ts`. */
export type RouteGuards = {
  isAuthenticated: Guard;
  isAuthenticatedAny: Guard;
  isTrainer: Guard;
  isAdmin: Guard;
  isTeacherAuthenticated: Guard;
};
