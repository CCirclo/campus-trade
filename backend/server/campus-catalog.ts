import { normalizeEmail } from './security.js';

export type CampusDefinition = { id:string; name:string };
export type SchoolDefinition = { id:string; name:string; emailDomains:string[]; campuses:CampusDefinition[] };

const ID=/^[a-z0-9][a-z0-9_-]{0,39}$/;
const defaults:SchoolDefinition[]=[{
  id:'ruc',name:'中国人民大学',emailDomains:['ruc.edu.cn'],campuses:[{id:'suzhou',name:'苏州校区'}],
}];

function validCatalog(value:unknown):value is SchoolDefinition[]{
  if(!Array.isArray(value)||!value.length)return false;
  const schoolIds=new Set<string>();
  return value.every(s=>{
    if(!s||typeof s!=='object')return false;const row=s as Record<string,unknown>;
    if(typeof row.id!=='string'||!ID.test(row.id)||schoolIds.has(row.id)||typeof row.name!=='string'||!row.name.trim())return false;
    schoolIds.add(row.id);if(!Array.isArray(row.emailDomains)||!row.emailDomains.every(d=>typeof d==='string'&&/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)))return false;
    if(!Array.isArray(row.campuses)||!row.campuses.length)return false;const campusIds=new Set<string>();
    return row.campuses.every(c=>{if(!c||typeof c!=='object')return false;const campus=c as Record<string,unknown>;if(typeof campus.id!=='string'||!ID.test(campus.id)||campusIds.has(campus.id)||typeof campus.name!=='string'||!campus.name.trim())return false;campusIds.add(campus.id);return true});
  });
}

export function loadSchoolCatalog(raw=process.env.SCHOOL_CATALOG_JSON):SchoolDefinition[]{
  if(!raw)return defaults;
  try{const value=JSON.parse(raw);if(validCatalog(value))return value.map(s=>({id:s.id,name:s.name.trim(),emailDomains:s.emailDomains.map(d=>d.toLowerCase()),campuses:s.campuses.map(c=>({id:c.id,name:c.name.trim()}))}))}catch{}
  throw new Error('SCHOOL_CATALOG_JSON 格式无效');
}

export let schoolCatalog=loadSchoolCatalog();
export function replaceSchoolCatalog(next:SchoolDefinition[]){if(!validCatalog(next))throw new Error('学校目录数据无效');schoolCatalog=next.map(s=>({id:s.id,name:s.name.trim(),emailDomains:s.emailDomains.map(d=>d.toLowerCase()),campuses:s.campuses.map(c=>({id:c.id,name:c.name.trim()}))}));}
export const defaultCampusScope=()=>({schoolId:schoolCatalog[0].id,campusId:schoolCatalog[0].campuses[0].id});
export function schoolForEmail(email:unknown){const domain=normalizeEmail(email).split('@')[1]||'';return schoolCatalog.find(s=>s.emailDomains.some(d=>domain===d));}
export function schoolById(id:unknown){return schoolCatalog.find(s=>s.id===String(id||''));}
export function campusBelongsToSchool(schoolId:unknown,campusId:unknown){return Boolean(schoolById(schoolId)?.campuses.some(c=>c.id===String(campusId||'')));}
export function campusScopeNames(schoolId:unknown,campusId:unknown){const school=schoolById(schoolId),campus=school?.campuses.find(c=>c.id===String(campusId||''));return{schoolName:school?.name||String(schoolId||''),campusName:campus?.name||String(campusId||'')}}
export function publicSchoolCatalog(){return schoolCatalog.map(s=>({id:s.id,name:s.name,emailDomains:[...s.emailDomains],campuses:s.campuses.map(c=>({...c}))}));}
export function migrateLegacyScope(schoolId:unknown,campusId:unknown){if(String(schoolId)==='ruc_suzhou')return{schoolId:'ruc',campusId:'suzhou'};return{schoolId:String(schoolId||defaultCampusScope().schoolId),campusId:String(campusId||defaultCampusScope().campusId)}}
