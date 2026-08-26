import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, hashToken, isAllowedOrigin, isCampusEmail, normalizeEmail, safeEqual, validEmail, validPrice } from '../server/security.js';
import {canonicalPair,itemCardSnapshot,shouldSendItemCard} from '../server/conversations.js';
import {adminCommentEmail,adminFeedbackEmail,newMessageEmail,publicAppBase,senderAddress} from '../server/mail.js';
import {formatTimestamp,parseTimestamp} from '../../frontend/src/time.js';
import {validImageSignature} from '../server/storage.js';
import {avatarCropGeometry,clampCropOffset} from '../../frontend/src/avatar-crop.js';
import {publicSellerProfile} from '../server/profiles.js';

test('session token hashes are deterministic and timing-safe comparable',()=>{
  const hash=hashToken('a-secret-session-token');
  assert.equal(hash.length,64);assert.equal(safeEqual(hash,hashToken('a-secret-session-token')),true);assert.equal(safeEqual(hash,hashToken('different')),false);
});

test('email and item inputs are normalized and bounded',()=>{
  assert.equal(normalizeEmail('  Student@RUC.EDU.CN '),'student@ruc.edu.cn');assert.equal(validEmail('student@ruc.edu.cn'),true);assert.equal(validEmail('not-an-email'),false);
  assert.equal(cleanText('  hello  ',20),'hello');assert.equal(cleanText('abcdef',3),'abc');assert.equal(validPrice('12.345'),12.35);assert.equal(validPrice('-1'),null);
});

test('state-changing origins are restricted to configured app origins',()=>{
  assert.equal(isAllowedOrigin('https://market.example.com','https://market.example.com'),true);assert.equal(isAllowedOrigin('https://evil.example','https://market.example.com'),false);assert.equal(isAllowedOrigin(undefined,'https://market.example.com'),true);
});

test('campus privileges require an exact RUC email domain',()=>{
  assert.equal(isCampusEmail('student@ruc.edu.cn'),true);
  assert.equal(isCampusEmail(' STUDENT@RUC.EDU.CN '),true);
  assert.equal(isCampusEmail('student@mail.ruc.edu.cn'),false);
  assert.equal(isCampusEmail('student@ruc.edu.cn.example.com'),false);
  assert.equal(isCampusEmail('student@qq.com'),false);
});

test('conversations are unique per pair and repeated item cards are skipped',()=>{
  assert.deepEqual(canonicalPair(9,3),[3,9]);
  assert.equal(shouldSendItemCard(18,18),false);
  assert.equal(shouldSendItemCard(17,18),true);
  assert.equal(shouldSendItemCard(17,18,true),false);
  assert.deepEqual(itemCardSnapshot({id:18,title:'教材',price:20,images:'["cover.jpg"]',item_condition:'九成新',status:'在售'}),{id:18,title:'教材',price:20,currency:'cny',rmbPrice:null,image:'cover.jpg',condition:'九成新',status:'在售'});
});

test('new message email is branded and escapes user content',()=>{
  const email=newMessageEmail('<同学>','你好 <script>alert(1)</script>','https://example.com/messages/1');
  assert.match(email.html,/校园闲置/);
  assert.match(email.html,/&lt;同学&gt;/);
  assert.doesNotMatch(email.html,/<script>/);
  assert.match(email.html,/打开会话并回复/);
  assert.match(email.html,/我的 → 编辑资料/);
  assert.match(email.html,/管理邮件提醒设置/);
  assert.match(email.html,/https:\/\/example\.com\/profile/);
  assert.match(email.text,/关闭“接收新消息邮件提醒”/);
});

test('all system emails use the campus assistant sender name',()=>{
  assert.equal(senderAddress('123456@qq.com'),'校园交易小助手 <123456@qq.com>');
  assert.equal(senderAddress('旧名称 <123456@qq.com>'),'校园交易小助手 <123456@qq.com>');
});

test('email links include the deployed application base path',()=>{
  const base=publicAppBase('https://20250821cdcdifc.top','/campus-trade/');
  assert.equal(base,'https://20250821cdcdifc.top/campus-trade');
  const email=newMessageEmail('同学','测试',`${base}/messages/42`,`${base}/profile`);
  assert.match(email.html,/https:\/\/20250821cdcdifc\.top\/campus-trade\/messages\/42/);
  assert.match(email.html,/https:\/\/20250821cdcdifc\.top\/campus-trade\/profile/);
});

test('admin notification emails escape content and protect commenter privacy',()=>{
  const comment=adminCommentEmail('<同学>','测试商品','评论 <script>alert(1)</script>','https://example.com/campus-trade/items/7');
  assert.match(comment.html,/&lt;同学&gt;/);assert.doesNotMatch(comment.html,/<script>/);assert.match(comment.html,/不包含评论者邮箱/);assert.match(comment.html,/campus-trade\/items\/7/);
  const feedback=adminFeedbackEmail('同学','student@ruc.edu.cn','功能建议','建议 <b>改进</b>');
  assert.match(feedback.html,/student@ruc\.edu\.cn/);assert.match(feedback.html,/&lt;b&gt;改进&lt;\/b&gt;/);assert.doesNotMatch(feedback.html,/<b>改进<\/b>/);
});

test('timestamps support ISO and the previous server date format',()=>{
  const now=Date.parse('2026-08-09T16:00:00Z');
  assert.equal(formatTimestamp('2026-08-09T15:59:30Z',now),'刚刚');
  assert.equal(formatTimestamp('2026-08-09T15:30:00Z',now),'30 分钟前');
  assert.equal(formatTimestamp('2026-08-09T12:00:00Z',now),'昨天 20:00');
  assert.ok(parseTimestamp('Sun Aug 09 2026 23:47:34 GMT+0800 (China Standard Time)'));
  assert.equal(formatTimestamp('not-a-date',now),'时间未知');
});

test('avatar uploads require a real supported image signature',()=>{
  assert.equal(validImageSignature(Buffer.from('89504e470d0a1a0a00000000','hex')),true);
  assert.equal(validImageSignature(Buffer.from('plain text pretending to be an image')),false);
});

test('avatar crop geometry stays square and clamps dragging',()=>{
  const crop=avatarCropGeometry(1000,500,280,1,0,0);
  assert.ok(Math.abs(crop.sourceX-250)<0.001);assert.ok(Math.abs(crop.sourceY)<0.001);assert.ok(Math.abs(crop.sourceSize-500)<0.001);
  assert.deepEqual(clampCropOffset(1000,500,280,1,999,999),{x:140,y:0});
});

test('public seller profiles expose only privacy-safe fields',()=>{
  const profile=publicSellerProfile({id:7,username:'12345678',nickname:'同学',avatar_url:'avatar.jpg',email:'student@ruc.edu.cn',email_verified:1,school_id:'ruc',campus_id:'suzhou',wechat_id:'private',last_seen_at:'private',password_hash:'private'});
  assert.deepEqual(profile,{id:7,username:'12345678',nickname:'同学',avatarUrl:'avatar.jpg',schoolId:'ruc',campusId:'suzhou',schoolName:'中国人民大学',campusName:'苏州校区',campusVerified:true});
  assert.deepEqual(Object.keys(profile),['id','username','nickname','avatarUrl','schoolId','campusId','schoolName','campusName','campusVerified']);
});
