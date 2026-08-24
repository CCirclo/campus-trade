import test from 'node:test';
import assert from 'node:assert/strict';
import {canAccessSchool,isSuperAdminEmail,SUPER_ADMIN_EMAIL} from '../server/admin-permissions.js';
import {canViewItemInScope} from '../server/market-scope.js';

test('only the fixed platform owner email is super admin',()=>{assert.equal(isSuperAdminEmail(SUPER_ADMIN_EMAIL),true);assert.equal(isSuperAdminEmail(SUPER_ADMIN_EMAIL.toUpperCase()),true);assert.equal(isSuperAdminEmail(`x${SUPER_ADMIN_EMAIL}`),false);assert.equal(isSuperAdminEmail('admin@ruc.edu.cn'),false)});
test('school managers can access only assigned schools',()=>{assert.equal(canAccessSchool(false,['ruc'],'ruc'),true);assert.equal(canAccessSchool(false,['ruc'],'pku'),false);assert.equal(canAccessSchool(true,[],'pku'),true)});
test('items remain in publication campus while owners retain access',()=>{const item={userId:7,schoolId:'ruc',campusId:'suzhou'};assert.equal(canViewItemInScope({userId:8,schoolId:'ruc',campusId:'suzhou'},item),true);assert.equal(canViewItemInScope({userId:8,schoolId:'ruc',campusId:'beijing'},item),false);assert.equal(canViewItemInScope({userId:8,schoolId:'pku',campusId:'suzhou'},item),false);assert.equal(canViewItemInScope({userId:7,schoolId:'ruc',campusId:'beijing'},item),true)});
