import test from 'node:test';
import assert from 'node:assert/strict';
import {impressionEventId,queryFingerprint,validateEventBatch} from '../server/behavior-events.js';
import {buildBehaviorEventInsert} from '../server/events-store.js';

const now=new Date('2026-08-22T02:00:00.000Z');
const base={eventId:'11111111-1111-4111-8111-111111111111',requestId:'22222222-2222-4222-8222-222222222222',sessionId:'33333333-3333-4333-8333-333333333333',type:'item_click',source:'home',itemId:4,position:1,occurredAt:now.toISOString(),algorithmVersion:'home-v1'};
test('validates event and never returns raw query/userId',()=>{const result=validateEventBatch({events:[{...base,userId:999}]},now);assert.equal(result.ok,true);if(result.ok){assert.equal('userId' in result.events[0],false);assert.equal(result.events[0].itemId,4)}});
test('hashes normalized query without retaining it',()=>{assert.equal(queryFingerprint('  高数  教材 '),queryFingerprint('高数 教材'));const result=validateEventBatch({events:[{...base,type:'search_submit',source:'search',itemId:undefined,position:undefined,query:'高数'}]},now);assert.equal(result.ok,true);if(result.ok){assert.match(result.events[0].queryHash!,/^[a-f0-9]{64}$/);assert.equal('query' in result.events[0],false)}});
test('rejects invalid batch, ids, positions and stale times',()=>{assert.equal(validateEventBatch({events:[]},now).ok,false);assert.equal(validateEventBatch({events:[{...base,eventId:'bad'}]},now).ok,false);assert.equal(validateEventBatch({events:[{...base,position:0}]},now).ok,false);assert.equal(validateEventBatch({events:[{...base,occurredAt:'2025-01-01'}]},now).ok,false)});
test('impression id is deterministic UUID and changes by item',()=>{const a=impressionEventId(base.requestId,4);assert.equal(a,impressionEventId(base.requestId,4));assert.notEqual(a,impressionEventId(base.requestId,5));assert.match(a,/^[0-9a-f-]{36}$/)});
test('database insert is parameterized and binds server user id',()=>{const parsed=validateEventBatch({events:[base]},now);assert.equal(parsed.ok,true);if(parsed.ok){const insert=buildBehaviorEventInsert(parsed.events,42);assert.equal((insert.sql.match(/\?/g)||[]).length,11);assert.equal(insert.args[3],42);assert.equal(insert.sql.includes(base.eventId),false)}});
