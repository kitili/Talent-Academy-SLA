import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { hashPassword } from "./auth";

type Provider = "google" | "microsoft";

function providerConfig(provider: Provider) {
  if (provider === "google") {
    const id = process.env.GOOGLE_CLIENT_ID;
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    if (!id || !secret) return null;
    return {
      id,
      secret,
      authorize: "https://accounts.google.com/o/oauth2/v2/auth",
      token: "https://oauth2.googleapis.com/token",
      userinfo: "https://www.googleapis.com/oauth2/v2/userinfo",
      scope: "openid email profile",
    };
  }
  const id = process.env.MICROSOFT_CLIENT_ID;
  const secret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!id || !secret) return null;
  return {
    id,
    secret,
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userinfo: "https://graph.microsoft.com/oidc/userinfo",
    scope: "openid email profile",
  };
}

function publicOrigin(req: Request) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  return `${proto}://${host}`;
}

export function ssoStatus() {
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    microsoft: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
  };
}

export function setupSso(app: Express) {
  app.get("/api/auth/sso/status", (_req, res) => {
    res.json(ssoStatus());
  });

  app.get("/api/auth/sso/:provider", (req, res) => {
    const provider = req.params.provider as Provider;
    const config = provider === "google" || provider === "microsoft" ? providerConfig(provider) : null;
    if (!config) {
      return res.status(501).json({
        error: `${provider} sign-in is not configured. Add the client id and secret on Vercel.`,
      });
    }
    const state = randomBytes(16).toString("hex");
    (req.session as any).ssoState = state;
    (req.session as any).ssoProvider = provider;
    const redirectUri = `${publicOrigin(req)}/api/auth/sso/${provider}/callback`;
    const url = new URL(config.authorize);
    url.searchParams.set("client_id", config.id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", config.scope);
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/sso/:provider/callback", async (req: Request, res: Response) => {
    try {
      const provider = req.params.provider as Provider;
      const config = provider === "google" || provider === "microsoft" ? providerConfig(provider) : null;
      if (!config) return res.status(501).send("SSO is not configured");
      if (!req.query.code || req.query.state !== (req.session as any).ssoState) {
        return res.status(400).send("Invalid sign-in state");
      }
      const redirectUri = `${publicOrigin(req)}/api/auth/sso/${provider}/callback`;
      const tokenRes = await fetch(config.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.id,
          client_secret: config.secret,
          code: String(req.query.code),
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });
      const tokens = await tokenRes.json() as { access_token?: string };
      if (!tokens.access_token) return res.status(400).send("Could not finish school sign-in");
      const profileRes = await fetch(config.userinfo, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileRes.json() as { email?: string; name?: string; given_name?: string };
      const email = String(profile.email || "").trim().toLowerCase();
      if (!email) return res.status(400).send("School account has no email");
      let teacher = await storage.getTeacherByEmail(email);
      if (!teacher) {
        teacher = await storage.createTeacher({
          name: profile.name || profile.given_name || email.split("@")[0],
          email,
          password: await hashPassword(randomBytes(24).toString("hex")),
          approvalStatus: "approved",
          approvedAt: new Date(),
          approvedByRole: "sso",
        });
        await storage.upsertTeacherReportCard({
          teacherId: teacher.id,
          level: "Beginner",
          totalQuizzesTaken: 0,
          totalQuizzesPassed: 0,
          averageScore: 0,
        });
      }
      if (teacher.approvalStatus === "rejected") {
        return res.status(403).send("This account was rejected.");
      }
      (req.session as any).teacherId = teacher.id;
      delete (req.session as any).ssoState;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });
      res.redirect("/teacher/dashboard");
    } catch (error) {
      console.error("SSO callback failed:", error);
      res.status(500).send("School sign-in failed");
    }
  });
}
