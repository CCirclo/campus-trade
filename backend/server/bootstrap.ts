import 'dotenv/config';

import {embeddingConfig,validateEmbeddingConfig} from './embedding.js';
const embedding=embeddingConfig();validateEmbeddingConfig(embedding);
if(process.env.HYBRID_SEARCH_ENABLED==='true'&&!embedding.enabled)throw new Error('HYBRID_SEARCH_ENABLED=true 时必须同时启用 EMBEDDING_ENABLED');
if(process.env.NODE_ENV==='production'){
  if((process.env.ANALYTICS_HASH_SECRET||'').length<32)throw new Error('生产环境必须配置至少 32 字符的 ANALYTICS_HASH_SECRET');
  if((process.env.CURSOR_SIGNING_SECRET||'').length<32)throw new Error('生产环境必须配置至少 32 字符的 CURSOR_SIGNING_SECRET');
}

await import('./index.js');
