import test from 'node:test';import assert from 'node:assert/strict';
import {canAccessCampus,campusSql} from '../server/admin-scope.js';

test('campus admins access only exact assigned campus',()=>{const scope={isSuperAdmin:false,campuses:[{schoolId:'ruc',campusId:'suzhou'}]};assert.equal(canAccessCampus(scope,'ruc','suzhou'),true);assert.equal(canAccessCampus(scope,'ruc','beijing'),false);assert.equal(canAccessCampus(scope,'pku','suzhou'),false)});
test('super admin can filter all campuses',()=>assert.equal(canAccessCampus({isSuperAdmin:true,campuses:[]},'any','campus'),true));
test('campus SQL binds both school and campus',()=>assert.deepEqual(campusSql('i',{isSuperAdmin:false,campuses:[{schoolId:'ruc',campusId:'suzhou'}]}),{clause:'((i.school_id=? AND i.campus_id=?))',args:['ruc','suzhou']}));
