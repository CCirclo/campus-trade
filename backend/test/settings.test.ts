import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_REWARD_SETTINGS, parseRewardSettings } from '../server/settings.js';

test('parseRewardSettings accepts a complete valid payload', () => {
  const input = {
    signupEnabled: true,
    signupCampusOnly: true,
    signupBonus: { lungmen: 500, originium: 20 },
    publishReward: 50,
    purchaseReward: 80,
  };
  assert.deepEqual(parseRewardSettings(input), input);
});

test('parseRewardSettings rejects invalid input', () => {
  assert.equal(parseRewardSettings(null), null);
  assert.equal(parseRewardSettings('x'), null);
  assert.equal(parseRewardSettings([]), null);
  assert.equal(parseRewardSettings({ signupBonus: { lungmen: -1 } }), null);
  assert.equal(parseRewardSettings({ signupBonus: { lungmen: 1.5 } }), null);
  assert.equal(parseRewardSettings({ signupBonus: { bitcoin: 10 } }), null);
  assert.equal(parseRewardSettings({ publishReward: -1 }), null);
  assert.equal(parseRewardSettings({ purchaseReward: 1.5 }), null);
});

test('parseRewardSettings merges defaults for missing fields', () => {
  assert.deepEqual(parseRewardSettings({}), DEFAULT_REWARD_SETTINGS);
  const partial = parseRewardSettings({ signupEnabled: false });
  assert.equal(partial?.signupEnabled, false);
  assert.equal(partial?.publishReward, DEFAULT_REWARD_SETTINGS.publishReward);
});

test('default signup bonus is 100 lungmen and 1 originium', () => {
  assert.equal(DEFAULT_REWARD_SETTINGS.signupBonus.lungmen, 100);
  assert.equal(DEFAULT_REWARD_SETTINGS.signupBonus.originium, 1);
});

test('default publish and purchase rewards are 100', () => {
  assert.equal(DEFAULT_REWARD_SETTINGS.publishReward, 100);
  assert.equal(DEFAULT_REWARD_SETTINGS.purchaseReward, 100);
});
