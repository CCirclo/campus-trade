import { Router } from 'express';
import { all, one, run } from './db.js';
import { requireAuth, type AuthedRequest } from './auth.js';
import { cleanText } from './security.js';
import { hashDeviceToken, normalizeDeviceToken } from './push.js';

// 设备 token 注册/注销：iOS 客户端在获取 APNs token 后（登录态）上传；退出登录时注销。
// token 只以哈希存储，接口不返回完整 token；同一用户+设备幂等去重。
export const deviceTokenRouter = Router();

deviceTokenRouter.post('/register', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const token = normalizeDeviceToken(req.body.token);
    if (!token) return res.status(400).json({ error: '设备 Token 无效' });
    const platform = cleanText(req.body.platform, 10) || 'ios';
    if (platform !== 'ios' && platform !== 'android') return res.status(400).json({ error: '平台不受支持' });
    const tokenHash = hashDeviceToken(token);
    // 去重：同一用户 + 同一设备哈希幂等；若该 token 曾属其他用户（换账号），转移归属。
    // token 原值仅用于真实远程送达，任何接口都不返回、不记录日志。
    await run(
      `INSERT INTO device_tokens (token_hash, token, user_id, platform, created_at, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE token=VALUES(token), user_id=VALUES(user_id), platform=VALUES(platform), updated_at=CURRENT_TIMESTAMP`,
      [tokenHash, token, req.user!.id, platform],
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

deviceTokenRouter.post('/unregister', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const token = normalizeDeviceToken(req.body.token);
    if (!token) return res.status(400).json({ error: '设备 Token 无效' });
    // 只允许注销「自己」名下的 token，避免误删他人注册。
    await run('DELETE FROM device_tokens WHERE token_hash=? AND user_id=?', [hashDeviceToken(token), req.user!.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// 查询某个用户的设备 token（仅供内部推送使用，返回原始 token 用于真实送达，绝不经接口返回）。
export async function deviceTokensForUser(userId: number): Promise<Array<{ tokenHash: string; token: string; platform: string }>> {
  const rows = await all('SELECT token_hash, token, platform FROM device_tokens WHERE user_id=?', [userId]);
  return rows.map((r) => ({ tokenHash: String(r.token_hash), token: String(r.token), platform: String(r.platform) }));
}
