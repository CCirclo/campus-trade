export const tradeCurrencies = [
  { code: 'cny', name: '人民币', symbol: '¥' },
  { code: 'lungmen', name: '原石', symbol: '石' },
] as const;

export type TradeCurrencyCode = typeof tradeCurrencies[number]['code'];

export function currencyOf(code?: string) {
  return tradeCurrencies.find(c => c.code === code) ?? tradeCurrencies[0];
}

export function formatItemPrice(item: { price: number; currency?: string }) {
  const c = currencyOf(item.currency);
  return c.code === 'cny' ? `¥${item.price}` : `${item.price} ${c.name}`;
}

export function formatItemPrices(item: { price: number; currency?: string; rmbPrice?: number | null }) {
  const primary = formatItemPrice(item);
  if (item.currency === 'lungmen' && item.rmbPrice != null) return `¥${item.rmbPrice} / ${primary}`;
  return primary;
}
