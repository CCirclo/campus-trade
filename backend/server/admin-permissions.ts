import {normalizeEmail} from './security.js';

export const SUPER_ADMIN_EMAIL='2025202211@ruc.edu.cn';
export function isSuperAdminEmail(value:unknown){return normalizeEmail(value)===SUPER_ADMIN_EMAIL;}
export function canAccessSchool(isSuper:boolean,managedSchoolIds:readonly string[],schoolId:unknown){return isSuper||managedSchoolIds.includes(String(schoolId||''));}
