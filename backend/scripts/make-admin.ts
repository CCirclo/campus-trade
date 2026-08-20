import 'dotenv/config';
import { pool, run } from '../server/db.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('用法: npx tsx scripts/make-admin.ts <邮箱>');
  console.error('示例: npx tsx scripts/make-admin.ts admin@example.com');
  process.exit(1);
}

const result = await run(`UPDATE users SET role='admin' WHERE email=?`, [email]);
if (result.affectedRows) {
  console.log(`已将 ${email} 设为管理员（重启服务后生效于会话，或重新登录后生效）`);
} else {
  console.error(`未找到邮箱为 ${email} 的用户，请先注册该账号。`);
  process.exit(1);
}
await pool.end();
