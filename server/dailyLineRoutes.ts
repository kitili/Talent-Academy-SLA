import type { Express } from "express";
import type { RouteGuards } from "./routeGuards";
import { encouragementFor } from "./trainerEncouragement";

/** One non-repeating line a day for each person, by role. Contract: plans/sla-feedback-fixes/sla-feedback-fixes-plan.md. */
export function registerDailyLineRoutes(app: Express, guards: RouteGuards) {
  app.get("/api/daily-line", guards.isAuthenticatedAny, async (req, res) => {
    try {
      // Who and which role come only from the session, never from the request.
      const isFellow = Boolean(req.teacherId);
      const personId = isFellow ? req.teacherId : (req.user as { id?: string } | undefined)?.id;
      const role = isFellow ? "fellow" : (req.user as { role?: string } | undefined)?.role;
      if (!personId) return res.json({ line: "" });
      res.json({ line: await encouragementFor(String(personId), role) });
    } catch (error) {
      console.error("Daily line unavailable:", error);
      res.json({ line: "" });
    }
  });
}
