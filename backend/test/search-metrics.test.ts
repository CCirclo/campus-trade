import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countZeroResults, mrr, ndcgAtK, p95, percentile, queryMetrics, recallAtK, summarizeMetrics, zeroResultRate,
} from '../server/search-metrics.js';

test('recallAtK counts relevant hits within the first K results', () => {
  assert.equal(recallAtK([1, 2, 3], [1, 2, 3, 4, 5], 10), 1);
  assert.equal(recallAtK([1, 2, 3], [1, 4, 5, 6, 7, 8, 9, 10, 11, 12], 10), 1 / 3);
  assert.equal(recallAtK([1, 2, 3], [4, 5, 6, 7, 8, 9, 10, 11, 12, 13], 10), 0);
  assert.equal(recallAtK([1, 2, 3], [1, 2, 3, 4], 2), 2 / 3); // 只看前 K 个
  assert.equal(recallAtK([], [1, 2, 3], 10), 0); // 无相关标注 → 0
  assert.equal(recallAtK(new Set([1]), [1], 10), 1); // 兼容 Set 输入
});

test('ndcgAtK is 1 for perfect ranking, normalized and 0 without labels', () => {
  assert.equal(ndcgAtK([1, 2, 3], [1, 2, 3, 4, 5], 10), 1);
  // ranked=[1,4,…,10,2,3]：位置 1、9、10 命中
  const value = ndcgAtK([1, 2, 3], [1, 4, 5, 6, 7, 8, 9, 10, 2, 3], 10);
  const expected = (1 / Math.log2(2) + 1 / Math.log2(10) + 1 / Math.log2(11)) /
    (1 / Math.log2(2) + 1 / Math.log2(3) + 1 / Math.log2(4));
  assert.ok(Math.abs(value - expected) < 1e-9);
  assert.ok(value > 0 && value < 1);
  assert.equal(ndcgAtK([], [1, 2, 3], 10), 0); // 无相关标注 → 0
  assert.equal(ndcgAtK([1], [2, 3, 4], 10), 0); // 未命中 → 0
});

test('mrr returns the reciprocal rank of the first relevant hit', () => {
  assert.equal(mrr([3], [1, 2, 3, 4]), 1 / 3);
  assert.equal(mrr([1], [1, 2, 3]), 1);
  assert.equal(mrr([9], [1, 2, 3, 4]), 0);
  assert.equal(mrr([], [1, 2, 3]), 0); // 无相关标注 → 0
});

test('queryMetrics combines Recall@10, NDCG@10 and MRR consistently', () => {
  const metrics = queryMetrics([1, 2, 3], [1, 4, 5, 6, 7, 8, 9, 10, 2, 3], 10);
  assert.equal(metrics.recallAt10, recallAtK([1, 2, 3], [1, 4, 5, 6, 7, 8, 9, 10, 2, 3], 10));
  assert.equal(metrics.ndcgAt10, ndcgAtK([1, 2, 3], [1, 4, 5, 6, 7, 8, 9, 10, 2, 3], 10));
  assert.equal(metrics.mrr, mrr([1, 2, 3], [1, 4, 5, 6, 7, 8, 9, 10, 2, 3]));
  // 无相关标注的查询三个指标都为 0
  assert.deepEqual(queryMetrics([], [1, 2, 3], 10), { recallAt10: 0, ndcgAt10: 0, mrr: 0 });
});

test('zero-result rate covers empty, partial and all-empty result sets', () => {
  const results = [
    { ranked: [] },
    { ranked: [1] },
    { ranked: [] },
  ];
  assert.equal(countZeroResults(results), 2);
  assert.equal(zeroResultRate(results), 2 / 3);
  assert.equal(zeroResultRate([{ ranked: [] }, { ranked: [] }]), 1);
  assert.equal(zeroResultRate([{ ranked: [1] }]), 0);
  assert.equal(zeroResultRate([]), 0);
});

test('percentile and p95 use ceiling indexing and tolerate empty input', () => {
  assert.equal(percentile([5, 1, 4, 2, 3], 0.5), 3);
  assert.equal(p95([1]), 1);
  assert.equal(p95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]), 19);
  assert.equal(p95([]), 0);
});

test('summarizeMetrics judges only labelled queries but counts zero results over all', () => {
  const results = [
    { query: 'q1', relevant: [1], ranked: [1], recallAt10: 1, ndcgAt10: 1, mrr: 1, latencyMs: 10 },
    { query: 'q2', relevant: [], ranked: [], recallAt10: 0, ndcgAt10: 0, mrr: 0, latencyMs: 20 },
    { query: 'q3', relevant: [], ranked: [5], recallAt10: 0, ndcgAt10: 0, mrr: 0, latencyMs: 30 },
  ];
  const summary = summarizeMetrics(results);
  assert.equal(summary.queries, 3);
  assert.equal(summary.judgedQueries, 1);
  assert.equal(summary.recallAt10, 1); // 只对 q1 取平均
  assert.equal(summary.ndcgAt10, 1);
  assert.equal(summary.mrr, 1);
  assert.equal(summary.zeroResultRate, 1 / 3); // q2 是空结果，q3 不是
  assert.equal(summary.p95LatencyMs, 30);
});
