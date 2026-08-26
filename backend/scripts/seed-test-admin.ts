import 'dotenv/config';
import { all, initDatabase, one, pool, run } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { normalizeEmail } from '../server/security.js';

/** 本地测试环境种子：创建总管理员、校区管理员与普通测试用户（幂等，可重复运行）。 */
const accounts = [
  { email: '2025202211@ruc.edu.cn', password: 'Admin@2026', nickname: '平台总管理员', role: 'admin', adminVerified: 1 },
  { email: 'admin@ruc.edu.cn', password: 'Admin@2026', nickname: '校区管理员', role: 'admin', adminVerified: 1 },
  { email: 'student@ruc.edu.cn', password: 'User@2026', nickname: '测试同学', role: 'user', adminVerified: 0 },
];

await initDatabase();

for (const account of accounts) {
  const email = normalizeEmail(account.email);
  const existing = await one('SELECT id FROM users WHERE email=?', [email]);
  const passwordHash = await hashPassword(account.password);
  if (existing) {
    await run(
      `UPDATE users SET password_hash=?, nickname=?, role=?, verified=1, email_verified=1, admin_verified=?, school_id='ruc', campus_id='suzhou' WHERE email=?`,
      [passwordHash, account.nickname, account.role, account.adminVerified, email],
    );
    console.log(`已更新账号 ${email}（role=${account.role}）`);
  } else {
    await run(
      `INSERT INTO users (email,password_hash,nickname,school_id,campus_id,verified,email_verified,admin_verified,role) VALUES (?,?,?,'ruc','suzhou',1,1,?,?)`,
      [email, passwordHash, account.nickname, account.adminVerified, account.role],
    );
    console.log(`已创建账号 ${email}（role=${account.role}）`);
  }
}

const rows = await all('SELECT email, role, admin_verified FROM users ORDER BY id');
console.log('种子完成，当前用户：', rows.map(r => ({ email: String(r.email), role: String(r.role), adminVerified: Boolean(r.admin_verified) })));
await pool.end();
