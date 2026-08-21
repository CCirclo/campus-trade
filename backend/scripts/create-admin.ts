import 'dotenv/config';
import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { hashPassword } from '../server/auth.js';
import { one, pool, run } from '../server/db.js';
import { normalizeEmail, validEmail } from '../server/security.js';

const email = normalizeEmail(process.argv[2]) || '';
if (!email || !validEmail(email)) {
  console.error('用法: npx tsx scripts/create-admin.ts <邮箱>');
  process.exit(1);
}

const existing = await one('SELECT id FROM users WHERE email=?', [email]);
if (existing) {
  console.error(`账号 ${email} 已存在。如需设为管理员，请运行: npx tsx scripts/make-admin.ts ${email}`);
  process.exit(1);
}

const rl = createInterface({ input, output, terminal: true });
// 运行时对象就是 readline.Interface（带 output），此处仅补全类型。
const muted = rl as unknown as { _writeToOutput: (str: string) => void; outputMuted: boolean; output: typeof output };
muted._writeToOutput = function (str: string) {
  if (muted.outputMuted) this.output.write('*');
  else this.output.write(str);
};
muted.outputMuted = false;

const password: string = await new Promise((resolve) => {
  rl.question('请输入初始密码（至少 8 位，输入时不显示）: ', (answer) => {
    muted.outputMuted = false;
    output.write('\n');
    resolve(answer);
  });
  muted.outputMuted = true;
});
rl.close();

if (password.length < 8 || password.length > 72) {
  console.error('密码长度需为 8–72 个字符，创建已中止。');
  process.exit(1);
}

const nickname = '管理员';
const result = await run(
  `INSERT INTO users (email,password_hash,nickname,school_id,verified,email_verified,role) VALUES (?,?,?,'ruc_suzhou',1,1,'admin')`,
  [email, await hashPassword(password), nickname],
);
console.log(`已创建管理员账号 ${email}（id=${result.insertId}），初始昵称「管理员」，可登录后修改。`);
await pool.end();
