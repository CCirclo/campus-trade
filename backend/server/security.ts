import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'campus_session';
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 160;
}

export function isCampusEmail(value: unknown) {
  return normalizeEmail(value).endsWith('@ruc.edu.cn');
}

export function cleanText(value: unknown, max = 200) {
  return String(value || '').trim().slice(0, max);
}

export function isAllowedOrigin(origin: string | undefined, configuredOrigin: string) {
  if (!origin) return true;
  const allowed = new Set([configuredOrigin]);
  if (process.env.NODE_ENV !== 'production') {
    allowed.add('http://localhost:5173');
    allowed.add('http://127.0.0.1:5173');
  }
  return allowed.has(origin);
}

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 10 * 60_000;

export function consumeRateLimit(key: string, limit = 8, windowMs = 10 * 60_000) {
  const now = Date.now();
  // 定期清理已过期的限流桶，防止内存无限增长
  if (now - lastSweepAt >= SWEEP_INTERVAL_MS) {
    lastSweepAt = now;
    for (const [k, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(k);
    }
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export const categories = ['教材', '电子产品', '生活用品', '服饰', '运动器材', '其他'] as const;
export const conditions = ['全新', '九成新', '七成新', '五成新及以下'] as const;
export const statuses = ['在售', '已售出', '已下架'] as const;

export function validPrice(value: unknown) {
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 && price <= 999999 ? Math.round(price * 100) / 100 : null;
}
