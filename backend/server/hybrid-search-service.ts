import {all,type DbRow} from './db.js';
import {EmbeddingClient,embeddingConfig} from './embedding.js';
import {buildKeywordSearch,normalizeKeyword} from './search.js';
import {cosineSimilarity,weightedHybridFusion} from './vector-search.js';

const config=embeddingConfig();const CACHE_TTL=5*60_000,cache=new Map<string,{at:number;vector:number[]}>();
export const hybridSearchEnabled=()=>config.enabled&&process.env.HYBRID_SEARCH_ENABLED==='true';
async function queryVector(keyword:string){const hit=cache.get(keyword),now=Date.now();if(hit&&now-hit.at<CACHE_TTL)return hit.vector;const [vector]=await new EmbeddingClient(config).embed([keyword]);if(cache.size>=200)cache.delete(cache.keys().next().value!);cache.set(keyword,{at:now,vector});return vector;}
function embedding(raw:unknown){try{const value=Array.isArray(raw)?raw:JSON.parse(String(raw));return Array.isArray(value)&&value.every(Number.isFinite)?value as number[]:null}catch{return null}}

export async function hybridItemIds(input:{keyword:string;schoolId:string;category?:string;condition?:string}){
  const keyword=normalizeKeyword(input.keyword),built=buildKeywordSearch(keyword),filters=[`i.school_id=?`,`i.status='在售'`],filterArgs:unknown[]=[input.schoolId];
  if(input.category){filters.push('i.category=?');filterArgs.push(input.category)}if(input.condition){filters.push('i.item_condition=?');filterArgs.push(input.condition)}const where=filters.join(' AND ');
  const keywordRows=await all<DbRow>(`SELECT i.id,i.title,${built.scoreExpr} keyword_score FROM items i WHERE ${where} AND ${built.whereClause} ORDER BY keyword_score DESC,i.created_at DESC,i.id DESC LIMIT 200`,[...built.scoreArgs,...filterArgs,...built.whereArgs]);
  let vectorRows:{id:number;score:number}[]=[];
  try{const vector=await queryVector(keyword),rows=await all<DbRow>(`SELECT i.id,e.embedding FROM item_embeddings e JOIN items i ON i.id=e.item_id WHERE e.model_version=? AND e.status='ready' AND ${where} ORDER BY e.updated_at DESC LIMIT 3000`,[config.modelVersion,...filterArgs]);vectorRows=rows.map(row=>{const value=embedding(row.embedding);return{id:Number(row.id),score:value&&value.length===vector.length?cosineSimilarity(vector,value):-1}}).filter(row=>row.score>0).sort((a,b)=>b.score-a.score||a.id-b.id).slice(0,200);}catch(error){console.error('Vector recall unavailable, using keyword results:',error)}
  return weightedHybridFusion(keywordRows.map(row=>({id:Number(row.id),score:Number(row.keyword_score),exactMatch:normalizeKeyword(row.title)===keyword})),vectorRows,{keywordWeight:0.62,vectorWeight:0.38,exactBoost:1.5}).slice(0,400).map(row=>row.id);
}
