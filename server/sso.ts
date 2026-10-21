import type { Express } from "express";

export function ssoStatus() {
  return { google: false, microsoft: false };
}

export function setupSso(app: Express) {
  app.get("/api/auth/sso/status", (_req, res) => {
    res.json(ssoStatus());
  });

  app.use("/api/auth/sso", (_req, res) => {
    res.status(403).json({ error: "This academy only accepts the test logins." });
  });
}
