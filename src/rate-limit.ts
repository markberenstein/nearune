// Nearune — simple in-memory rate limiting for public-facing actions that
// cost money or could be abused to spam someone else's inbox (creating
// rooms, sending confirm/invite emails). Single-process and resets on every
// deploy — this is a speed bump against casual abuse, not a hard security
// boundary, but it's cheap and stops the obvious cases.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Records one action under `key` and returns true if it's allowed — false
// if this key has already hit `limit` actions within the last `windowMs`.
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

// Best-effort client IP. Railway's edge proxy sets x-forwarded-for to the
// real visitor IP — server.requestIP() would only return Railway's own
// internal proxy address, which is the same for every request.
export function clientIp(req: Request, server: { requestIP: (req: Request) => { address: string } | null }): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd && fwd.trim()) return fwd.split(",")[0].trim();
  const ip = server.requestIP(req);
  return (ip && ip.address) || "unknown";
}

// Occasional sweep so a long-lived process doesn't accumulate stale entries
// forever. Never blocks a request.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
}, 10 * 60 * 1000);
