import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { one, publicUser, run } from './db.js';
import { hashToken, randomToken, SESSION_COOKIE } from './security.js';

export type AuthUser = NonNullable<ReturnType<typeof publicUser>>;
export type AuthedRequest = Request & { user?: AuthUser };
const sessionDays = Math.max(1, Number(process.env.SESSION_DAYS) || 30);

export async function createSession(res: Response, userId: number) {
  const token = randomToken();
  const expiresAt = Date.now() + sessionDays * 86_400_000;
  await run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
  await run('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)', [hashToken(token),userId,expiresAt]);
  res.cookie(SESSION_COOKIE,token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:sessionDays*86_400_000,path:'/'});
}

export async function clearSession(req: Request, res: Response) {
  const token=req.cookies?.[SESSION_COOKIE]; if(token) await run('DELETE FROM sessions WHERE token_hash=?',[hashToken(token)]);
  res.clearCookie(SESSION_COOKIE,{path:'/'});
}

export async function optionalAuth(req: AuthedRequest,_res:Response,next:NextFunction){
  try {
    const token=req.cookies?.[SESSION_COOKIE]; if(!token) return next();
    const row=await one(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`,[hashToken(token),Date.now()]);
    if(row){req.user=publicUser(row)!;void run(`UPDATE users SET last_seen_at=CURRENT_TIMESTAMP WHERE id=? AND (last_seen_at IS NULL OR last_seen_at<DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 1 MINUTE))`,[row.id]).catch(()=>{});}next();
  } catch(error){ next(error); }
}

export function requireAuth(req:AuthedRequest,res:Response,next:NextFunction){ if(!req.user)return res.status(401).json({error:'请先登录后继续'}); next(); }
export function requireCampus(req:AuthedRequest,res:Response,next:NextFunction){
  if(!req.user)return res.status(401).json({error:'请先登录后继续'});
  if(!req.user.campusVerified)return res.status(403).json({error:'你不是校园认证用户。只有通过 @ruc.edu.cn 邮箱验证的账号才能进行此操作。',code:'CAMPUS_EMAIL_REQUIRED'});
  next();
}
export const hashPassword=(password:string)=>bcrypt.hash(password,12);
export const verifyPassword=(password:string,passwordHash:string)=>bcrypt.compare(password,passwordHash);
