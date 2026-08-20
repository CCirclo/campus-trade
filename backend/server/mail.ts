import nodemailer from 'nodemailer';

export function mailConfigured(){ return Boolean(process.env.EMAIL_HOST_USER&&process.env.EMAIL_HOST_PASSWORD); }

function transporter(){return nodemailer.createTransport({
  host:process.env.EMAIL_HOST||'smtp.qq.com',port:Number(process.env.EMAIL_PORT)||465,
  secure:process.env.EMAIL_SECURE!=='false',auth:{user:process.env.EMAIL_HOST_USER,pass:process.env.EMAIL_HOST_PASSWORD},
});}

function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));}

export function senderAddress(configured=process.env.DEFAULT_FROM_EMAIL||process.env.EMAIL_HOST_USER||''){
  const clean=configured.replace(/[\r\n]+/g,' ').trim(),bracketed=clean.match(/<([^<>]+)>/),address=(bracketed?.[1]||clean).trim();
  return `校园交易小助手 <${address}>`;
}

export function publicAppBase(origin=process.env.APP_ORIGIN||'http://localhost:5173',basePath=process.env.VITE_BASE_PATH||'/'){
  const url=new URL(origin),currentPath=url.pathname.replace(/\/$/,'');
  if(!currentPath){const cleanBase=basePath.replace(/^\/+|\/+$/g,'');url.pathname=cleanBase?`/${cleanBase}`:'/';}
  return url.toString().replace(/\/$/,'');
}

