// backend/scripts/evaluate-search.ts
//
// 离线搜索质量评估 CLI（不依赖数据库）：
//   - 读取标注数据集 JSON（格式见 docs/search.md）
//   - 复用 server/search.ts 的归一化 / 别名扩展 / 打分逻辑对内存商品排序
//   - 输出 Recall@10、NDCG@10、MRR、零结果率、P95 延迟
//
// 用法（在仓库根目录）：
//   npm run search:evaluate                          # 内置示例数据集
//   npm run search:evaluate -- path/to/data.json     # 自定义标注数据集
//   npm run search:evaluate -- path/to/data.json --json results.json
//
// 说明：内置数据集为“示例”，输出会标注 example=true；自定义数据需显式
// 设置 production:true 才会被当作真实生产数据，避免把示例指标误当线上效果。

import { performance } from 'node:perf_hooks';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildKeywordSearch, normalizeKeyword, scoreItem } from '../server/search.js';
import { countZeroResults, queryMetrics, summarizeMetrics, type QueryMetricResult } from '../server/search-metrics.js';

interface EvalItem { id: number; title: string; category?: string; description?: string }
interface EvalQuery { query: string; relevant: number[] }
interface Dataset {
  dataset: string;
  description?: string;
  production?: boolean;
  items: EvalItem[];
  queries: EvalQuery[];
}

type Mode = 'baseline' | 'enhanced';

const args = process.argv.slice(2);
let datasetPath = resolve(process.cwd(), 'backend', 'data', 'search-example.json');
let jsonOutput: string | undefined;
if (args[0] && !args[0].startsWith('--')) datasetPath = resolve(process.cwd(), args[0]);
const jsonIndex = args.indexOf('--json');
if (jsonIndex >= 0 && args[jsonIndex + 1]) jsonOutput = resolve(process.cwd(), args[jsonIndex + 1]);

if (!existsSync(datasetPath)) {
  console.error(`找不到数据集文件：${datasetPath}`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(datasetPath, 'utf8')) as Dataset;
if (!Array.isArray(raw.items) || !Array.isArray(raw.queries)) {
  console.error('数据集格式错误：需要 items[] 与 queries[]（格式见 docs/search.md）');
  process.exit(1);
}
const isExample = raw.production !== true;

function rank(queryText: string, mode: Mode): number[] {
  const normalized = normalizeKeyword(queryText);
  if (mode === 'baseline') {
    return raw.items
      .filter(item => normalizeKeyword(`${item.title} ${item.description ?? ''}`).includes(normalized))
      .map(item => item.id)
      .slice(0, 10);
  }
  const built = buildKeywordSearch(normalized);
  return raw.items
    .map(item => ({ id: item.id, score: scoreItem(item, built) }))
    .filter(result => result.score > 0)
    .sort((left, right) => right.score - left.score || left.id - right.id)
    .slice(0, 10)
    .map(result => result.id);
}

function evaluate(mode: Mode) {
  const results: QueryMetricResult[] = [];
  for (const query of raw.queries) {
    const start = performance.now();
    const ranked = rank(query.query, mode);
    const latencyMs = performance.now() - start;
    results.push({ query: query.query, relevant: query.relevant, ranked, ...queryMetrics(query.relevant, ranked), latencyMs });
  }

  const metrics = { mode, dataset: raw.dataset, example: isExample, ...summarizeMetrics(results) };
  return { metrics, perQuery: results, zeroResult: countZeroResults(results) };
}

const baseline = evaluate('baseline');
const enhanced = evaluate('enhanced');

console.log('搜索质量评估');
console.log(`数据集：${raw.dataset}${isExample ? '（示例，非线上数据）' : ''}`);
console.log(`查询数：${raw.queries.length}，商品数：${raw.items.length}`);
for (const result of [baseline, enhanced]) {
  const metrics = result.metrics;
  console.log(`\n[${metrics.mode}]`);
  console.log(`Recall@10：${metrics.recallAt10.toFixed(3)}`);
  console.log(`NDCG@10： ${metrics.ndcgAt10.toFixed(3)}`);
  console.log(`MRR：      ${metrics.mrr.toFixed(3)}`);
  console.log(`零结果率：${metrics.zeroResultRate.toFixed(3)}（${result.zeroResult}/${raw.queries.length}）`);
  console.log(`P95 延迟： ${metrics.p95LatencyMs.toFixed(2)} ms（离线内存打分，仅作参考）`);
}
if (isExample) {
  console.log('⚠️  当前为内置示例数据，指标仅用于验证评估流程，不代表线上效果。');
}

if (jsonOutput) {
  writeFileSync(jsonOutput, JSON.stringify({ generatedAt: new Date().toISOString(), baseline, enhanced }, null, 2));
  console.log(`已写入结果：${jsonOutput}`);
}
