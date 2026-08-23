import { one, run } from './db.js';
import { MAX_GRANT_AMOUNT, type CurrencyCode } from './currency.js';

export const REWARD_SETTING_KEY = 'reward';

export interface RewardSettings {
  signupEnabled: boolean;
  signupCampusOnly: boolean;
  signupBonus: Record<CurrencyCode, number>;
  publishReward: number;
  purchaseReward: number;
}

export const DEFAULT_REWARD_SETTINGS: RewardSettings = {
  signupEnabled: true,
  signupCampusOnly: false,
  signupBonus: { originium: 1, lungmen: 100 },
  publishReward: 100,
  purchaseReward: 100,
};

function rewardAmount(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_GRANT_AMOUNT ? n : null;
}

/** 纯函数：解析并校验奖励设置，非法输入返回 null。 */
export function parseRewardSettings(input: unknown): RewardSettings | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  const bonus: Record<CurrencyCode, number> = { ...DEFAULT_REWARD_SETTINGS.signupBonus };
  if (obj.signupBonus !== undefined) {
    if (!obj.signupBonus || typeof obj.signupBonus !== 'object' || Array.isArray(obj.signupBonus)) return null;
    for (const [key, value] of Object.entries(obj.signupBonus as Record<string, unknown>)) {
      if (key !== 'lungmen' && key !== 'originium') return null;
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > MAX_GRANT_AMOUNT) return null;
      bonus[key as CurrencyCode] = n;
    }
  }
  const publishReward = rewardAmount(obj.publishReward, DEFAULT_REWARD_SETTINGS.publishReward);
  const purchaseReward = rewardAmount(obj.purchaseReward, DEFAULT_REWARD_SETTINGS.purchaseReward);
  if (publishReward === null || purchaseReward === null) return null;
  return {
    signupEnabled: obj.signupEnabled === undefined ? DEFAULT_REWARD_SETTINGS.signupEnabled : obj.signupEnabled === true,
    signupCampusOnly: obj.signupCampusOnly === undefined ? DEFAULT_REWARD_SETTINGS.signupCampusOnly : obj.signupCampusOnly === true,
    signupBonus: bonus,
    publishReward,
    purchaseReward,
  };
}

export async function getRewardSettings(): Promise<RewardSettings> {
  const row = await one('SELECT setting_value FROM platform_settings WHERE setting_key=?', [REWARD_SETTING_KEY]);
  if (!row) return DEFAULT_REWARD_SETTINGS;
  const raw = row.setting_value;
  if (raw && typeof raw === 'object') return parseRewardSettings(raw) ?? DEFAULT_REWARD_SETTINGS;
  try {
    return parseRewardSettings(JSON.parse(String(raw))) ?? DEFAULT_REWARD_SETTINGS;
  } catch {
    return DEFAULT_REWARD_SETTINGS;
  }
}

export async function saveRewardSettings(settings: RewardSettings): Promise<void> {
  await run(
    `INSERT INTO platform_settings (setting_key,setting_value) VALUES (?,?)
     ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_at=CURRENT_TIMESTAMP`,
    [REWARD_SETTING_KEY, JSON.stringify(settings)],
  );
}
