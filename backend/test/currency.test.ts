import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRENCIES, CURRENCY_LIST, MAX_GRANT_AMOUNT, parseCurrency, parseTradeCurrency, TRADE_CURRENCIES, validAmount } from '../server/currency.js';

test('both currencies are defined with codes and display names', () => {
  assert.equal(CURRENCIES.originium.name, '创世结晶');
  assert.equal(CURRENCIES.lungmen.name, '原石');
  assert.deepEqual(CURRENCY_LIST.map(c => c.code), ['originium', 'lungmen']);
  assert.ok(CURRENCIES.originium.description.length > 0);
  assert.ok(CURRENCIES.lungmen.description.length > 0);
});

test('parseCurrency accepts codes and Chinese names and rejects others', () => {
  assert.equal(parseCurrency('originium'), 'originium');
  assert.equal(parseCurrency('lungmen'), 'lungmen');
  assert.equal(parseCurrency('创世结晶'), 'originium');
  assert.equal(parseCurrency('原石'), 'lungmen');
  assert.equal(parseCurrency(' 原石 '), 'lungmen');
  assert.equal(parseCurrency('龙币'), null);
  assert.equal(parseCurrency('至纯源石'), null);
  assert.equal(parseCurrency(''), null);
  assert.equal(parseCurrency(undefined), null);
  assert.equal(parseCurrency(42), null);
});

test('validAmount only allows positive integers up to the cap', () => {
  assert.equal(validAmount(1), 1);
  assert.equal(validAmount('10'), 10);
  assert.equal(validAmount(MAX_GRANT_AMOUNT), MAX_GRANT_AMOUNT);
  assert.equal(validAmount(MAX_GRANT_AMOUNT + 1), null);
  assert.equal(validAmount(0), null);
  assert.equal(validAmount(-5), null);
  assert.equal(validAmount(1.5), null);
  assert.equal(validAmount('abc'), null);
  assert.equal(validAmount(''), null);
  assert.equal(validAmount(NaN), null);
});

test('TRADE_CURRENCIES covers cny and lungmen only', () => {
  assert.deepEqual(TRADE_CURRENCIES.map(c => c.code), ['cny', 'lungmen']);
  assert.equal(TRADE_CURRENCIES[0].symbol, '¥');
});

test('parseTradeCurrency only accepts cny and lungmen', () => {
  assert.equal(parseTradeCurrency('cny'), 'cny');
  assert.equal(parseTradeCurrency('人民币'), 'cny');
  assert.equal(parseTradeCurrency('¥'), 'cny');
  assert.equal(parseTradeCurrency('lungmen'), 'lungmen');
  assert.equal(parseTradeCurrency('原石'), 'lungmen');
  assert.equal(parseTradeCurrency('originium'), null);
  assert.equal(parseTradeCurrency('创世结晶'), null);
  assert.equal(parseTradeCurrency('美金'), null);
  assert.equal(parseTradeCurrency(''), null);
  assert.equal(parseTradeCurrency(undefined), null);
});
