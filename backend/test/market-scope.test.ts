import test from 'node:test';
import assert from 'node:assert/strict';
import {canManageItem,canViewItemInScope} from '../server/market-scope.js';

test('only the item owner may manage (edit/delete/status) it',()=>{
  // 无论浏览校区如何，发布者本人始终可管理自己的商品。
  assert.equal(canManageItem(7,7),true);
  assert.equal(canManageItem(42,42),true);
  // 他人（同校区或异校区）一律无权删除/编辑。
  assert.equal(canManageItem(8,7),false);
  assert.equal(canManageItem(7,8),false);
  // 未登录（viewerUserId 为空）无权管理。
  assert.equal(canManageItem(undefined,7),false);
  assert.equal(canManageItem(null as unknown as number|undefined,7),false);
});

test('management differs from scoped visibility: owners keep access across campuses',()=>{
  const item={userId:7,schoolId:'ruc',campusId:'suzhou'};
  // 可见性：本人跨校区可看；他人仅同校区可看。
  assert.equal(canViewItemInScope({userId:7,schoolId:'ruc',campusId:'beijing'},item),true);
  // 管理：他人即使同校区也不能删除/编辑。
  assert.equal(canManageItem(8,item.userId),false);
});