export async function sendVerificationCode(email:string,code:string){
  if(!mailConfigured()) throw new Error('EMAIL_NOT_CONFIGURED');
  await transporter().sendMail({
    from:senderAddress(),to:email,
    subject:'校园闲置注册验证码',
    text:`你的校园闲置验证码是：${code}。10 分钟内有效，请勿转发给他人。`,
    html:`<div style="font-family:system-ui;padding:24px;color:#1f2937"><h2>校园闲置</h2><p>你的注册验证码是：</p><p style="font-size:30px;font-weight:800;letter-spacing:8px;color:#2563eb">${code}</p><p>验证码 10 分钟内有效，请勿转发给他人。</p></div>`,
  });
}
export async function sendPasswordResetCode(email:string,code:string){
  if(!mailConfigured()) throw new Error('EMAIL_NOT_CONFIGURED');
  await transporter().sendMail({
    from:senderAddress(),to:email,
    subject:'校园闲置密码重置验证码',
    text:`你的密码重置验证码是：${code}。10 分钟内有效，请勿转发给他人。如果你没有申请重置密码，可以忽略本邮件。`,
    html:`<div style="font-family:system-ui;padding:24px;color:#1f2937"><h2>校园闲置</h2><p>你的密码重置验证码是：</p><p style="font-size:30px;font-weight:800;letter-spacing:8px;color:#2563eb">${code}</p><p>验证码 10 分钟内有效，请勿转发给他人。</p><p style="color:#9ca3af;font-size:13px">如果你没有申请重置密码，可以忽略本邮件，你的账号不会受到影响。</p></div>`,
  });
}
export function newMessageEmail(senderName:string,message:string,conversationUrl:string,settingsUrlOverride?:string){
  const displaySender=senderName.replace(/[\r\n]+/g,' ').trim().slice(0,24)||'校园同学',safeSender=escapeHtml(displaySender),safeInitial=escapeHtml(Array.from(displaySender)[0]||'同'),excerpt=message.trim().slice(0,160),safeMessage=escapeHtml(excerpt),safeUrl=escapeHtml(conversationUrl);
  let settingsUrl=settingsUrlOverride||conversationUrl;if(!settingsUrlOverride)try{settingsUrl=new URL('../profile',conversationUrl).toString()}catch{}const safeSettingsUrl=escapeHtml(settingsUrl);
  return {
    subject:`${displaySender} 给你发来一条校园闲置消息`,
    text:`${displaySender} 给你发来新消息：${excerpt}\n\n打开会话：${conversationUrl}\n\n为了交易安全，请勿提前支付押金或点击陌生付款链接。\n\n不想继续接收此类邮件？登录校园闲置，进入“我的 → 编辑资料”，关闭“接收新消息邮件提醒”。设置地址：${settingsUrl}`,
    html:`<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>校园闲置新消息</title></head><body style="margin:0;background:#eef3f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',Arial,sans-serif;color:#172033"><div style="display:none;max-height:0;overflow:hidden;color:transparent">${safeSender} 给你发来一条新消息，打开校园闲置查看并回复。</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#eef3f9"><tr><td align="center" style="padding:32px 10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:580px;overflow:hidden;border:1px solid #dfe7f2;border-radius:24px;background:#ffffff;box-shadow:0 18px 50px rgba(31,48,77,.10)"><tr><td style="padding:25px 28px;background:#1f5bd8;background:linear-gradient(135deg,#1746a2,#2563eb 65%,#4b82ef);color:#ffffff"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="width:42px;height:42px;border-radius:13px;background:#ffffff;color:#2563eb;text-align:center;font-size:20px;font-weight:900">集</td><td style="padding-left:12px"><div style="font-size:18px;font-weight:800;letter-spacing:.5px">校园闲置</div><div style="margin-top:3px;color:#dbe8ff;font-size:11px">同校好物 · 安心沟通</div></td></tr></table></td><td align="right"><span style="display:inline-block;padding:7px 10px;border:1px solid rgba(255,255,255,.25);border-radius:999px;background:rgba(255,255,255,.12);font-size:10px;font-weight:700">新消息</span></td></tr></table></td></tr><tr><td style="padding:30px 28px 28px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="width:48px;height:48px;border-radius:50%;background:#e8f0ff;color:#245dcc;text-align:center;font-size:20px;font-weight:850">${safeInitial}</td><td style="padding-left:13px"><div style="color:#7a8798;font-size:11px;letter-spacing:.5px">来自校园同学</div><div style="margin-top:3px;font-size:18px;font-weight:800">${safeSender}</div></td></tr></table><h1 style="margin:24px 0 13px;font-size:22px;line-height:1.45;letter-spacing:-.4px">你收到一条新消息</h1><div style="position:relative;padding:18px 19px;border:1px solid #e6ebf3;border-radius:5px 17px 17px 17px;background:#f7f9fc;color:#3d4859;font-size:15px;line-height:1.75;word-break:break-word">${safeMessage}</div><a href="${safeUrl}" style="display:block;margin-top:22px;padding:15px 20px;border-radius:13px;background:#2563eb;color:#ffffff;text-align:center;text-decoration:none;font-size:14px;font-weight:800;box-shadow:0 8px 20px rgba(37,99,235,.22)">打开会话并回复&nbsp; →</a><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;border-radius:14px;background:#fff8e8"><tr><td style="width:38px;padding:15px 0 15px 15px;color:#d27a08;font-size:20px;vertical-align:top">⚠</td><td style="padding:15px 15px 15px 8px;color:#815710;font-size:12px;line-height:1.7"><strong>安全交易提醒</strong><br>建议在校内公共区域当面验货，不提前支付押金，不点击陌生付款链接。</td></tr></table></td></tr><tr><td style="padding:22px 28px;border-top:1px solid #edf1f6;background:#fafbfd"><div style="color:#657185;font-size:12px;font-weight:750">不想继续收到新消息邮件？</div><div style="margin-top:6px;color:#8a95a5;font-size:11px;line-height:1.75">登录校园闲置，依次进入 <strong style="color:#596578">我的 → 编辑资料</strong>，关闭“接收新消息邮件提醒”。站内未读提醒不会受到影响。</div><a href="${safeSettingsUrl}" style="display:inline-block;margin-top:12px;color:#2563eb;font-size:11px;font-weight:750;text-decoration:none">管理邮件提醒设置 →</a></td></tr><tr><td align="center" style="padding:17px 24px;color:#a0a9b6;font-size:10px;line-height:1.6">此邮件由校园闲置自动发送，请勿直接回复邮件。<br>中国人民大学苏州校区校园交易平台</td></tr></table></td></tr></table></body></html>`,
  };
}

export async function sendNewMessageNotification(email:string,senderName:string,message:string,conversationId:number){
  if(!mailConfigured())return;
  const base=publicAppBase();
  const content=newMessageEmail(senderName,message,`${base}/messages/${conversationId}`,`${base}/profile`);
  await transporter().sendMail({from:senderAddress(),to:email,...content});
}

