import 'dotenv/config';
import {initDatabase,pool} from '../server/db.js';
import {embeddingConfig} from '../server/embedding.js';
import {enqueueAllEmbeddings,processEmbeddingQueue} from '../server/embedding-store.js';
const config=embeddingConfig();if(!config.enabled){console.error('请先设置 EMBEDDING_ENABLED=true 及 Embedding 服务配置');process.exitCode=1}else{await initDatabase();const count=await enqueueAllEmbeddings(process.argv.includes('--force'));console.log(`已加入向量重算队列：${count} 件，模型版本 ${config.modelVersion}`);let processed=0;while(true){const current=await processEmbeddingQueue();if(!current)break;processed+=current;console.log(`已处理 ${processed}/${count}`)}await pool.end();}
