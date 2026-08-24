export const CURRENCIES = {
  originium: { code: 'originium' as const, name: '创世结晶', description: '稀有货币 · 参与抽奖与限定兑换' },
  lungmen: { code: 'lungmen' as const, name: '原石', description: '通用货币 · 发布与购买商品可获得，可兑换自营商品' },
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

export const TRADE_CURRENCIES = [
  { code: 'cny', name: '人民币', symbol: '¥' },
  { code: 'lungmen', name: '原石', symbol: '石' },
] as const;

export type TradeCurrencyCode = 'cny' | 'lungmen';

/** 解析交易币种：仅支持人民币(cny)与原石(lungmen)。 */
export function parseTradeCurrency(value: unknown): TradeCurrencyCode | null {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'cny' || text === '人民币' || text === '¥' || text === '￥') return 'cny';
  const code = parseCurrency(text);
  return code === 'lungmen' ? code : null;
}
