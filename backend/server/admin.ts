import { type NextFunction, type Response, Router } from 'express';
import { hashPassword, type AuthedRequest } from './auth.js';
import { all, mapItem, one, pool, run, type DbRow } from './db.js';
import { cleanText, easterEggs, isCampusEmail, kinds, normalizeEmail, statuses, validEmail } from './security.js';
import { parseCurrency, validAmount } from './currency.js';
import { getRewardSettings, parseRewardSettings, saveRewardSettings } from './settings.js';
import { grantCurrency } from './wallet.js';
import {behaviorMetrics} from './events-store.js';

export const adminRouter = Router();
export const REPORT_REASONS = ['虚假信息', '违规内容', '诈骗风险', '重复发布', '其他'] as const;
const PAGE = 20;
const adminItemSelect = `SELECT i.*,u.id AS seller_id,u.nickname AS seller_nickname,u.avatar_url AS seller_avatar,u.email AS seller_email,u.email_verified AS seller_email_verified,u.admin_verified AS seller_admin_verified FROM items i JOIN users u ON u.id=i.user_id`;

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: '请先登录后继续' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}

function dateIso(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function mapAdminUser(row: DbRow) {
  return {
    id: Number(row.id), email: String(row.email || ''), nickname: String(row.nickname || ''),
    avatarUrl: String(row.avatar_url || ''), role: String(row.role || 'user') === 'admin' ? 'admin' as const : 'user' as const,
    verified: Boolean(row.verified), emailVerified: Boolean(row.email_verified), adminVerified: Boolean(row.admin_verified), selfOperated: Boolean(row.self_operated),
    campusVerified: Boolean(row.admin_verified) || (Boolean(row.email_verified) && isCampusEmail(row.email)),
    emailMessageNotifications: Boolean(row.email_message_notifications),
    createdAt: dateIso(row.created_at), lastSeenAt: row.last_seen_at ? dateIso(row.last_seen_at) : null,
    itemCount: Number(row.item_count || 0),
  };
}

async function adminUser(id: number) {
  const row = await one(`SELECT u.*,(SELECT COUNT(*) FROM items i WHERE i.user_id=u.id) item_count FROM users u WHERE u.id=?`, [id]);
  return row ? mapAdminUser(row) : null;
}

function mapReport(row: DbRow) {
  const rawImages = row.item_images;
  const images = Array.isArray(rawImages) ? rawImages : JSON.parse(String(rawImages || '[]'));
  return {
    id: Number(row.id), reason: String(row.reason || ''), detail: String(row.detail || ''),
    status: String(row.status || '待处理'), createdAt: dateIso(row.created_at),
    handledAt: row.handled_at ? dateIso(row.handled_at) : null, handlerNickname: row.handler_nickname ? String(row.handler_nickname) : null,
    item: { id: Number(row.item_id), title: String(row.item_title || ''), price: Number(row.item_price || 0), image: images[0] || '', status: String(row.item_status || '') },
    reporter: { id: Number(row.reporter_id), nickname: String(row.reporter_nickname || ''), email: String(row.reporter_email || '') },
  };
}

// ---------- 概览统计 ----------
adminRouter.get('/stats', async (_req, res) => {
  const [userRows] = await pool.query<any[]>('SELECT COUNT(*) total FROM users');
  const [itemRows] = await pool.query<any[]>('SELECT COUNT(*) total FROM items');
  const [reportRows] = await pool.query<any[]>(`SELECT COUNT(*) total FROM reports`);
  const [pendingRows] = await pool.query<any[]>(`SELECT COUNT(*) total FROM reports WHERE status='待处理'`);
  res.json({
    users: Number(userRows[0]?.total || 0), items: Number(itemRows[0]?.total || 0),
    reports: Number(reportRows[0]?.total || 0), reportsPending: Number(pendingRows[0]?.total || 0),
  });
});

adminRouter.get('/analytics/recommendations',async(req,res)=>{res.json({days:Math.max(1,Math.min(90,Number(req.query.days)||7)),metrics:await behaviorMetrics(Number(req.query.days)||7)})});

// ---------- 用户管理 ----------
adminRouter.get('/users', async (req, res) => {
  const q = cleanText(req.query.q, 40), role = cleanText(req.query.role, 10), page = Math.max(1, Number(req.query.page) || 1);
  const where: string[] = [], args: unknown[] = [];
  if (q) { where.push('(u.email LIKE ? OR u.nickname LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  if (role === 'admin' || role === 'user') { where.push('u.role=?'); args.push(role); }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await one(`SELECT COUNT(*) total FROM users u ${filter}`, args);
  const rows = await all<DbRow>(`SELECT u.*,(SELECT COUNT(*) FROM items i WHERE i.user_id=u.id) item_count FROM users u ${filter} ORDER BY u.id DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`, args);
  res.json({ users: rows.map(mapAdminUser), total: Number(count?.total || 0), page, pageSize: PAGE });
});

adminRouter.post('/users', async (req, res) => {
  const email = normalizeEmail(req.body.email), password = String(req.body.password || ''), nickname = cleanText(req.body.nickname, 24);
  const adminVerified = Boolean(req.body.adminVerified), selfOperated = Boolean(req.body.selfOperated), role = req.body.role === 'admin' ? 'admin' : 'user';
  if (!validEmail(email)) return res.status(400).json({ error: '请输入有效邮箱地址' });
  if (password.length < 8 || password.length > 72) return res.status(400).json({ error: '密码需为 8–72 个字符' });
  if (nickname.length < 2) return res.status(400).json({ error: '昵称至少需要 2 个字符' });
  if (await one('SELECT id FROM users WHERE email=?', [email])) return res.status(409).json({ error: '该邮箱已存在' });
  const emailVerified = isCampusEmail(email) ? 1 : 0;
  const result = await run(`INSERT INTO users (email,password_hash,nickname,school_id,verified,email_verified,admin_verified,self_operated,role) VALUES (?,?,?,'ruc_suzhou',?,?,?,?,?)`,
    [email, await hashPassword(password), nickname, adminVerified || emailVerified, emailVerified, adminVerified ? 1 : 0, selfOperated ? 1 : 0, role]);
  res.status(201).json({ user: await adminUser(Number(result.insertId)) });
});

adminRouter.patch('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await one('SELECT * FROM users WHERE id=?', [id]);
  if (!existing) return res.status(404).json({ error: '用户不存在' });
  const updates: string[] = [], args: unknown[] = [];
  if (req.body.nickname !== undefined) { const nickname = cleanText(req.body.nickname, 24); if (nickname.length < 2) return res.status(400).json({ error: '昵称至少需要 2 个字符' }); updates.push('nickname=?'); args.push(nickname); }
  if (req.body.wechatId !== undefined) { updates.push('wechat_id=?'); args.push(cleanText(req.body.wechatId, 40)); }
  if (req.body.role !== undefined) { updates.push('role=?'); args.push(req.body.role === 'admin' ? 'admin' : 'user'); }
  if (req.body.verified !== undefined) { updates.push('verified=?'); args.push(req.body.verified ? 1 : 0); }
  if (req.body.emailVerified !== undefined) { updates.push('email_verified=?'); args.push(req.body.emailVerified ? 1 : 0); }
  if (req.body.adminVerified !== undefined) { updates.push('admin_verified=?'); args.push(req.body.adminVerified ? 1 : 0); }
  if (req.body.selfOperated !== undefined) { updates.push('self_operated=?'); args.push(req.body.selfOperated ? 1 : 0); }
  if (req.body.emailMessageNotifications !== undefined) { updates.push('email_message_notifications=?'); args.push(req.body.emailMessageNotifications ? 1 : 0); }
  if (!updates.length) return res.status(400).json({ error: '没有需要更新的内容' });
  args.push(id);
  await run(`UPDATE users SET ${updates.join(',')} WHERE id=?`, args);
  res.json({ user: await adminUser(id) });
});

adminRouter.delete('/users/:id', async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) return res.status(400).json({ error: '不能删除自己的账号' });
  const result = await run('DELETE FROM users WHERE id=?', [id]);
  if (!result.affectedRows) return res.status(404).json({ error: '用户不存在' });
  res.json({ ok: true });
});

