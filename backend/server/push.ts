import { createHash } from 'node:crypto';

// APNs 环境变量均为「可选」：缺失时服务不配置，站内消息与邮件通知不受影响。
export function apnsConfigured(): boolean {
  return Boolean(process.env.APNS_KEY_ID
    && process.env.APNS_TEAM_ID
    && process.env.APNS_TOPIC
    && (process.env.APNS_AUTH_KEY_PATH || process.env.APNS_AUTH_KEY_BASE64));
}

/**
 * 校验客户端上传的 APNs device token：去空白、要求 64–200 长度的十六进制。
 * 返回标准化后的 token（小写十六进制），非法返回 null。
 */
export function normalizeDeviceToken(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{64,200}$/.test(raw)) return null;
  return raw;
}

/** 使用 sha256 作为索引与去重键；原 token 仅限服务端内部向 APNs 送达。 */
export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 校验 APNs 通知载荷中的会话标识：正整数字符串。 */
export function parseConversationId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id >= 1 ? id : null;
}

/**
 * 校验 APNs 环境变量是否自洽。仅供测试与启动告警：缺失时返回提示语，齐备返回 null。
 * 不访问网络，也不加载 .p8 私钥（.p8 密钥属于外部验收项）。
 */
export function apnsConfigIssue(): string | null {
  const fields: Array<[string, string | undefined]> = [
    ['APNS_KEY_ID', process.env.APNS_KEY_ID],
    ['APNS_TEAM_ID', process.env.APNS_TEAM_ID],
    ['APNS_TOPIC', process.env.APNS_TOPIC],
  ];
  const missing = fields.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length === fields.length) return null; // 完全未配置 → 已安全降级，不算问题。
  if (missing.length > 0) return `APNs 部分配置，缺少：${missing.join(', ')}`;
  if (!process.env.APNS_AUTH_KEY_PATH && !process.env.APNS_AUTH_KEY_BASE64) {
    return 'APNs 缺少私钥（APNS_AUTH_KEY_PATH 或 APNS_AUTH_KEY_BASE64）';
  }
  return null;
}

/**
 * 组装一条带会话标识的新消息推送载荷。前台/后台/冷启动点击都据此深链到对应会话。
 */
export function messageNotificationPayload(conversationId: number, title: string, body: string, badge?: number) {
  return {
    aps: {
      alert: { title, body },
      sound: 'default',
      ...(Number.isInteger(badge) ? { badge } : {}),
    },
    conversationId,
    type: 'new_message',
  };
}

// —— 「真实远程送达」发送器：仅在 apnsConfigured() 且凭据齐备时工作。
// 受外部 Apple team / APNs 凭据约束，其实际联网送达属于外部验收项；函数本身保持可调用与可降级。

export function apnsSendingSupported(): boolean {
  return apnsConfigured() && apnsConfigIssue() === null;
}

/**
 * 惰性发送入口。未配置 APNs 时直接返回 false（安全降级，不抛错）。
 * 配置齐备但网络失败时记录并返回 false；调用方（消息路由）永远不能因此中断站内消息落库。
 */
export async function trySendPush(token: string, payload: unknown): Promise<boolean> {
  if (!apnsSendingSupported()) return false;
  const { sendApnsPush } = await import('./push-client.js');
  return sendApnsPush(process.env.APNS_AUTH_KEY_PATH, process.env.APNS_AUTH_KEY_BASE64, token, payload, {
    keyId: process.env.APNS_KEY_ID!,
    teamId: process.env.APNS_TEAM_ID!,
    topic: process.env.APNS_TOPIC!,
  });
}

/** 供启动阶段打印一句非阻塞告警，便于运维发现「半配置」状态。 */
export function maybeWarnApns(): void {
  const issue = apnsConfigIssue();
  if (issue) console.warn(`[push] ${issue}`);
}
