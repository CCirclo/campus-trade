import {isCampusEmail} from './security.js';

export function publicSellerProfile(row:Record<string,unknown>){
  return {
    id:Number(row.id),
    nickname:String(row.nickname||'校园同学'),
    avatarUrl:String(row.avatar_url||''),
    campusVerified:Boolean(row.email_verified)&&isCampusEmail(row.email),
  };
}