export function adminCommentEmail(commenterName:string,itemTitle:string,comment:string,itemUrl:string){
  const safeName=escapeHtml(commenterName),safeTitle=escapeHtml(itemTitle),safeComment=escapeHtml(comment.slice(0,200)),safeUrl=escapeHtml(itemUrl);
  return {subject:`新评论提醒 · ${itemTitle.slice(0,36)}`,text:`${commenterName} 评论了商品“${itemTitle}”：\n${comment}\n\n查看商品：${itemUrl}`,html:`<!doctype html><html lang="zh-CN"><body style="margin:0;background:#eef3f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 10px;background:#eef3f9"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;overflow:hidden;border:1px solid #dfe7f2;border-radius:20px;background:#fff"><tr><td style="padding:22px 26px;background:#1f5bd8;color:#fff"><div style="font-size:11px;letter-spacing:1.5px;opacity:.8">CAMPUS MARKET</div><div style="margin-top:5px;font-size:21px;font-weight:800">收到一条新评论</div></td></tr><tr><td style="padding:26px"><div style="color:#778397;font-size:12px">评论商品</div><h1 style="margin:5px 0 18px;font-size:19px">${safeTitle}</h1><div style="margin-bottom:8px;color:#526071;font-size:12px"><strong>${safeName}</strong> 说：</div><div style="padding:16px;border-left:4px solid #2563eb;border-radius:4px 13px 13px 4px;background:#f6f8fc;color:#3d4859;font-size:14px;line-height:1.7;word-break:break-word">${safeComment}</div><a href="${safeUrl}" style="display:block;margin-top:20px;padding:13px 18px;border-radius:12px;background:#2563eb;color:#fff;text-align:center;text-decoration:none;font-size:13px;font-weight:750">查看商品与评论</a><p style="margin:18px 0 0;color:#98a1af;font-size:10px;line-height:1.6">为保护用户隐私，本邮件不包含评论者邮箱、微信号或在线状态。</p></td></tr></table></td></tr></table></body></html>`};
}

export function adminFeedbackEmail(nickname:string,userEmail:string,type:string,content:string){
  const safeName=escapeHtml(nickname),safeEmail=escapeHtml(userEmail),safeType=escapeHtml(type),safeContent=escapeHtml(content.slice(0,1000));
  return {subject:`用户${type} · ${nickname.slice(0,24)}`,text:`用户：${nickname} (${userEmail})\n类型：${type}\n\n${content}`,html:`<!doctype html><html lang="zh-CN"><body style="margin:0;background:#eef3f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 10px;background:#eef3f9"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid #dfe7f2;border-radius:20px;background:#fff"><tr><td style="padding:22px 26px;background:#1746a2;color:#fff"><div style="font-size:21px;font-weight:800">收到用户反馈</div><div style="margin-top:5px;font-size:11px;opacity:.8">校园交易小助手</div></td></tr><tr><td style="padding:26px"><span style="display:inline-block;padding:6px 10px;border-radius:999px;background:#eaf2ff;color:#2563eb;font-size:11px;font-weight:750">${safeType}</span><p style="margin:16px 0 4px;color:#526071;font-size:12px">${safeName} · ${safeEmail}</p><div style="margin-top:12px;padding:17px;border-radius:13px;background:#f6f8fc;color:#3d4859;font-size:14px;line-height:1.75;white-space:pre-wrap;word-break:break-word">${safeContent}</div><p style="margin:18px 0 0;color:#98a1af;font-size:10px">用户提交反馈时已知悉邮箱仅用于必要的反馈跟进。</p></td></tr></table></td></tr></table></body></html>`};
}

export async function sendAdminCommentNotification(commenterName:string,itemTitle:string,comment:string,itemId:number){const email=process.env.ADMIN_NOTIFICATION_EMAIL;if(!email||!mailConfigured())return false;const base=publicAppBase();await transporter().sendMail({from:senderAddress(),to:email,...adminCommentEmail(commenterName,itemTitle,comment,`${base}/items/${itemId}`)});return true;}
export async function sendAdminFeedbackNotification(nickname:string,userEmail:string,type:string,content:string){const email=process.env.ADMIN_NOTIFICATION_EMAIL;if(!email||!mailConfigured())return false;await transporter().sendMail({from:senderAddress(),to:email,...adminFeedbackEmail(nickname,userEmail,type,content)});return true;}
