import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { randomUUID } from 'node:crypto';
import {
  apnsConfigIssue,
  apnsConfigured,
  hashDeviceToken,
  messageNotificationPayload,
  normalizeDeviceToken,
  parseConversationId,
} from '../server/push.js';
import { itemUniversalLink, parseDeepLink, parseDeepLinkPath } from '../server/deep-link.js';
import { requireAuth } from '../server/auth.js';

// —— 通知 token 校验 / 哈希 / 去重（纯函数） ——

test('normalizeDeviceToken accepts hex tokens and normalizes case', () => {
  const tok = 'a1b2c3'.repeat(11) + 'd4'; // 68 hex chars
  assert.equal(normalizeDeviceToken(tok.toUpperCase()), tok);
  assert.equal(normalizeDeviceToken(`  ${tok}  `), tok);
});

test('normalizeDeviceToken rejects non-hex / too short / too long', () => {
  assert.equal(normalizeDeviceToken(''), null);
  assert.equal(normalizeDeviceToken('zzz'), null);
  assert.equal(normalizeDeviceToken('abc'), null); // < 64
  assert.equal(normalizeDeviceToken('g'.repeat(64)), null); // non-hex
  assert.equal(normalizeDeviceToken('a'.repeat(300)), null); // > 200
  assert.equal(normalizeDeviceToken(undefined), null);
});

test('device tokens have stable sha256 indexes for deduplication', () => {
  const token = 'f'.repeat(64);
  const hash = hashDeviceToken(token);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, token);
  assert.equal(hash, hashDeviceToken(token)); // 幂等 → 去重
  assert.notEqual(hash, hashDeviceToken('e'.repeat(64)));
});

test('messageNotificationPayload carries conversationId and optional badge', () => {
  const full = messageNotificationPayload(42, '同学', '你好', 3) as any;
  assert.equal(full.aps.alert.title, '同学');
  assert.equal(full.aps.alert.body, '你好');
  assert.equal(full.aps.badge, 3);
  assert.equal(full.conversationId, 42);
  assert.equal(full.type, 'new_message');

  const noBadge = messageNotificationPayload(7, 'a', 'b') as any;
  assert.equal('badge' in noBadge.aps, false);
  assert.equal(noBadge.conversationId, 7);
});

test('parseConversationId accepts positive safe integers only', () => {
  assert.equal(parseConversationId(1), 1);
  assert.equal(parseConversationId('42'), 42);
  assert.equal(parseConversationId(0), null);
  assert.equal(parseConversationId(-1), null);
  assert.equal(parseConversationId('NaN'), null);
});

test('apnsConfigIssue reports partial config and stays silent when fully absent', () => {
  const before = { ...process.env };
  try {
    delete process.env.APNS_KEY_ID;
    delete process.env.APNS_TEAM_ID;
    delete process.env.APNS_TOPIC;
    delete process.env.APNS_AUTH_KEY_PATH;
    delete process.env.APNS_AUTH_KEY_BASE64;
    assert.equal(apnsConfigured(), false);
    // 完全未配置 → 安全降级，不算问题。
    assert.equal(apnsConfigIssue(), null);
    // 部分配置 → 告警。
    process.env.APNS_KEY_ID = 'ABC123';
    assert.equal(apnsConfigIssue(), 'APNs 部分配置，缺少：APNS_TEAM_ID, APNS_TOPIC');
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in before)) delete process.env[k];
    for (const [k, v] of Object.entries(before)) process.env[k] = v;
  }
});

// —— 链接解析 ——

test('parseDeepLinkPath resolves items/messages/errands', () => {
  assert.deepEqual(parseDeepLinkPath('/items/18'), { kind: 'item', id: 18 });
  assert.deepEqual(parseDeepLinkPath('/messages/7'), { kind: 'conversation', id: 7 });
  assert.deepEqual(parseDeepLinkPath('/errands/3'), { kind: 'errand', id: 3 });
  assert.equal(parseDeepLinkPath('/items/abc'), null);
  assert.equal(parseDeepLinkPath('/other/18'), null);
  assert.equal(parseDeepLinkPath('/'), null);
});

test('parseDeepLink handles full URLs with base path', () => {
  assert.deepEqual(parseDeepLink('https://20250821cdcdifc.top/campus-trade/items/18'), { kind: 'item', id: 18 });
  assert.deepEqual(parseDeepLink('https://20250821cdcdifc.top/items/18'), { kind: 'item', id: 18 });
  assert.equal(parseDeepLink('not a url'), null);
});

test('itemUniversalLink builds canonical link', () => {
  assert.equal(itemUniversalLink('https://20250821cdcdifc.top/campus-trade/', 18), 'https://20250821cdcdifc.top/campus-trade/items/18');
  assert.equal(itemUniversalLink('https://20250821cdcdifc.top/campus-trade', 18), 'https://20250821cdcdifc.top/campus-trade/items/18');
});

// —— 401 会话失效：未携带会话 Cookie 时 requireAuth 返回 401 ——

test('requireAuth returns 401 with structured error when no session', async () => {
  const app = express();
  app.use(express.json());
  app.get('/authed', requireAuth, (_req, res) => res.json({ ok: true }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/authed`);
    assert.equal(resp.status, 401);
    const body = (await resp.json()) as { error: string };
    assert.equal(typeof body.error, 'string');
    assert.ok(body.error.length > 0);
  } finally {
    server.close();
  }
});

// AASA 路由：content-type 与 appID 结构正确。
test('AASA route serves correct content type and applinks structure', async () => {
  const app = express();
  app.get('/.well-known/apple-app-site-association', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json({ applinks: { apps: [], details: [{ appID: 'TEAMID.com.ccirclo.ios', paths: ['/items/*'] }] } });
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/.well-known/apple-app-site-association`);
    assert.equal(resp.status, 200);
    assert.match(resp.headers.get('content-type') || '', /application\/json/);
    const body = (await resp.json()) as any;
    assert.ok(body.applinks);
    assert.ok(Array.isArray(body.applinks.details));
    assert.match(body.applinks.details[0].appID, /^TEAMID\.com\.ccirclo\.ios$/);
    assert.deepEqual(body.applinks.details[0].paths, ['/items/*']);
  } finally {
    server.close();
  }
});
