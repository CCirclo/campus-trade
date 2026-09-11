import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymousAlias, canViewTreeholeInScope, TREEHOLE_REPORT_REASONS } from '../server/treehole.js';

test('匿名编号显示为「匿名N号」', () => {
  assert.equal(anonymousAlias(1), '匿名1号');
  assert.equal(anonymousAlias(12), '匿名12号');
});

test('树洞可见性与商品一致：本人 OR 同校同校区', () => {
  const post = { userId: 7, schoolId: 'ruc', campusId: 'suzhou' };
  // 本人跨校区可见。
  assert.equal(canViewTreeholeInScope({ userId: 7, schoolId: 'ruc', campusId: 'beijing' }, post), true);
  // 同校同校区他人可见。
  assert.equal(canViewTreeholeInScope({ userId: 8, schoolId: 'ruc', campusId: 'suzhou' }, post), true);
  // 同校不同校区他人不可见。
  assert.equal(canViewTreeholeInScope({ userId: 8, schoolId: 'ruc', campusId: 'beijing' }, post), false);
  // 不同学校不可见。
  assert.equal(canViewTreeholeInScope({ userId: 8, schoolId: 'pku', campusId: 'suzhou' }, post), false);
  // 游客按校区可见（未登录无 userId）。
  assert.equal(canViewTreeholeInScope({ schoolId: 'ruc', campusId: 'suzhou' }, post), true);
  assert.equal(canViewTreeholeInScope({ schoolId: 'ruc', campusId: 'beijing' }, post), false);
});

test('树洞举报原因包含治理所需类别', () => {
  assert.deepEqual(TREEHOLE_REPORT_REASONS, ['违规内容', '骚扰攻击', '泄露隐私', '虚假信息', '其他']);
});
