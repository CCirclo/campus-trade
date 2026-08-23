import type { PoolConnection } from 'mysql2/promise';
import { pool } from './db.js';
import type { CurrencyCode } from './currency.js';

export interface GrantResult {
  before: number;
  after: number;
}

export class InsufficientFundsError extends Error {
  constructor(message = '余额不足') {
    super(message);
    this.name = 'InsufficientFundsError';
  }
}

async function ensureWalletRow(conn: PoolConnection, userId: number, currency: CurrencyCode): Promise<void> {
  await conn.execute('INSERT INTO wallets (user_id,currency,balance) VALUES (?,?,0) ON DUPLICATE KEY UPDATE balance=balance', [userId, currency]);
}

/** 在传入事务内给用户加币（发放/入账），并写一条正数流水。 */
export async function creditCurrency(
  conn: PoolConnection,
  input: { userId: number; currency: CurrencyCode; amount: number; reason: string; operator: string },
): Promise<GrantResult> {
  const { userId, currency, amount, reason, operator } = input;
  await ensureWalletRow(conn, userId, currency);
  const [locked] = await conn.execute<any[]>('SELECT balance FROM wallets WHERE user_id=? AND currency=? FOR UPDATE', [userId, currency]);
  const before = Number(locked[0]?.balance || 0);
  const after = before + amount;
  await conn.execute('UPDATE wallets SET balance=? WHERE user_id=? AND currency=?', [after, userId, currency]);
  await conn.execute('INSERT INTO currency_ledger (user_id,currency,amount,balance_after,reason,operator) VALUES (?,?,?,?,?,?)', [userId, currency, amount, after, reason, operator]);
  return { before, after };
}

/** 在传入事务内给用户扣币（支付），并写一条负数流水；余额不足时抛 InsufficientFundsError。 */
export async function debitCurrency(
  conn: PoolConnection,
  input: { userId: number; currency: CurrencyCode; amount: number; reason: string; operator: string },
): Promise<GrantResult> {
  const { userId, currency, amount, reason, operator } = input;
  await ensureWalletRow(conn, userId, currency);
  const [locked] = await conn.execute<any[]>('SELECT balance FROM wallets WHERE user_id=? AND currency=? FOR UPDATE', [userId, currency]);
  const before = Number(locked[0]?.balance || 0);
  if (before < amount) throw new InsufficientFundsError();
  const after = before - amount;
  await conn.execute('UPDATE wallets SET balance=? WHERE user_id=? AND currency=?', [after, userId, currency]);
  await conn.execute('INSERT INTO currency_ledger (user_id,currency,amount,balance_after,reason,operator) VALUES (?,?,?,?,?,?)', [userId, currency, -amount, after, reason, operator]);
  return { before, after };
}

/**
 * 原子发放奖励：内部自建事务并释放连接；传入 connection 时由调用方管理事务。
 */
export async function grantCurrency(input: {
  userId: number;
  currency: CurrencyCode;
  amount: number;
  reason: string;
  operator: string;
  connection?: PoolConnection;
}): Promise<GrantResult> {
  const { connection } = input;
  if (connection) return creditCurrency(connection, input);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await creditCurrency(conn, input);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
