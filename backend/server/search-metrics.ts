// backend/server/search-metrics.ts
//
// 纯函数、可离线测试的搜索质量指标模块（不依赖数据库）。
// 指标定义与离线评测 CLI（backend/scripts/evaluate-search.ts）保持一致：
//  Recall@K、NDCG@K、MRR、零结果率、P95 延迟。

export interface QueryMetricResult {
  query: string;
  relevant: number[];
  ranked: number[];
  recallAt10: number;
  ndcgAt10: number;
  mrr: number;
  latencyMs: number;
}

export interface QueryMetrics {
  recallAt10: number;
  ndcgAt10: number;
  mrr: number;
}

export interface SearchMetricsSummary {
  queries: number;
  judgedQueries: number;
  recallAt10: number;
  ndcgAt10: number;
  mrr: number;
  zeroResultRate: number;
  p95LatencyMs: number;
}

function asSet(relevant: ReadonlySet<number> | readonly number[]): Set<number> {
  return relevant instanceof Set ? new Set(relevant) : new Set(relevant);
}

/** Recall@K：前 K 个结果中相关商品占全部相关商品的比例（无相关标注时返回 0）。 */
export function recallAtK(relevant: ReadonlySet<number> | readonly number[], ranked: readonly number[], k: number): number {
  const ids = asSet(relevant);
  if (ids.size === 0) return 0;
  const hits = ranked.slice(0, k).filter(id => ids.has(id)).length;
  return hits / ids.size;
}

/** NDCG@K：以 1/log2(i+2) 为折损，按理想排序归一化（无相关标注时返回 0）。 */
export function ndcgAtK(relevant: ReadonlySet<number> | readonly number[], ranked: readonly number[], k: number): number {
  const ids = asSet(relevant);
  let dcg = 0;
  for (let i = 0; i < Math.min(k, ranked.length); i++) {
    if (ids.has(ranked[i])) dcg += 1 / Math.log2(i + 2);
  }
  let idcg = 0;
  for (let i = 0; i < Math.min(ids.size, k); i++) idcg += 1 / Math.log2(i + 2);
  return idcg > 0 ? dcg / idcg : 0;
}

/** MRR：第一个相关结果的倒数排名（无相关标注或未命中时返回 0）。 */
export function mrr(relevant: ReadonlySet<number> | readonly number[], ranked: readonly number[]): number {
  const ids = asSet(relevant);
  for (let i = 0; i < ranked.length; i++) if (ids.has(ranked[i])) return 1 / (i + 1);
  return 0;
}

/** 单个查询的三个指标（默认取前 10 个结果）。 */
export function queryMetrics(relevant: readonly number[], ranked: readonly number[], k = 10): QueryMetrics {
  return {
    recallAt10: recallAtK(relevant, ranked, k),
    ndcgAt10: ndcgAtK(relevant, ranked, k),
    mrr: mrr(relevant, ranked),
  };
}

/** 返回空结果集的查询数量。 */
export function countZeroResults(results: readonly Pick<QueryMetricResult, 'ranked'>[]): number {
  return results.filter(result => result.ranked.length === 0).length;
}

/** 零结果率：空结果查询占全部查询的比例（无查询时返回 0）。 */
export function zeroResultRate(results: readonly Pick<QueryMetricResult, 'ranked'>[]): number {
  if (results.length === 0) return 0;
  return countZeroResults(results) / results.length;
}

/** 取升序样本的 p 分位（0<p≤1；p=0.95 即 P95），无样本时返回 0。 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

/** P95 延迟（毫秒）。 */
export function p95(values: readonly number[]): number {
  return percentile(values, 0.95);
}

/**
 * 汇总指标：前三项只对“至少有一个相关标注”的查询取平均；
 * 零结果率与 P95 覆盖全部查询（含无相关标注的查询）。
 */
export function summarizeMetrics(results: readonly QueryMetricResult[], k = 10): SearchMetricsSummary {
  const judged = results.filter(result => result.relevant.length > 0);
  const judgedCount = judged.length || 1;
  const mean = (metric: (result: QueryMetricResult) => number) =>
    judged.reduce((sum, result) => sum + metric(result), 0) / judgedCount;
  const latencies = results.map(result => result.latencyMs);
  return {
    queries: results.length,
    judgedQueries: judged.length,
    recallAt10: mean(result => result.recallAt10),
    ndcgAt10: mean(result => result.ndcgAt10),
    mrr: mean(result => result.mrr),
    zeroResultRate: zeroResultRate(results),
    p95LatencyMs: percentile(latencies, 0.95),
  };
}
