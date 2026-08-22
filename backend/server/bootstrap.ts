import 'dotenv/config';

import {embeddingConfig,validateEmbeddingConfig} from './embedding.js';
const embedding=embeddingConfig();validateEmbeddingConfig(embedding);
if(process.env.HYBRID_SEARCH_ENABLED==='true'&&!embedding.enabled)throw new Error('HYBRID_SEARCH_ENABLED=true 时必须同时启用 EMBEDDING_ENABLED');

await import('./index.js');
