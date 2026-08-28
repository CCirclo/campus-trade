import type { PoolConnection } from 'mysql2/promise';
import { pool } from './db.js';
import { creditCurrency, debitCurrency } from './wallet.js';
import {DAILY_ACTIVITY_LIMIT,nextCounter,recordDailyActivity,shanghaiDay,tieredRewardAmount} from './reward-policy.js';
import type { CurrencyCode } from './currency.js';

export const ORDER_PAID = '待确认收货';
export const ORDER_DONE = '已完成';
export const ORDER_CANCELLED = '已取消';

/** 在线支付仅支持原石（lungmen），与 Web 下单入口一致。 */
export const ONLINE_TRADE_CURRENCY = 'lungmen';

/** 商品是否可以发起在线担保下单（纯校验，供路由与测试复用）。 */
export function orderEligibility(input: { status: unknown; ownerId: unknown; buyerId: unknown; currency: unknown; price: unknown }): { ok: true; price: number } | { ok: false; reason: string } {
  if (String(input.status) !== '在售') return { ok: false, reason: '商品已售出或下架，无法购买' };
  if (Number(input.ownerId) === Number(input.buyerId)) return { ok: false, reason: '不能购买自己发布的商品' };
  if (String(input.currency) !== ONLINE_TRADE_CURRENCY) return { ok: false, reason: '该商品不支持在线币种支付' };
  const price = Number(input.price);
  if (!Number.isInteger(price) || price < 1) return { ok: false, reason: '商品价格无效' };
  return { ok: true, price };
}

/** 买家确认收货 / 取消的合法性：操作者必须是买家，且订单处于「待确认收货」。 */
export function orderActionEligibility(status: unknown, buyerId: unknown, actorId: unknown): { ok: true } | { ok: false; reason: string } {
  if (Number(buyerId) !== Number(actorId)) return { ok: false, reason: '只能操作自己的订单' };
  if (String(status) !== ORDER_PAID) return { ok: false, reason: '订单状态无效' };
  return { ok: true };
}

/**
 * 买家在线支付（担保交易）：
 * 锁定商品 → 校验在售/非本人/币种可支付 → 扣买家余额 → 商品标记已售出 → 创建订单。
 * 资金先离开买家账户，确认收货后才会转入卖家账户。
 */
export async function createOrder(input: { itemId: number; buyerId: number }): Promise<{ id: number }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [itemRows] = await conn.execute<any[]>(`SELECT id,user_id,title,price,currency,images,status FROM items WHERE id=? FOR UPDATE`, [input.itemId]);
    const item = itemRows[0];
    if (!item) throw new Error('商品不存在或已删除');
    const eligibility = orderEligibility({ status: item.status, ownerId: item.user_id, buyerId: input.buyerId, currency: item.currency, price: item.price });
    if (!eligibility.ok) throw new Error(eligibility.reason);
    const price = eligibility.price;
    const currency = String(item.currency);
    const rawImages = item.images;
    const images = Array.isArray(rawImages) ? rawImages : JSON.parse(String(rawImages || '[]'));
    await debitCurrency(conn, { userId: input.buyerId, currency: currency as CurrencyCode, amount: price, reason: `购买商品: ${String(item.title)}`, operator: '系统' });
    await conn.execute(`UPDATE items SET status='已售出' WHERE id=?`, [input.itemId]);
    const [result] = await conn.execute<any>(`INSERT INTO orders (item_id,buyer_id,seller_id,currency,amount,item_title,item_image,status,paid_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, [input.itemId, input.buyerId, Number(item.user_id), currency, price, String(item.title), String(images[0] || ''), ORDER_PAID]);
    await conn.commit();
    return { id: Number(result.insertId) };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/** 买家确认收货：锁定订单 → 校验归属与状态 → 把货款转入卖家账户 → 订单标记已完成。 */
export async function confirmOrder(orderId: number, userId: number): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<any[]>(`SELECT id,buyer_id,seller_id,currency,amount,status,item_title FROM orders WHERE id=? FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order) throw new Error('订单不存在');
    const eligibility = orderActionEligibility(order.status, order.buyer_id, userId);
    if (!eligibility.ok) throw new Error(eligibility.reason);
    await creditCurrency(conn, { userId: Number(order.seller_id), currency: String(order.currency) as CurrencyCode, amount: Number(order.amount), reason: `商品售出: ${String(order.item_title)}`, operator: '系统' });
    const used = await recordDailyActivity(conn, Number(order.buyer_id), 'purchase', shanghaiDay());
    if (used <= DAILY_ACTIVITY_LIMIT) {
      const amount = tieredRewardAmount(await nextCounter(conn, 'purchase'));
      if (amount > 0) await creditCurrency(conn, { userId: Number(order.buyer_id), currency: 'lungmen', amount, reason: '购买奖励', operator: '系统' });
    }
    await conn.execute(`UPDATE orders SET status=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`, [ORDER_DONE, orderId]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/** 买家取消订单（确认收货前）：退款回买家钱包，商品恢复在售。 */
export async function cancelOrder(orderId: number, userId: number): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<any[]>(`SELECT id,buyer_id,currency,amount,status,item_id FROM orders WHERE id=? FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order) throw new Error('订单不存在');
    const eligibility = orderActionEligibility(order.status, order.buyer_id, userId);
    if (!eligibility.ok) throw new Error(eligibility.reason);
    await creditCurrency(conn, { userId, currency: String(order.currency) as CurrencyCode, amount: Number(order.amount), reason: '订单退款', operator: '系统' });
    await conn.execute(`UPDATE orders SET status=? WHERE id=?`, [ORDER_CANCELLED, orderId]);
    if (order.item_id) await conn.execute(`UPDATE items SET status='在售' WHERE id=?`, [Number(order.item_id)]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
