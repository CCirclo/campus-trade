import {campusScopeNames,migrateLegacyScope,schoolForEmail} from './campus-catalog.js';

export function publicSellerProfile(row:Record<string,unknown>){
  const scope=migrateLegacyScope(row.school_id,row.campus_id),names=campusScopeNames(scope.schoolId,scope.campusId);
  return {
    id:Number(row.id),
    nickname:String(row.nickname||'校园同学'),
    avatarUrl:String(row.avatar_url||''),
    schoolId:scope.schoolId,campusId:scope.campusId,...names,
    campusVerified:Boolean(row.admin_verified)||(Boolean(row.email_verified)&&schoolForEmail(row.email)?.id===scope.schoolId),
  };
}
