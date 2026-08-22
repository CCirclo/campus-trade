import {all,one,run,type DbRow} from './db.js';
import {EmbeddingClient,embeddingConfig,embeddingContentHash,itemEmbeddingText} from './embedding.js';

const config=embeddingConfig();let processing=false,kickScheduled=false;let timer:NodeJS.Timeout|undefined;
export const embeddingsEnabled=()=>config.enabled;
export type ItemEmbeddingStatus='disabled'|'missing'|'ready'|'pending'|'failed';

export async function enqueueItemEmbedding(itemId:number,force=false):Promise<ItemEmbeddingStatus>{
  if(!config.enabled)return'disabled';const item=await one('SELECT id,title,category,item_condition,description FROM items WHERE id=?',[itemId]);if(!item)return'missing';
  const text=itemEmbeddingText(item as unknown as {title:unknown;category:unknown;item_condition?:unknown;description:unknown}),hash=embeddingContentHash(text);
  await run(`INSERT INTO item_embeddings (item_id,model_name,model_version,dimensions,normalized,content_hash,embedding,status,retry_count,next_retry_at,last_error) VALUES (?,?,?,?,1,?,NULL,'pending',0,NULL,'') ON DUPLICATE KEY UPDATE retry_count=IF(? OR content_hash<>VALUES(content_hash),0,retry_count),status=IF(? OR content_hash<>VALUES(content_hash),'pending',status),embedding=IF(? OR content_hash<>VALUES(content_hash),NULL,embedding),content_hash=VALUES(content_hash),dimensions=VALUES(dimensions),next_retry_at=IF(? OR content_hash<>VALUES(content_hash),NULL,next_retry_at),last_error=IF(? OR content_hash<>VALUES(content_hash),'',last_error)`,[itemId,config.model,config.modelVersion,config.dimensions,hash,force?1:0,force?1:0,force?1:0,force?1:0,force?1:0]);
  const row=await one('SELECT status FROM item_embeddings WHERE item_id=? AND model_version=?',[itemId,config.modelVersion]);return String(row?.status||'pending') as ItemEmbeddingStatus;
}
export async function enqueueAllEmbeddings(force=false){if(!config.enabled)return 0;const rows=await all('SELECT id FROM items ORDER BY id');for(const row of rows)await enqueueItemEmbedding(Number(row.id),force);return rows.length}

async function processOne():Promise<ItemEmbeddingStatus|'empty'>{
  const target=await one<DbRow>(`SELECT e.item_id,e.retry_count,i.title,i.category,i.item_condition,i.description FROM item_embeddings e JOIN items i ON i.id=e.item_id WHERE e.model_version=? AND (e.status='pending' OR (e.status='failed' AND e.retry_count<3 AND (e.next_retry_at IS NULL OR e.next_retry_at<=CURRENT_TIMESTAMP))) ORDER BY e.updated_at ASC LIMIT 1`,[config.modelVersion]);
  if(!target)return'empty';const id=Number(target.item_id),claim=await run(`UPDATE item_embeddings SET status='processing',updated_at=CURRENT_TIMESTAMP WHERE item_id=? AND model_version=? AND status IN ('pending','failed')`,[id,config.modelVersion]);if(!claim.affectedRows)return'empty';
  try{const [vector]=await new EmbeddingClient(config).embed([itemEmbeddingText(target as unknown as {title:unknown;category:unknown;item_condition?:unknown;description:unknown})],{priority:'upload'});await run(`UPDATE item_embeddings SET embedding=?,status='ready',retry_count=0,next_retry_at=NULL,last_error='',updated_at=CURRENT_TIMESTAMP WHERE item_id=? AND model_version=?`,[JSON.stringify(vector),id,config.modelVersion]);return'ready'}
  catch(error){const message=String(error instanceof Error?error.message:'Embedding 生成失败').slice(0,250),delay=Math.min(60,2**(Number(target.retry_count||0)+1));await run(`UPDATE item_embeddings SET status='failed',retry_count=retry_count+1,next_retry_at=DATE_ADD(CURRENT_TIMESTAMP,INTERVAL ? MINUTE),last_error=?,updated_at=CURRENT_TIMESTAMP WHERE item_id=? AND model_version=?`,[delay,message,id,config.modelVersion]);return'failed'}
}

export async function processEmbeddingQueue(){if(!config.enabled||processing)return 0;processing=true;try{return(await processOne())==='empty'?0:1}finally{processing=false}}
export function kickEmbeddingWorker(){if(kickScheduled)return;kickScheduled=true;setImmediate(()=>{kickScheduled=false;void processEmbeddingQueue().then(count=>{if(count){const next=setTimeout(kickEmbeddingWorker,100);next.unref()}}).catch(error=>console.error('Embedding worker failed:',error))})}
export async function startEmbeddingWorker(){if(!config.enabled)return;await run(`UPDATE item_embeddings SET status='pending' WHERE model_version=? AND status='processing' AND updated_at<DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 10 MINUTE)`,[config.modelVersion]);kickEmbeddingWorker();timer=setInterval(kickEmbeddingWorker,5_000);timer.unref()}
export function stopEmbeddingWorker(){if(timer)clearInterval(timer);timer=undefined}
