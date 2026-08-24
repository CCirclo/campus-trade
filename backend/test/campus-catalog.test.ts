import test from 'node:test';
import assert from 'node:assert/strict';
import {campusBelongsToSchool,loadSchoolCatalog,migrateLegacyScope,schoolForEmail} from '../server/campus-catalog.js';

test('school is derived from an exact configured email domain',()=>{
  assert.equal(schoolForEmail('student@ruc.edu.cn')?.id,'ruc');
  assert.equal(schoolForEmail('student@mail.ruc.edu.cn'),undefined);
  assert.equal(schoolForEmail('student@ruc.edu.cn.example.com'),undefined);
});

test('campus must belong to the immutable school scope',()=>{
  assert.equal(campusBelongsToSchool('ruc','suzhou'),true);
  assert.equal(campusBelongsToSchool('ruc','unknown'),false);
  assert.equal(campusBelongsToSchool('unknown','suzhou'),false);
});

test('legacy combined scope migrates without ambiguity',()=>{
  assert.deepEqual(migrateLegacyScope('ruc_suzhou',''),{schoolId:'ruc',campusId:'suzhou'});
});

test('catalog configuration rejects malformed or duplicate identifiers',()=>{
  assert.throws(()=>loadSchoolCatalog('[]'),/格式无效/);
  assert.throws(()=>loadSchoolCatalog(JSON.stringify([{id:'bad id',name:'学校',emailDomains:['example.edu.cn'],campuses:[{id:'main',name:'主校区'}]}])),/格式无效/);
});
