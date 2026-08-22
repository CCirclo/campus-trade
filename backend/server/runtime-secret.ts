import {createHash,randomBytes} from 'node:crypto';
import {one,run} from './db.js';

const values=new Map<string,string>();
const definitions=[['analytics','ANALYTICS_HASH_SECRET'],['cursor','CURSOR_SIGNING_SECRET']] as const;

export async function initRuntimeSecrets(env:Record<string,string|undefined>=process.env){
  for(const [purpose,environmentName] of definitions){
    const explicit=env[environmentName]||'';
    if(explicit.length>=32){values.set(purpose,explicit);continue}
    if(env.NODE_ENV!=='production'){values.set(purpose,createHash('sha256').update(`campus-market:development:${purpose}`).digest('hex'));continue}
    await run('INSERT IGNORE INTO runtime_secrets (secret_name,secret_value) VALUES (?,?)',[purpose,randomBytes(32).toString('hex')]);
    const row=await one('SELECT secret_value FROM runtime_secrets WHERE secret_name=?',[purpose]),value=String(row?.secret_value||'');
    if(value.length<64)throw new Error(`无法初始化 ${environmentName}`);values.set(purpose,value);
  }
}

export function runtimeSecret(purpose:'analytics'|'cursor'){
  const value=values.get(purpose);
  if(value)return value;
  if(process.env.NODE_ENV==='production')throw new Error(`运行时密钥 ${purpose} 尚未初始化`);
  return createHash('sha256').update(`campus-market:development:${purpose}`).digest('hex');
}
