import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRENCIES, CURRENCY_LIST, MAX_GRANT_AMOUNT, parseCurrency, validAmount } from '../server/currency.js';

test('both currencies are defined with codes and display names', () => {
  assert.equal(CURRENCIES.originium.name, '至纯源石');
  assert.equal(CURRENCIES.lungmen.name, '龙门币');
  assert.deepEqual(CURRENCY_LIST.map(c => c.code), ['originium', 'lungmen']);
  assert.ok(CURRENCIES.originium.description.length > 0);
  assert.ok(CURRENCIES.lungmen.description.length > 0);
});

test('parseCurrency accepts codes and Chinese names and rejects others', () => {
  assert.equal(parseCurrency('originium'), 'originium');
  assert.equal(parseCurrency('lungmen'), 'lungmen');
  assert.equal(parseCurrency('至纯源石'), 'originium');
  assert.equal(parseCurrency(' 龙门币 '), 'lungmen');
  assert.equal(parseCurrency('龙门币 '), 'lungmen');
  assert.equal(parseCurrency('龙币'), null);
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
