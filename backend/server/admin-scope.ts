import {all} from './db.js';
import {isSuperAdminEmail} from './admin-permissions.js';

export type CampusScope={schoolId:string;campusId:string};
export type AdminScope={isSuperAdmin:boolean;campuses:CampusScope[]};

export async function loadAdminScope(user:{id:number;email:string;schoolId:string;campusId:string}):Promise<AdminScope>{
  if(isSuperAdminEmail(user.email))return{isSuperAdmin:true,campuses:[]};
  const rows=await all('SELECT school_id,campus_id FROM campus_admins WHERE user_id=?',[user.id]);
  return{isSuperAdmin:false,campuses:rows.length?rows.map(r=>({schoolId:String(r.school_id),campusId:String(r.campus_id)})):[{schoolId:user.schoolId,campusId:user.campusId}]};
}

export function canAccessCampus(scope:AdminScope,schoolId:unknown,campusId:unknown){
  return scope.isSuperAdmin||scope.campuses.some(c=>c.schoolId===String(schoolId||'')&&c.campusId===String(campusId||''));
}

export function campusSql(alias:string,scope:AdminScope){
  if(scope.isSuperAdmin)return{clause:'',args:[] as unknown[]};
  if(!scope.campuses.length)return{clause:'1=0',args:[] as unknown[]};
  return{clause:`(${scope.campuses.map(()=>`(${alias}.school_id=? AND ${alias}.campus_id=?)`).join(' OR ')})`,args:scope.campuses.flatMap(c=>[c.schoolId,c.campusId]) as unknown[]};
}
