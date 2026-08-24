import COS from 'cos-nodejs-sdk-v5';
import { randomUUID } from 'node:crypto';

export function cosConfigured(){return Boolean(process.env.COS_SECRET_ID&&process.env.COS_SECRET_KEY&&process.env.COS_BUCKET&&process.env.COS_REGION)}

export async function uploadToCos(file:Express.Multer.File,folder:'items'|'avatars'='items'){
  if(!cosConfigured()) throw new Error('COS_NOT_CONFIGURED');
  const cos=new COS({SecretId:process.env.COS_SECRET_ID!,SecretKey:process.env.COS_SECRET_KEY!});
  const extension=file.mimetype==='image/png'?'png':file.mimetype==='image/webp'?'webp':file.mimetype==='image/gif'?'gif':'jpg';
  const key=`campus-market/${folder}/${new Date().toISOString().slice(0,7)}/${randomUUID()}.${extension}`;
  await new Promise<void>((resolve,reject)=>cos.putObject({Bucket:process.env.COS_BUCKET!,Region:process.env.COS_REGION!,Key:key,Body:file.buffer,ContentType:file.mimetype},error=>error?reject(error):resolve()));
  const publicBase=process.env.COS_PUBLIC_BASE_URL?.replace(/\/$/,'');
  if(publicBase)return `${publicBase}/${key}`;
  return `/api/media/${Buffer.from(key).toString('base64url')}`;
}

export async function uploadPrivateEvidence(file:Express.Multer.File){
  if(!cosConfigured())throw new Error('COS_NOT_CONFIGURED');
  const cos=new COS({SecretId:process.env.COS_SECRET_ID!,SecretKey:process.env.COS_SECRET_KEY!});
  const extension=file.mimetype==='application/pdf'?'pdf':file.mimetype==='image/png'?'png':file.mimetype==='image/webp'?'webp':'jpg';
  const key=`campus-market/verification/${new Date().toISOString().slice(0,7)}/${randomUUID()}.${extension}`;
  await new Promise<void>((resolve,reject)=>cos.putObject({Bucket:process.env.COS_BUCKET!,Region:process.env.COS_REGION!,Key:key,Body:file.buffer,ContentType:file.mimetype},error=>error?reject(error):resolve()));
  return key;
}

export function decodeObjectKey(token:string){
  try{const key=Buffer.from(token,'base64url').toString('utf8');return key.startsWith('campus-market/')&&key.length<500?key:null}catch{return null}
}

export async function signedObjectUrl(key:string){
  if(!cosConfigured())throw new Error('COS_NOT_CONFIGURED');
  const cos=new COS({SecretId:process.env.COS_SECRET_ID!,SecretKey:process.env.COS_SECRET_KEY!});
  return new Promise<string>((resolve,reject)=>cos.getObjectUrl({Bucket:process.env.COS_BUCKET!,Region:process.env.COS_REGION!,Key:key,Sign:true,Expires:15*60},(error,data)=>error?reject(error):resolve(data.Url)));
}

export function validImageSignature(buffer:Buffer){
  const bytes=buffer.subarray(0,12),hex=bytes.toString('hex');
  return hex.startsWith('ffd8ff')||hex.startsWith('89504e470d0a1a0a')||hex.startsWith('474946383761')||hex.startsWith('474946383961')||(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP');
}
