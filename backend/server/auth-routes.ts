import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { clearSession,createSession,hashPassword,requireAuth,type AuthedRequest,verifyPassword } from './auth.js';
import { one,publicUser,run } from './db.js';
import { mailConfigured,sendPasswordResetCode,sendVerificationCode } from './mail.js';
import { cleanText,consumeRateLimit,hashToken,isCampusEmail,normalizeEmail,SESSION_COOKIE,safeEqual,validEmail } from './security.js';
import { getRewardSettings } from './settings.js';
import { grantCurrency } from './wallet.js';

export const authRouter=Router();
const rateKey=(req:AuthedRequest,action:string)=>`${action}:${req.ip||req.socket.remoteAddress||'unknown'}`;

authRouter.get('/me',(req:AuthedRequest,res)=>res.json({user:req.user||null,emailConfigured:mailConfigured()}));

authRouter.post('/email-code',async(req:AuthedRequest,res,next)=>{try{
  if(!consumeRateLimit(rateKey(req,'email-code'),5,60*60_000))return res.status(429).json({error:'验证码发送过于频繁，请一小时后再试'});
  const email=normalizeEmail(req.body.email);if(!validEmail(email))return res.status(400).json({error:'请输入有效邮箱地址'});
  if(!mailConfigured())return res.status(503).json({error:'邮件服务尚未配置'});
  // 已注册邮箱不发送注册验证码，但统一返回成功，避免暴露邮箱是否已注册
  const registered=await one('SELECT id FROM users WHERE email=?',[email]);
  if(!registered){
    const code=String(randomInt(100000,1000000));
    await run(`INSERT INTO email_codes (email,code_hash,expires_at,attempts) VALUES (?,?,?,0)
      ON DUPLICATE KEY UPDATE code_hash=VALUES(code_hash),expires_at=VALUES(expires_at),attempts=0,created_at=CURRENT_TIMESTAMP`,[email,hashToken(code),Date.now()+10*60_000]);
    await sendVerificationCode(email,code);
  }
  res.json({ok:true});
}catch(e){next(e)}});

authRouter.post('/register',async(req:AuthedRequest,res,next)=>{try{
  if(!consumeRateLimit(rateKey(req,'register'),6))return res.status(429).json({error:'操作过于频繁，请稍后再试'});
  const email=normalizeEmail(req.body.email),password=String(req.body.password||''),nickname=cleanText(req.body.nickname,24),code=cleanText(req.body.code,6),emailNotifications=req.body.emailMessageNotifications!==false;
  if(!validEmail(email))return res.status(400).json({error:'请输入有效邮箱地址'});
  if(password.length<8||password.length>72)return res.status(400).json({error:'密码需为 8–72 个字符'});
  if(nickname.length<2)return res.status(400).json({error:'昵称至少需要 2 个字符'});
  if(await one('SELECT id FROM users WHERE email=?',[email]))return res.status(400).json({error:'邮箱验证码无效或已过期'});
  const verification=await one('SELECT * FROM email_codes WHERE email=?',[email]);
  if(!verification||Number(verification.expires_at)<Date.now()||Number(verification.attempts)>=5||!safeEqual(String(verification.code_hash),hashToken(code))){
    if(verification)await run('UPDATE email_codes SET attempts=attempts+1 WHERE email=?',[email]);
    return res.status(400).json({error:'邮箱验证码无效或已过期'});
  }
  const result=await run(`INSERT INTO users (email,password_hash,nickname,school_id,verified,email_verified,email_message_notifications) VALUES (?,?,?,'ruc_suzhou',1,1,?)`,[email,await hashPassword(password),nickname,emailNotifications?1:0]);
  await run('DELETE FROM email_codes WHERE email=?',[email]);
  await createSession(res,result.insertId);
  await grantSignupReward(result.insertId,email);
  const user=await one('SELECT * FROM users WHERE id=?',[result.insertId]); res.status(201).json({user:publicUser(user)});
}catch(e){next(e)}});

authRouter.post('/login',async(req:AuthedRequest,res,next)=>{try{
  if(!consumeRateLimit(rateKey(req,'login'),10))return res.status(429).json({error:'登录尝试过多，请稍后再试'});
  const row=await one('SELECT * FROM users WHERE email=?',[normalizeEmail(req.body.email)]); const password=String(req.body.password||'');
  if(!row?.password_hash||!(await verifyPassword(password,String(row.password_hash))))return res.status(401).json({error:'邮箱或密码不正确'});
  await createSession(res,Number(row.id)); res.json({user:publicUser(row)});
}catch(e){next(e)}});

