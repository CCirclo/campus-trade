import { createHash,createHmac } from 'node:crypto';

export const EVENT_TYPES = ['search_submit','item_impression','item_click','favorite_add','favorite_remove','conversation_start'] as const;
export const EVENT_SOURCES = ['home','search','item_detail','favorites'] as const;
export const MAX_EVENT_BATCH = 50;
export const EVENT_RETENTION_DAYS = 90;

export type EventType = typeof EVENT_TYPES[number];
export type EventSource = typeof EVENT_SOURCES[number];

export interface BehaviorEvent {
  eventId:string; requestId:string; sessionId:string; type:EventType; source:EventSource;
  itemId:number|null; queryHash:string|null; position:number|null; occurredAt:Date; algorithmVersion:string;
}

export type EventValidation = {ok:true;events:BehaviorEvent[]}|{ok:false;error:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEM_EVENTS=new Set<EventType>(['item_impression','item_click','favorite_add','favorite_remove','conversation_start']);

export function queryFingerprint(value:unknown){
  const normalized=String(value??'').normalize('NFKC').toLocaleLowerCase('zh-CN').trim().replace(/\s+/g,' ');
  if(!normalized||normalized.length>40)return null;
  const secret=process.env.ANALYTICS_HASH_SECRET||'development-query-hash-secret';return createHmac('sha256',secret).update(normalized).digest('hex');
}

export function impressionEventId(requestId:string,itemId:number){
  const bytes=createHash('sha256').update(`impression:${requestId}:${itemId}`).digest().subarray(0,16);
  bytes[6]=(bytes[6]&0x0f)|0x50;bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function validateEventBatch(input:unknown,now=new Date()):EventValidation{
  const body=input as {events?:unknown};
  if(!body||!Array.isArray(body.events)||body.events.length<1||body.events.length>MAX_EVENT_BATCH)return{ok:false,error:`events 必须包含 1–${MAX_EVENT_BATCH} 条记录`};
  const events:BehaviorEvent[]=[];
  for(const raw of body.events){
    if(!raw||typeof raw!=='object')return{ok:false,error:'事件格式无效'};
    const value=raw as Record<string,unknown>;
    const eventId=String(value.eventId??''),requestId=String(value.requestId??''),sessionId=String(value.sessionId??'');
    if(!UUID.test(eventId)||!UUID.test(requestId)||!UUID.test(sessionId))return{ok:false,error:'事件标识格式无效'};
    if(!EVENT_TYPES.includes(value.type as EventType)||!EVENT_SOURCES.includes(value.source as EventSource))return{ok:false,error:'事件类型或来源无效'};
    const type=value.type as EventType,source=value.source as EventSource;
    const algorithmVersion=String(value.algorithmVersion??'');
    if(!algorithmVersion||algorithmVersion.length>64||/[\u0000-\u001f]/.test(algorithmVersion))return{ok:false,error:'算法版本无效'};
    let itemId:number|null=null,position:number|null=null,queryHash:string|null=null;
    if(ITEM_EVENTS.has(type)){
      itemId=Number(value.itemId);if(!Number.isSafeInteger(itemId)||itemId<1)return{ok:false,error:'商品标识无效'};
    }
    if(type==='item_impression'||type==='item_click'){
      position=Number(value.position);if(!Number.isSafeInteger(position)||position<1||position>500)return{ok:false,error:'商品位置无效'};
    }
    if(type==='search_submit'){
      if(source!=='search')return{ok:false,error:'搜索事件来源无效'};
      queryHash=queryFingerprint(value.query);if(!queryHash)return{ok:false,error:'搜索词无效'};
    }
    const occurredAt=new Date(String(value.occurredAt??'')),delta=occurredAt.getTime()-now.getTime();
    if(Number.isNaN(occurredAt.getTime())||delta>5*60_000||delta< -7*86_400_000)return{ok:false,error:'事件时间无效'};
    events.push({eventId,requestId,sessionId,type,source,itemId,queryHash,position,occurredAt,algorithmVersion});
  }
  return{ok:true,events};
}
