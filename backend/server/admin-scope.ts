import {all} from './db.js';
import {isSuperAdminEmail} from './admin-permissions.js';

export type CampusScope={schoolId:string;campusId:string};
export type AdminScope={isSuperAdmin:boolean;campuses:CampusScope[]};

export async function loadAdminScope(user:{id:number;email:string;schoolId:string;campusId:string;role?:string}):Promise<AdminScope>{
  if(isSuperAdminEmail(user.email))return{isSuperAdmin:true,campuses:[]};
  const rows=await all('SELECT school_id,campus_id FROM campus_admins WHERE user_id=?',[user.id]);
  if(rows.length)return{isSuperAdmin:false,campuses:rows.map(r=>({schoolId:String(r.school_id),campusId:String(r.campus_id)}))};
  // 无显式校区授权、但拥有管理员身份时，默认管理其所属学校的全部校区（管理页默认全校区视图）。
  if(user.role==='admin'){
    const campuses=await all('SELECT id FROM campuses WHERE school_id=? AND active=1 ORDER BY created_at,id',[user.schoolId]);
    return{isSuperAdmin:false,campuses:campuses.map(c=>({schoolId:user.schoolId,campusId:String(c.id)}))};
  }
  return{isSuperAdmin:false,campuses:[{schoolId:user.schoolId,campusId:user.campusId}]};
}

export function canAccessCampus(scope:AdminScope,schoolId:unknown,campusId:unknown){
  return scope.isSuperAdmin||scope.campuses.some(c=>c.schoolId===String(schoolId||'')&&c.campusId===String(campusId||''));
}

export function campusSql(alias:string,scope:AdminScope){
  if(scope.isSuperAdmin)return{clause:'',args:[] as unknown[]};
  if(!scope.campuses.length)return{clause:'1=0',args:[] as unknown[]};
  return{clause:`(${scope.campuses.map(()=>`(${alias}.school_id=? AND ${alias}.campus_id=?)`).join(' OR ')})`,args:scope.campuses.flatMap(c=>[c.schoolId,c.campusId]) as unknown[]};
}