authRouter.post('/logout',async(req,res,next)=>{try{await clearSession(req,res);res.json({ok:true})}catch(e){next(e)}});

authRouter.post('/change-password',requireAuth,async(req:AuthedRequest,res,next)=>{try{
  const current=String(req.body.currentPassword||''),nextPassword=String(req.body.newPassword||'');
  if(nextPassword.length<8||nextPassword.length>72)return res.status(400).json({error:'新密码需为 8–72 个字符'});
  const row=await one('SELECT password_hash FROM users WHERE id=?',[req.user!.id]);
  if(!row?.password_hash||!(await verifyPassword(current,String(row.password_hash))))return res.status(400).json({error:'当前密码不正确'});
  await run('UPDATE users SET password_hash=? WHERE id=?',[await hashPassword(nextPassword),req.user!.id]);
  // 吊销除当前会话外的所有会话，防止被盗设备继续使用旧会话
  const currentToken=req.cookies?.[SESSION_COOKIE];
  if(currentToken)await run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?',[req.user!.id,hashToken(currentToken)]);
  res.json({ok:true});
}catch(e){next(e)}});

authRouter.post('/forgot-password',async(req:AuthedRequest,res,next)=>{try{
  if(!consumeRateLimit(rateKey(req,'forgot-password'),5,60*60_000))return res.status(429).json({error:'验证码发送过于频繁，请一小时后再试'});
  const email=normalizeEmail(req.body.email);if(!validEmail(email))return res.status(400).json({error:'请输入有效邮箱地址'});
  if(!mailConfigured())return res.status(503).json({error:'邮件服务尚未配置'});
  const user=await one('SELECT id FROM users WHERE email=?',[email]);
  // 统一返回成功，不区分邮箱是否注册，避免枚举
  if(user){
    const code=String(randomInt(100000,1000000));
    await run(`INSERT INTO email_codes (email,code_hash,expires_at,attempts,purpose) VALUES (?,?,?,0,'reset')
      ON DUPLICATE KEY UPDATE code_hash=VALUES(code_hash),expires_at=VALUES(expires_at),attempts=0,purpose='reset',created_at=CURRENT_TIMESTAMP`,[email,hashToken(code),Date.now()+10*60_000]);
    await sendPasswordResetCode(email,code);
  }
  res.json({ok:true});
}catch(e){next(e)}});

authRouter.post('/reset-password',async(req:AuthedRequest,res,next)=>{try{
  if(!consumeRateLimit(rateKey(req,'reset-password'),10))return res.status(429).json({error:'操作过于频繁，请稍后再试'});
  const email=normalizeEmail(req.body.email),code=cleanText(req.body.code,6),password=String(req.body.password||'');
  if(!validEmail(email))return res.status(400).json({error:'请输入有效邮箱地址'});
  if(password.length<8||password.length>72)return res.status(400).json({error:'新密码需为 8–72 个字符'});
  const verification=await one('SELECT * FROM email_codes WHERE email=? AND purpose=?',[email,'reset']);
  if(!verification||Number(verification.expires_at)<Date.now()||Number(verification.attempts)>=5||!safeEqual(String(verification.code_hash),hashToken(code))){
    if(verification)await run('UPDATE email_codes SET attempts=attempts+1 WHERE email=?',[email]);
    return res.status(400).json({error:'邮箱验证码无效或已过期'});
  }
  const user=await one('SELECT id FROM users WHERE email=?',[email]);
  if(!user)return res.status(400).json({error:'邮箱验证码无效或已过期'});
  await run('UPDATE users SET password_hash=? WHERE id=?',[await hashPassword(password),Number(user.id)]);
  await run('DELETE FROM email_codes WHERE email=?',[email]);
  // 密码重置后吊销所有会话，强制重新登录
  await run('DELETE FROM sessions WHERE user_id=?',[Number(user.id)]);
  res.json({ok:true});
}catch(e){next(e)}});

async function grantSignupReward(userId:number,email:string){
  try{
    const settings=await getRewardSettings();
    if(!settings.signupEnabled)return;
    if(settings.signupCampusOnly&&!isCampusEmail(email))return;
    const operator='系统';
    for(const currency of ['lungmen','originium'] as const){
      const amount=settings.signupBonus[currency];
      if(amount>0)await grantCurrency({userId,currency,amount,reason:'注册奖励',operator});
    }
  }catch(error){console.error('Signup reward failed:',error)}
}