// ---------- 商品管理 ----------
adminRouter.get('/items', async (req, res) => {
  const q = cleanText(req.query.q, 40), status = cleanText(req.query.status, 20), page = Math.max(1, Number(req.query.page) || 1);
  const where: string[] = [], args: unknown[] = [];
  if (q) { where.push('(i.title LIKE ? OR u.nickname LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  if (status && statuses.includes(status as typeof statuses[number])) { where.push('i.status=?'); args.push(status); }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await one(`SELECT COUNT(*) total FROM items i JOIN users u ON u.id=i.user_id ${filter}`, args);
  const rows = await all<DbRow>(`${adminItemSelect} ${filter} ORDER BY i.id DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`, args);
  res.json({ items: rows.map(mapItem), total: Number(count?.total || 0), page, pageSize: PAGE });
});

adminRouter.patch('/items/:id', async (req, res) => {
  const id = Number(req.params.id);
  const updates: string[] = [], args: unknown[] = [];
  if (req.body.status !== undefined) {
    const status = cleanText(req.body.status, 20);
    if (!statuses.includes(status as typeof statuses[number])) return res.status(400).json({ error: '商品状态无效' });
    updates.push('status=?'); args.push(status);
  }
  if (req.body.kind !== undefined) {
    const kind = cleanText(req.body.kind, 10);
    if (!(kinds as readonly string[]).includes(kind)) return res.status(400).json({ error: '商品性质无效' });
    updates.push('kind=?'); args.push(kind);
  }
  if (req.body.easterEgg !== undefined) {
    const egg = req.body.easterEgg === null || req.body.easterEgg === '' ? null : cleanText(req.body.easterEgg, 20);
    if (egg !== null && !(easterEggs as readonly string[]).includes(egg)) return res.status(400).json({ error: '彩蛋种类无效' });
    updates.push('easter_egg=?'); args.push(egg);
  }
  if (!updates.length) return res.status(400).json({ error: '没有需要更新的内容' });
  args.push(id);
  const result = await run(`UPDATE items SET ${updates.join(',')} WHERE id=?`, args);
  if (!result.affectedRows) return res.status(404).json({ error: '商品不存在' });
  res.json({ ok: true });
});

adminRouter.delete('/items/:id', async (req, res) => {
  const result = await run('DELETE FROM items WHERE id=?', [Number(req.params.id)]);
  if (!result.affectedRows) return res.status(404).json({ error: '商品不存在' });
  res.json({ ok: true });
});

// ---------- 举报处理 ----------
adminRouter.get('/reports', async (req, res) => {
  const status = cleanText(req.query.status, 20), page = Math.max(1, Number(req.query.page) || 1);
  const where: string[] = [], args: unknown[] = [];
  if (status) { where.push('r.status=?'); args.push(status); }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await one(`SELECT COUNT(*) total FROM reports r ${filter}`, args);
  const rows = await all<DbRow>(`SELECT r.*,i.title item_title,i.price item_price,i.status item_status,i.images item_images,` +
    `u.nickname reporter_nickname,u.email reporter_email,uu.nickname handler_nickname ` +
    `FROM reports r JOIN items i ON i.id=r.item_id JOIN users u ON u.id=r.reporter_id LEFT JOIN users uu ON uu.id=r.handler_id ` +
    `${filter} ORDER BY (r.status='待处理') DESC,r.id DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`, args);
  res.json({ reports: rows.map(mapReport), total: Number(count?.total || 0), page, pageSize: PAGE });
});

adminRouter.patch('/reports/:id', async (req: AuthedRequest, res) => {
  const id = Number(req.params.id), status = cleanText(req.body.status, 20);
  if (status !== '已处理' && status !== '已驳回') return res.status(400).json({ error: '处理状态无效' });
  const existing = await one('SELECT id FROM reports WHERE id=?', [id]);
  if (!existing) return res.status(404).json({ error: '举报不存在' });
  await run('UPDATE reports SET status=?,handled_at=CURRENT_TIMESTAMP,handler_id=? WHERE id=?', [status, req.user!.id, id]);
  res.json({ ok: true });
});

// ---------- 奖励机制设置 ----------
adminRouter.get('/settings/reward', async (_req, res) => {
  res.json({ settings: await getRewardSettings() });
});

adminRouter.put('/settings/reward', async (req, res) => {
  const settings = parseRewardSettings(req.body);
  if (!settings) return res.status(400).json({ error: '奖励设置格式无效' });
  await saveRewardSettings(settings);
  res.json({ settings });
});

// ---------- 手动发放奖励 ----------
adminRouter.post('/wallet/grant', async (req: AuthedRequest, res) => {
  const email = normalizeEmail(req.body.email);
  const currency = parseCurrency(req.body.currency);
  const amount = validAmount(req.body.amount);
  const reason = cleanText(req.body.reason, 200);
  if (!email || !currency || amount === null || reason.length < 2) return res.status(400).json({ error: '请提供有效邮箱、币种、正整数数量和至少 2 个字符的原因' });
  const user = await one('SELECT id,email,nickname FROM users WHERE email=?', [email]);
  if (!user) return res.status(404).json({ error: '未找到该用户' });
  const operator = String(req.user!.email || req.user!.nickname || '管理员');
  const { after } = await grantCurrency({ userId: Number(user.id), currency, amount, reason, operator });
  res.status(201).json({ userId: Number(user.id), currency, amount, balanceAfter: after });
});

adminRouter.get('/users/:id/wallet', async (req, res) => {
  const id = Number(req.params.id);
  const user = await one('SELECT id,email,nickname FROM users WHERE id=?', [id]);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const balances = await all('SELECT currency,balance FROM wallets WHERE user_id=?', [id]);
  const entries = await all('SELECT id,currency,amount,balance_after,reason,operator,created_at FROM currency_ledger WHERE user_id=? ORDER BY id DESC LIMIT 50', [id]);
  res.json({
    user: { id: Number(user.id), email: String(user.email), nickname: String(user.nickname) },
    balances: balances.map(b => ({ currency: String(b.currency), balance: Number(b.balance) })),
    entries: entries.map(e => ({ id: Number(e.id), currency: String(e.currency), amount: Number(e.amount), balanceAfter: Number(e.balance_after), reason: String(e.reason), operator: String(e.operator), createdAt: dateIso(e.created_at) })),
  });
});
