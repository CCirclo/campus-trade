import test from 'node:test';import assert from 'node:assert/strict';
import {canAccessCampus,campusSql} from '../server/admin-scope.js';
import {isSuperAdminEmail,SUPER_ADMIN_EMAIL} from '../server/admin-permissions.js';

test('campus admins access only exact assigned campus',()=>{const scope={isSuperAdmin:false,campuses:[{schoolId:'ruc',campusId:'suzhou'}]};assert.equal(canAccessCampus(scope,'ruc','suzhou'),true);assert.equal(canAccessCampus(scope,'ruc','beijing'),false);assert.equal(canAccessCampus(scope,'pku','suzhou'),false)});
test('super admin can filter all campuses',()=>assert.equal(canAccessCampus({isSuperAdmin:true,campuses:[]},'any','campus'),true));
test('super admin list queries have no campus restriction',()=>assert.deepEqual(campusSql('i',{isSuperAdmin:true,campuses:[]}),{clause:'',args:[]}));
test('only the configured email receives super admin authority',()=>{assert.equal(SUPER_ADMIN_EMAIL,'2025202211@ruc.edu.cn');assert.equal(isSuperAdminEmail(' 2025202211@RUC.EDU.CN '),true);assert.equal(isSuperAdminEmail('another@ruc.edu.cn'),false)});
test('campus SQL binds both school and campus',()=>assert.deepEqual(campusSql('i',{isSuperAdmin:false,campuses:[{schoolId:'ruc',campusId:'suzhou'}]}),{clause:'((i.school_id=? AND i.campus_id=?))',args:['ruc','suzhou']}));
