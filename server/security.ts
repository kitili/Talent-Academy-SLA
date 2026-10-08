import type { Request, Response, NextFunction, Express } from "express";

const loginHits = new Map<string, { count: number; resetAt: number }>();

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com",
      "connect-src 'self' https:",
      "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
  );
  next();
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 80;
  const entry = loginHits.get(key);
  if (!entry || entry.resetAt < now) {
    loginHits.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  entry.count += 1;
  if (entry.count > max) {
    return res.status(429).json({ message: "Too many sign-in attempts. Try again in 15 minutes." });
  }
  next();
}

export function redactForLog(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const clone = Array.isArray(value) ? [...value] : { ...(value as Record<string, unknown>) };
  const walk = (obj: any) => {
    if (!obj || typeof obj !== "object") return;
    for (const key of Object.keys(obj)) {
      if (/password|token|secret|authorization/i.test(key)) {
        obj[key] = "[redacted]";
      } else if (typeof obj[key] === "object") {
        walk(obj[key]);
      }
    }
  };
  walk(clone);
  return clone;
}

export function applySecurity(app: Express) {
  app.disable("x-powered-by");
  app.use(securityHeaders);
}
