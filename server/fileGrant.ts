import { createHmac, timingSafeEqual } from "crypto";

const TEN_MINUTES_MS = 10 * 60 * 1000;

function secret() {
  return process.env.SESSION_SECRET || "local-dev-only-change-me";
}

export function signFileGrant(fileUrl: string, now = Date.now()) {
  const exp = now + TEN_MINUTES_MS;
  const sig = createHmac("sha256", secret()).update(`${fileUrl}.${exp}`).digest("hex");
  return { exp, sig };
}

export function verifyFileGrant(fileUrl: string, expRaw: unknown, sigRaw: unknown, now = Date.now()) {
  const exp = Number(expRaw);
  const sig = String(sigRaw || "");
  if (!fileUrl || !Number.isFinite(exp) || exp < now || !/^[a-f0-9]{64}$/.test(sig)) return false;
  const expected = createHmac("sha256", secret()).update(`${fileUrl}.${exp}`).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
