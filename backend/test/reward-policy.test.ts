import test from 'node:test';
import assert from 'node:assert/strict';
import { tieredRewardAmount, shanghaiDay } from '../server/reward-policy.js';

test('tieredRewardAmount halves every 200 occurrences', () => {
  assert.equal(tieredRewardAmount(1), 100);
  assert.equal(tieredRewardAmount(200), 100);
  assert.equal(tieredRewardAmount(201), 50);
  assert.equal(tieredRewardAmount(400), 50);
  assert.equal(tieredRewardAmount(401), 25);
  assert.equal(tieredRewardAmount(1001), 3);
  assert.equal(tieredRewardAmount(1201), 1);
  assert.equal(tieredRewardAmount(1401), 0);
});

test('tieredRewardAmount returns 0 for invalid ordinal', () => {
  assert.equal(tieredRewardAmount(0), 0);
  assert.equal(tieredRewardAmount(-1), 0);
  assert.equal(tieredRewardAmount(1.5), 0);
});

test('tieredRewardAmount caps each activity type at about 40k total', () => {
  let total = 0;
  for (let n = 1; n <= 1400; n += 1) total += tieredRewardAmount(n);
  assert.equal(total, 39400);
});

test('shanghaiDay returns a YYYY-MM-DD string', () => {
  assert.match(shanghaiDay(new Date('2026-08-25T03:00:00Z')), /^\d{4}-\d{2}-\d{2}$/);
});
