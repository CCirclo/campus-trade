export const CURRENCIES = {
  originium: { code: 'originium' as const, name: '至纯源石', description: '开发贡献凭证 · 或参与治理与分红' },
  lungmen: { code: 'lungmen' as const, name: '龙门币', description: '通用货币 · 可兑换商品与抽奖' },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;
export type CurrencyDefinition = typeof CURRENCIES[CurrencyCode];

export const CURRENCY_LIST: CurrencyDefinition[] = [CURRENCIES.originium, CURRENCIES.lungmen];
export const MAX_GRANT_AMOUNT = 1_000_000;

export function parseCurrency(value: unknown): CurrencyCode | null {
  const text = String(value || '').trim();
  if (text in CURRENCIES) return text as CurrencyCode;
  const byName = CURRENCY_LIST.find(c => c.name === text);
  return byName ? byName.code : null;
}

export function validAmount(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_GRANT_AMOUNT) return null;
  return amount;
}
