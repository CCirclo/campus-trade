import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ONLINE_TRADE_CURRENCY,
  ORDER_CANCELLED,
  ORDER_DONE,
  ORDER_PAID,
  orderActionEligibility,
  orderEligibility,
} from '../server/orders.js';

test('online trade only supports the lungmen currency', () => {
  assert.equal(ONLINE_TRADE_CURRENCY, 'lungmen');
});

test('order constants map to the three status states', () => {
  assert.equal(ORDER_PAID, '待确认收货');
  assert.equal(ORDER_DONE, '已完成');
  assert.equal(ORDER_CANCELLED, '已取消');
});

test('orderEligibility accepts a valid selling lungmen item with integer price', () => {
  const r = orderEligibility({ status: '在售', ownerId: 7, buyerId: 9, currency: 'lungmen', price: 45 });
  assert.deepEqual(r, { ok: true, price: 45 });
});

test('orderEligibility rejects sold / unlisted items', () => {
  for (const status of ['已售出', '已下架']) {
    const r = orderEligibility({ status, ownerId: 7, buyerId: 9, currency: 'lungmen', price: 45 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, '商品已售出或下架，无法购买');
  }
});

test('orderEligibility rejects buying your own item', () => {
  const r = orderEligibility({ status: '在售', ownerId: 9, buyerId: 9, currency: 'lungmen', price: 45 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, '不能购买自己发布的商品');
});

test('orderEligibility rejects currencies other than lungmen (no online payment)', () => {
  for (const currency of ['cny', 'originium', '']) {
    const r = orderEligibility({ status: '在售', ownerId: 7, buyerId: 9, currency, price: 45 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, '该商品不支持在线币种支付');
  }
});

test('orderEligibility rejects non-integer / non-positive prices', () => {
  for (const price of [0, -5, 1.5, 'abc', NaN]) {
    const r = orderEligibility({ status: '在售', ownerId: 7, buyerId: 9, currency: 'lungmen', price });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, '商品价格无效');
  }
});

test('orderActionEligibility allows the buyer to act on a paid order', () => {
  assert.deepEqual(orderActionEligibility(ORDER_PAID, 9, 9), { ok: true });
});

test('orderActionEligibility rejects non-buyer actors', () => {
  const r = orderActionEligibility(ORDER_PAID, 9, 8);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, '只能操作自己的订单');
});

test('orderActionEligibility rejects non-paid statuses (confirm/cancel only before receipt)', () => {
  for (const status of [ORDER_DONE, ORDER_CANCELLED]) {
    const r = orderActionEligibility(status, 9, 9);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, '订单状态无效');
  }
});
