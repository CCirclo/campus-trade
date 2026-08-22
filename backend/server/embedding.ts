import {createHash} from 'node:crypto';
import {normalizeVector} from './vector-search.js';

export interface EmbeddingConfig{enabled:boolean;apiUrl:string;apiKey:string;model:string;modelVersion:string;dimensions:number;timeoutMs:number;batchSize:number;maxPending:number}
const number=(raw:string|undefined,fallback:number,min:number,max:number)=>{const value=Number(raw);return Number.isSafeInteger(value)&&value>=min&&value<=max?value:fallback};
export function embeddingConfig(env:Record<string,string|undefined>=process.env):EmbeddingConfig{return{enabled:env.EMBEDDING_ENABLED==='true',apiUrl:String(env.EMBEDDING_API_URL||''),apiKey:String(env.EMBEDDING_API_KEY||''),model:String(env.EMBEDDING_MODEL||'BAAI/bge-small-zh-v1.5'),modelVersion:String(env.EMBEDDING_MODEL_VERSION||'bge-small-zh-v1.5@1').slice(0,64),dimensions:number(env.EMBEDDING_DIMENSIONS,512,8,4096),timeoutMs:number(env.EMBEDDING_TIMEOUT_MS,5000,500,30_000),batchSize:1,maxPending:number(env.EMBEDDING_MAX_PENDING,8,0,32)}}
export function validateEmbeddingConfig(config:EmbeddingConfig){if(!config.enabled)return;let url:URL;try{url=new URL(config.apiUrl)}catch{throw new Error('EMBEDDING_API_URL 无效')}if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','::1'].includes(url.hostname)))throw new Error('Embedding 服务必须使用 HTTPS 或本机 HTTP');if(!config.modelVersion)throw new Error('EMBEDDING_MODEL_VERSION 不能为空')}
export function itemEmbeddingText(item:{title:unknown;category:unknown;item_condition?:unknown;condition?:unknown;description:unknown}){const clean=(value:unknown,max:number)=>String(value??'').normalize('NFKC').replace(/[\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max);return[`标题：${clean(item.title,80)}`,`分类：${clean(item.category,20)}`,`成色：${clean(item.item_condition??item.condition,20)}`,`描述：${clean(item.description,1200)}`].join('\n')}
export const embeddingContentHash=(text:string)=>createHash('sha256').update(text).digest('hex');

type Priority='search'|'upload';
type Waiter={resolve:()=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout};
let active=false;
const searchWaiters:Waiter[]=[],uploadWaiters:Waiter[]=[];
function nextWaiter(){return searchWaiters.shift()||uploadWaiters.shift()}
async function acquire(config:EmbeddingConfig,priority:Priority,waitIfBusy:boolean){
  if(!active){active=true;return}
  if(!waitIfBusy)throw new Error('Embedding 服务正忙');
  if(searchWaiters.length+uploadWaiters.length>=config.maxPending)throw new Error('Embedding 等待队列已满');
  await new Promise<void>((resolve,reject)=>{const queue=priority==='search'?searchWaiters:uploadWaiters;const waiter:Waiter={resolve,reject,timer:setTimeout(()=>{const index=queue.indexOf(waiter);if(index>=0)queue.splice(index,1);reject(new Error('Embedding 排队超时'))},config.timeoutMs)};queue.push(waiter)});
}
function release(){const next=nextWaiter();if(next){clearTimeout(next.timer);next.resolve()}else active=false}

export class EmbeddingClient{
  constructor(private readonly config:EmbeddingConfig,private readonly fetcher:typeof fetch=fetch){validateEmbeddingConfig(config)}
  async embed(inputs:readonly string[],options:{priority?:Priority;waitIfBusy?:boolean}={}){
    if(!this.config.enabled)throw new Error('Embedding 功能未启用');if(inputs.length!==1)throw new Error('Embedding 严格限制为单条处理');if(inputs.some(value=>!value||value.length>2000))throw new Error('Embedding 文本长度无效');
    await acquire(this.config,options.priority||'upload',options.waitIfBusy!==false);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.config.timeoutMs);
    try{const response=await this.fetcher(this.config.apiUrl,{method:'POST',headers:{'Content-Type':'application/json',...(this.config.apiKey?{Authorization:`Bearer ${this.config.apiKey}`}:{})},body:JSON.stringify({model:this.config.model,input:inputs}),signal:controller.signal});if(!response.ok)throw new Error(`Embedding 服务返回 ${response.status}`);const raw=await response.json() as {data?:Array<{embedding?:unknown}>};if(!Array.isArray(raw.data)||raw.data.length!==1)throw new Error('Embedding 响应数量不匹配');const row=raw.data[0];if(!Array.isArray(row.embedding)||row.embedding.length!==this.config.dimensions||row.embedding.some(value=>typeof value!=='number'||!Number.isFinite(value)))throw new Error('Embedding 响应维度无效');return[normalizeVector(row.embedding as number[])];}finally{clearTimeout(timer);release()}
  }
}
