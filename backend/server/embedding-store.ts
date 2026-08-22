import {all,one,run,type DbRow} from './db.js';
import {EmbeddingClient,embeddingConfig,embeddingContentHash,itemEmbeddingText} from './embedding.js';

const config=embeddingConfig();let processing=false;let timer:NodeJS.Timeout|undefined;
export const embeddingsEnabled=()=>config.enabled;

export async function enqueueItemEmbedding(itemId:number,force=false){
  if(!config.enabled)return false;const item=await one('SELECT id,title,category,item_condition,description FROM items WHERE id=?',[itemId]);if(!item)return false;
  const text=itemEmbeddingText(item as unknown as {title:unknown;category:unknown;item_condition?:unknown;description:unknown}),hash=embeddingContentHash(text);
  await run(`INSERT INTO item_embeddings (item_id,model_name,model_version,dimensions,normalized,content_hash,embedding,status,retry_count,next_retry_at,last_error) VALUES (?,?,?,?,1,?,NULL,'pending',0,NULL,'') ON DUPLICATE KEY UPDATE retry_count=IF(? OR content_hash<>VALUES(content_hash),0,retry_count),status=IF(? OR content_hash<>VALUES(content_hash),'pending',status),content_hash=VALUES(content_hash),dimensions=VALUES(dimensions),next_retry_at=NULL,last_error=''`,[itemId,config.model,config.modelVersion,config.dimensions,hash,force?1:0,force?1:0]);return true;
}
export async function enqueueAllEmbeddings(force=false){if(!config.enabled)return 0;const rows=await all('SELECT id FROM items');for(const row of rows)await enqueueItemEmbedding(Number(row.id),force);return rows.length;}

export async function processEmbeddingQueue(limit=config.batchSize){
  if(!config.enabled||processing)return 0;processing=true;
  try{
    const rows=await all<DbRow>(`SELECT e.item_id,e.retry_count,i.title,i.category,i.item_condition,i.description FROM item_embeddings e JOIN items i ON i.id=e.item_id WHERE e.model_version=? AND (e.status='pending' OR (e.status='failed' AND e.retry_count<3 AND (e.next_retry_at IS NULL OR e.next_retry_at<=CURRENT_TIMESTAMP))) ORDER BY e.updated_at ASC LIMIT ${Math.max(1,Math.min(config.batchSize,limit))}`,[config.modelVersion]);
    if(!rows.length)return 0;const ids=rows.map(row=>Number(row.item_id));for(const id of ids)await run(`UPDATE item_embeddings SET status='processing',updated_at=CURRENT_TIMESTAMP WHERE item_id=? AND model_version=?`,[id,config.modelVersion]);
    try{const vectors=await new EmbeddingClient(config).embed(rows.map(row=>itemEmbeddingText(row as unknown as {title:unknown;category:unknown;item_condition?:unknown;description:unknown})));for(let index=0;index<rows.length;index++)await run(`UPDATE item_embeddings SET embedding=?,status='ready',retry_count=0,next_retry_at=NULL,last_error='',updated_at=CURRENT_TIMESTAMP WHERE item_id=? AND model_version=?`,[JSON.stringify(vectors[index]),ids[index],config.modelVersion]);}
    catch(error){const message=String(error instanceof Error?error.message:'Embedding 生成失败').slice(0,250);for(let index=0;index<ids.length;index++){const delay=Math.min(60,2**(Number(rows[index].retry_count||0)+1));await run(`UPDATE item_embeddings SET status='failed',retry_count=retry_count+1,next_retry_at=DATE_ADD(CURRENT_TIMESTAMP,INTERVAL ? MINUTE),last_error=?,updated_at=CURRENT_TIMESTAMP WHERE item_id=? AND model_version=?`,[delay,message,ids[index],config.modelVersion]);}}
    return rows.length;
  }finally{processing=false}
}
export async function startEmbeddingWorker(){if(!config.enabled)return;await run(`UPDATE item_embeddings SET status='pending' WHERE model_version=? AND status='processing' AND updated_at<DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 10 MINUTE)`,[config.modelVersion]);void processEmbeddingQueue().catch(error=>console.error('Embedding worker failed:',error));timer=setInterval(()=>void processEmbeddingQueue().catch(error=>console.error('Embedding worker failed:',error)),15_000);timer.unref();}
export function stopEmbeddingWorker(){if(timer)clearInterval(timer);timer=undefined;}
