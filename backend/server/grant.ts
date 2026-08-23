import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { all, one } from './db.js';
import { CURRENCIES, MAX_GRANT_AMOUNT, parseCurrency, validAmount, type CurrencyCode } from './currency.js';
import { cleanText, normalizeEmail } from './security.js';
import { grantCurrency } from './wallet.js';

const USAGE = `用法:
  npm run grant -- <邮箱> <币种> <数量> <原因> [--yes]   手动发放奖励（币种: lungmen/原石、originium/创世结晶）
  npm run grant -- --list <邮箱>                         查询某用户的余额与最近流水`;

function fail(message: string): void { console.error(message); process.exitCode = 1; }

function fmtTime(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

async function listBalances(email: string) {
  const user = await one('SELECT id,email,nickname FROM users WHERE email=?', [email]);
  if (!user) return fail(`未找到用户: ${email}`);
  const walletRows = await all('SELECT currency,balance FROM wallets WHERE user_id=?', [Number(user.id)]);
  const ledgerRows = await all('SELECT currency,amount,balance_after,reason,operator,created_at FROM currency_ledger WHERE user_id=? ORDER BY id DESC LIMIT 20', [Number(user.id)]);
  console.log(`用户: ${String(user.nickname)} (${String(user.email)})`);
  for (const c of Object.values(CURRENCIES)) {
    const row = walletRows.find(r => r.currency === c.code);
    console.log(`  ${c.name}(${c.code}): ${Number(row?.balance || 0)}`);
  }
  if (ledgerRows.length) {
    console.log('最近流水:');
    for (const e of ledgerRows) {
      const def = CURRENCIES[String(e.currency) as CurrencyCode];
      console.log(`  ${Number(e.amount)>0?'+':''}${e.amount} ${def ? def.name : String(e.currency)} | ${String(e.reason)} | 余额 ${e.balance_after} | ${String(e.operator)} | ${fmtTime(e.created_at)}`);
    }
  } else {
    console.log('  暂无流水记录');
  }
}

async function grant() {
  const args = process.argv.slice(2);
  const yes = args.includes('--yes');
  const positional = args.filter(a => a !== '--yes');
  if (positional[0] === '--list') {
    const email = normalizeEmail(positional[1]);
    if (!email) return fail(USAGE);
    return listBalances(email);
  }
  const [emailArg, currencyArg, amountArg, ...reasonParts] = positional;
  const email = normalizeEmail(emailArg);
  const currency = parseCurrency(currencyArg);
  const amount = validAmount(amountArg);
  const reason = cleanText(reasonParts.join(' '), 200);
  if (!email || !currency || amount === null || reason.length < 2) {
    return fail(`${USAGE}\n要求: 有效邮箱、币种(lungmen/原石、originium/创世结晶)、1–${MAX_GRANT_AMOUNT} 的正整数、至少 2 个字符的原因`);
  }

  const user = await one('SELECT id,email,nickname FROM users WHERE email=?', [email]);
  if (!user) return fail(`未找到用户: ${email}`);

  const walletRow = await one('SELECT balance FROM wallets WHERE user_id=? AND currency=?', [Number(user.id), currency]);
  const before = Number(walletRow?.balance || 0);
  const previewAfter = before + amount;
  const def = CURRENCIES[currency];
  console.log(`即将发放: ${def.name} × ${amount}`);
  console.log(`目标用户: ${String(user.nickname)} (${String(user.email)})`);
  console.log(`余额变化: ${before} → ${previewAfter}`);
  console.log(`发放原因: ${reason}`);

  if (!yes) {
    const rl = createInterface({ input: stdin, output: stdout });
    const answer = await rl.question('确认发放？输入 yes 继续，其他任意键取消: ');
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') return fail('已取消，未发放任何奖励');
  }

  const operator = cleanText(process.env.ADMIN_OPERATOR_NAME || '管理员', 160);
  const { after } = await grantCurrency({ userId: Number(user.id), currency, amount, reason, operator });
  console.log(`发放成功: ${String(user.nickname)} +${amount} ${def.name}，当前余额 ${after}（操作者: ${operator}）`);
}

grant().catch(error => { console.error('发放失败:', error); process.exitCode = 1; });
