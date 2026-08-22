import test from 'node:test';import assert from 'node:assert/strict';
import {runtimeSecret} from '../server/runtime-secret.js';

test('development runtime secrets are stable and purpose-separated',()=>{const analytics=runtimeSecret('analytics'),cursor=runtimeSecret('cursor');assert.equal(analytics,runtimeSecret('analytics'));assert.equal(analytics.length,64);assert.notEqual(analytics,cursor)});
