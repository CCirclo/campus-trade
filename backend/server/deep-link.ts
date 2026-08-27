// 通用链接 / 站内深链解析：把商品/会话链接解析为 { kind, id }，供通知 payload、AASA 与客户端共用约定。
// kind ∈ 'item' | 'conversation' | 'errand'；未知路径返回 null。

export type DeepLinkTarget = { kind: 'item' | 'conversation' | 'errand'; id: number };

/** 从 URL 的 pathname 解析目标。兼容站内路由 /items/:id、/messages/:id、/errands/:id。 */
export function parseDeepLinkPath(pathname: string): DeepLinkTarget | null {
  const clean = String(pathname || '').replace(/\/+$/, '').split('?')[0];
  const match = clean.match(/\/(items|messages|errands)\/(\d+)\/?$/i);
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const kind = match[1].toLowerCase();
  if (kind === 'messages') return { kind: 'conversation', id };
  if (kind === 'errands') return { kind: 'errand', id };
  return { kind: 'item', id };
}

/** 解析完整 URL（含域名与可选 base path，如 /campus-trade/items/3）。 */
export function parseDeepLink(href: string): DeepLinkTarget | null {
  try {
    const url = new URL(String(href));
    return parseDeepLinkPath(url.pathname);
  } catch {
    return parseDeepLinkPath(String(href));
  }
}

/** 生成商品 Universal Link（iOS 分享用）。base 不含尾部斜杠。 */
export function itemUniversalLink(base: string, itemId: number): string {
  return `${base.replace(/\/$/, '')}/items/${itemId}`;
}
