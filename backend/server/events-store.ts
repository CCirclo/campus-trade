import {randomUUID} from 'node:crypto';
import {all,run} from './db.js';
import {queryFingerprint,type BehaviorEvent,type EventSource,type EventType} from './behavior-events.js';

export async function storeBehaviorEvents(events:readonly BehaviorEvent[],userId?:number){
  const itemIds=[...new Set(events.flatMap(event=>event.itemId?[event.itemId]:[]))],validIds=new Set<number>();
  if(itemIds.length){const placeholders=itemIds.map(()=>'?').join(','),rows=await all(`SELECT id FROM items WHERE id IN (${placeholders})`,itemIds);for(const row of rows)validIds.add(Number(row.id));}
  const accepted=events.filter(event=>event.itemId===null||validIds.has(event.itemId));if(!accepted.length)return{accepted:0,dropped:events.length};
  const insert=buildBehaviorEventInsert(accepted,userId),result=await run(insert.sql,insert.args);return{accepted:result.affectedRows,dropped:events.length-result.affectedRows};
}
export function buildBehaviorEventInsert(events:readonly BehaviorEvent[],userId?:number){if(!events.length)throw new Error('events 不能为空');const values=events.map(()=>'(?,?,?,?,?,?,?,?,?,?,?)').join(','),args=events.flatMap(event=>[event.eventId,event.requestId,event.sessionId,userId??null,event.type,event.source,event.itemId,event.queryHash,event.position,event.algorithmVersion,event.occurredAt]);return{sql:`INSERT IGNORE INTO behavior_events (event_id,request_id,session_id,user_id,event_type,source,item_id,query_hash,position,algorithm_version,occurred_at) VALUES ${values}`,args};}
export async function recordServerEvent(input:{requestId?:unknown;sessionId?:unknown;userId:number;type:EventType;source:EventSource;itemId:number;query?:unknown;position?:unknown;algorithmVersion?:unknown}){
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,requestId=String(input.requestId??''),sessionId=String(input.sessionId??'');
  const event:BehaviorEvent={eventId:randomUUID(),requestId:uuid.test(requestId)?requestId:randomUUID(),sessionId:uuid.test(sessionId)?sessionId:randomUUID(),type:input.type,source:input.source,itemId:input.itemId,queryHash:queryFingerprint(input.query),position:Number.isSafeInteger(Number(input.position))?Number(input.position):null,occurredAt:new Date(),algorithmVersion:String(input.algorithmVersion||'server-v1').slice(0,64)};
  return storeBehaviorEvents([event],input.userId);
}
export async function behaviorMetrics(days:number){
  const safeDays=Math.max(1,Math.min(90,Math.round(days)||7));
  return all(`SELECT source,algorithm_version,
    COUNT(DISTINCT CASE WHEN event_type='item_impression' THEN CONCAT(request_id,':',item_id) END) impressions,
    COUNT(DISTINCT CASE WHEN event_type='item_click' THEN CONCAT(request_id,':',item_id) END) clicks,
    COUNT(DISTINCT CASE WHEN event_type='favorite_add' THEN CONCAT(request_id,':',item_id) END) favorites,
    COUNT(DISTINCT CASE WHEN event_type='conversation_start' THEN CONCAT(request_id,':',item_id) END) conversations,
    COUNT(DISTINCT CASE WHEN event_type='item_impression' THEN item_id END) item_coverage,
    ROUND(COUNT(DISTINCT CASE WHEN event_type='item_click' THEN CONCAT(request_id,':',item_id) END)/NULLIF(COUNT(DISTINCT CASE WHEN event_type='item_impression' THEN CONCAT(request_id,':',item_id) END),0),4) ctr,
    ROUND(COUNT(DISTINCT CASE WHEN event_type='favorite_add' THEN CONCAT(request_id,':',item_id) END)/NULLIF(COUNT(DISTINCT CASE WHEN event_type='item_impression' THEN CONCAT(request_id,':',item_id) END),0),4) favorite_rate,
    ROUND(COUNT(DISTINCT CASE WHEN event_type='conversation_start' THEN CONCAT(request_id,':',item_id) END)/NULLIF(COUNT(DISTINCT CASE WHEN event_type='item_impression' THEN CONCAT(request_id,':',item_id) END),0),4) conversation_rate
    FROM behavior_events WHERE occurred_at>=DATE_SUB(CURRENT_TIMESTAMP,INTERVAL ${safeDays} DAY) GROUP BY source,algorithm_version ORDER BY impressions DESC`);
}
