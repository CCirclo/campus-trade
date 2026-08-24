import type { PoolConnection } from 'mysql2/promise';
import { pool } from './db.js';
import { creditCurrency, debitCurrency } from './wallet.js';
import { getRewardSettings } from './settings.js';
import type { CurrencyCode } from './currency.js';

export const ORDER_PAID = '待确认收货';
export const ORDER_DONE = '已完成';
export const ORDER_CANCELLED = '已取消';

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
    if (String(item.status) !== '在售') throw new Error('商品已售出或下架，无法购买');
    if (Number(item.user_id) === input.buyerId) throw new Error('不能购买自己发布的商品');
    const currency = String(item.currency);
    if (currency !== 'lungmen') throw new Error('该商品不支持在线币种支付');
    const price = Number(item.price);
    if (!Number.isInteger(price) || price < 1) throw new Error('商品价格无效');
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
    if (Number(order.buyer_id) !== userId) throw new Error('只能确认自己的订单');
    if (String(order.status) !== ORDER_PAID) throw new Error('订单状态无效');
    await creditCurrency(conn, { userId: Number(order.seller_id), currency: String(order.currency) as CurrencyCode, amount: Number(order.amount), reason: `商品售出: ${String(order.item_title)}`, operator: '系统' });
    const settings = await getRewardSettings();
    if (settings.purchaseReward > 0) await creditCurrency(conn, { userId: Number(order.buyer_id), currency: 'lungmen', amount: settings.purchaseReward, reason: '购买奖励', operator: '系统' });
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
    if (Number(order.buyer_id) !== userId) throw new Error('只能取消自己的订单');
    if (String(order.status) !== ORDER_PAID) throw new Error('订单状态无效');
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
