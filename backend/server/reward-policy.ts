import type { PoolConnection } from 'mysql2/promise';

export const REWARD_BASE = 100;
export const REWARD_STEP = 200;
export const FIRST_N_ORIGINIUM = 100;
export const DAILY_ACTIVITY_LIMIT = 3;
export const PUBLISH_SPIKE_THRESHOLD = 20;

export type ActivityKey = 'signup' | 'publish' | 'purchase';

/**
 * 按该类型活动在平台上的累计发生序号计算单次奖励：
 * 每发生 REWARD_STEP 次减半（100 → 50 → 25 → …），单次 < 1 时停止发放。
 * ordinal 从 1 开始（第 1 次发生）。
 */
export function tieredRewardAmount(ordinal: number, base = REWARD_BASE, step = REWARD_STEP): number {
  if (!Number.isInteger(ordinal) || ordinal < 1 || !Number.isFinite(base) || base < 1 || !Number.isInteger(step) || step < 1) return 0;
  let amount = Math.floor(base);
  let tier = Math.floor((ordinal - 1) / step);
  while (tier > 0 && amount >= 1) {
    amount = Math.floor(amount / 2);
    tier -= 1;
  }
  return amount >= 1 ? amount : 0;
}

/** 业务日（Asia/Shanghai）的 'YYYY-MM-DD'，用于每日限次。 */
export function shanghaiDay(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 原子递增全局累计计数器，返回递增后的值（从 1 开始）。 */
export async function nextCounter(conn: PoolConnection, key: ActivityKey): Promise<number> {
  await conn.execute(`INSERT INTO reward_counters (counter_key,counter_value) VALUES (?,1) ON DUPLICATE KEY UPDATE counter_value=counter_value+1`, [key]);
  const [rows] = await conn.execute<any[]>(`SELECT counter_value FROM reward_counters WHERE counter_key=?`, [key]);
  return Number(rows[0]?.counter_value || 0);
}

/** 记录一次当日活动并返回该用户当日该活动的累计次数（含本次）。 */
export async function recordDailyActivity(conn: PoolConnection, userId: number, activity: ActivityKey, day: string): Promise<number> {
  await conn.execute(`INSERT INTO reward_daily_limits (user_id,activity,activity_day,daily_count) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE daily_count=daily_count+1`, [userId, activity, day]);
  const [rows] = await conn.execute<any[]>(`SELECT daily_count FROM reward_daily_limits WHERE user_id=? AND activity=? AND activity_day=?`, [userId, activity, day]);
  return Number(rows[0]?.daily_count || 0);
}

/** 检测短时间大量发布的异常：超过阈值时写一条风控标记（每用户每天至多一条）。 */
export async function recordRiskFlagIfNeeded(conn: PoolConnection, userId: number): Promise<void> {
  const [rows] = await conn.execute<any[]>(`SELECT COUNT(*) c FROM items WHERE user_id=? AND created_at>=DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 24 HOUR)`, [userId]);
  const count = Number(rows[0]?.c || 0);
  if (count < PUBLISH_SPIKE_THRESHOLD) return;
  const [existing] = await conn.execute<any[]>(`SELECT id FROM risk_flags WHERE user_id=? AND kind='publish_spike' AND created_at>=DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 24 HOUR) LIMIT 1`, [userId]);
  if (existing.length) return;
  await conn.execute(`INSERT INTO risk_flags (user_id,kind,detail) VALUES (?,?,?)`, [userId, 'publish_spike', `24 小时内发布 ${count} 件商品`]);
}
