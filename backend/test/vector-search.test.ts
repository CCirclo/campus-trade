// backend/test/vector-search.test.ts
//
// 确定性单测：无效向量、余弦相似度、RRF 通道去重/权重/并列、精确匹配保护。

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cosineSimilarity, normalizeVector, reciprocalRankFusion, weightedHybridFusion,
  DEFAULT_EXACT_BOOST, DEFAULT_KEYWORD_WEIGHT, DEFAULT_RRF_K, DEFAULT_VECTOR_WEIGHT,
} from '../server/vector-search.js';
import type { KeywordRow, RankedChannels, RankedItem, VectorRow } from '../server/vector-search.js';

const EPS = 1e-9;
const closeTo = (actual: number, expected: number, eps = EPS, message?: string) =>
  assert.ok(Math.abs(actual - expected) <= eps, message ?? `期望 ${expected} ± ${eps}，实际 ${actual}`);

// ---- normalizeVector -------------------------------------------------------

test('normalizeVector 校验非空有限数值向量', () => {
  assert.throws(() => normalizeVector([]));
  assert.throws(() => normalizeVector([NaN]));
  assert.throws(() => normalizeVector([1, Infinity]));
  assert.throws(() => normalizeVector([1, -Infinity]));
  assert.throws(() => normalizeVector(['1' as unknown as number]));
  assert.throws(() => normalizeVector(undefined as unknown as number[]));
});

test('normalizeVector 拒绝零向量', () => {
  assert.throws(() => normalizeVector([0]));
  assert.throws(() => normalizeVector([0, 0, 0]));
});

test('normalizeVector 输出 L2 单位向量并保留方向', () => {
  assert.deepEqual(normalizeVector([1, 1, 1, 1]), [0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(normalizeVector([3, 4]), [0.6, 0.8]);
  assert.deepEqual(normalizeVector([-3, -4]), [-0.6, -0.8]);
  const n = normalizeVector([1, 2, 3]);
  closeTo(Math.hypot(...n), 1, 1e-12);
});

test('normalizeVector 与缩放无关（尺度不变）', () => {
  const expected=normalizeVector([3,4]);
  for(const value of [normalizeVector([30,40]),normalizeVector([0.3,0.4])]){closeTo(value[0],expected[0]);closeTo(value[1],expected[1]);}
});

test('normalizeVector 正确处理超大/超小数值（不溢出、不下溢误判为零向量）', () => {
  for (const values of [[1e200, 1e200], [1e-200, 1e-200]]) {
    const n = normalizeVector(values);
    closeTo(n[0], 1 / Math.sqrt(2), 1e-12);
    closeTo(n[1], 1 / Math.sqrt(2), 1e-12);
    closeTo(Math.hypot(...n), 1, 1e-12);
  }
});

// ---- cosineSimilarity ------------------------------------------------------

test('cosineSimilarity 精确计算正交/同向/反向', () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test('cosineSimilarity 对原始向量与归一化向量结果一致', () => {
  closeTo(
    cosineSimilarity([1, 2], [3, 4]),
    cosineSimilarity(normalizeVector([1, 2]), normalizeVector([3, 4])),
    1e-12,
  );
  closeTo(cosineSimilarity([1, 2], [3, 4]), cosineSimilarity([2, 4], [6, 8]), 1e-12);
  closeTo(cosineSimilarity([1, 2], [2, 4]), 1, 1e-12); // 平行向量
});

test('cosineSimilarity 对相同/相反向量趋近 ±1', () => {
  const same = cosineSimilarity([1, 2, 3], [1, 2, 3]);
  const opposite = cosineSimilarity([1, 2, 3], [-1, -2, -3]);
  assert.ok(same <= 1 && same >= 1 - 1e-12);
  assert.ok(opposite >= -1 && opposite <= -1 + 1e-12);
});

test('cosineSimilarity 钳制浮点漂移到 [-1, 1]', () => {
  // 数学上余弦恰为 ±1 的输入，浮点舍入可能让裸值略微越界；任何情况都必须落在 [-1,1]
  const pairs: Array<[readonly number[], readonly number[]]> = [
    [[1, 1, 1], [1, 1, 1]],
    [[1, 1, 1], [-1, -1, -1]],
    [[1, 2, 3], [1, 2, 3]],
    [[1, 2, 3], [-1, -2, -3]],
    [[0.1, 0.2, 0.3], [0.1, 0.2, 0.3]],
    [[0.1, 0.2, 0.3], [-0.1, -0.2, -0.3]],
  ];
  for (const [l, r] of pairs) {
    const c = cosineSimilarity(l, r);
    assert.ok(c >= -1 && c <= 1, `cosine(${l}, ${r}) = ${c} 越界`);
  }
  // 多组随机向量的结果也都必须落在 [-1,1]
  const batch: Array<[readonly number[], readonly number[]]> = [
    [[1, 2, 3], [4, 5, 6]],
    [[1, -2, 3], [4, 5, -6]],
    [[0.5, 0.5], [1, 1]],
    [[1, 0, 1], [1, 1, 0]],
  ];
  for (const [l, r] of batch) {
    const c = cosineSimilarity(l, r);
    assert.ok(c >= -1 && c <= 1, `cosine(${l}, ${r}) = ${c} 越界`);
  }
});

test('cosineSimilarity 校验非法输入', () => {
  assert.throws(() => cosineSimilarity([], [1]));
  assert.throws(() => cosineSimilarity([1], []));
  assert.throws(() => cosineSimilarity([1], [1, 2])); // 维度不同
  assert.throws(() => cosineSimilarity([NaN], [1]));
  assert.throws(() => cosineSimilarity([1, Infinity], [1, 2]));
  assert.throws(() => cosineSimilarity([1, 'x' as unknown as number], [1, 2]));
  assert.throws(() => cosineSimilarity([0, 0], [1, 2])); // 左零向量
  assert.throws(() => cosineSimilarity([1, 2], [0, 0])); // 右零向量
});

test('cosineSimilarity 正确处理超大/超小数值', () => {
  closeTo(cosineSimilarity([1e200, 0], [1e200, 1e200]), 1 / Math.sqrt(2), 1e-12);
  closeTo(cosineSimilarity([1e-200, 0], [1e-200, 1e-200]), 1 / Math.sqrt(2), 1e-12);
});

// ---- reciprocalRankFusion --------------------------------------------------

const idList = (result: ReadonlyArray<{ id: number }>) => result.map(r => r.id);

test('reciprocalRankFusion 按 RRF 公式融合并按 score 降序、id 升序', () => {
  const channels: RankedChannels = { a: [{ id: 1 }, { id: 2 }], b: [{ id: 2 }, { id: 3 }] };
  const result = reciprocalRankFusion(channels);
  assert.deepEqual(idList(result), [2, 1, 3]);
  // item2：a 通道 rank2 + b 通道 rank1
  assert.equal(result[0].score, 1 / (DEFAULT_RRF_K + 2) + 1 / (DEFAULT_RRF_K + 1));
  assert.deepEqual(result[0].ranks, { a: 2, b: 1 });
  assert.equal(result[1].score, 1 / (DEFAULT_RRF_K + 1));
  assert.deepEqual(result[1].ranks, { a: 1 });
  assert.equal(result[2].score, 1 / (DEFAULT_RRF_K + 2));
  assert.deepEqual(result[2].ranks, { b: 2 });
});

test('reciprocalRankFusion 通道内按首次出现去重', () => {
  const result = reciprocalRankFusion({ a: [{ id: 1 }, { id: 1 }, { id: 2 }] });
  assert.deepEqual(idList(result), [1, 2]);
  assert.equal(result[0].score, 1 / (DEFAULT_RRF_K + 1)); // id1 只占 rank1
  assert.deepEqual(result[0].ranks, { a: 1 });
  assert.equal(result[1].score, 1 / (DEFAULT_RRF_K + 2));
  assert.deepEqual(result[1].ranks, { a: 2 });
});

test('reciprocalRankFusion 支持逐通道权重', () => {
  const result = reciprocalRankFusion(
    { a: [{ id: 1 }, { id: 2 }], b: [{ id: 2 }, { id: 3 }] },
    { weights: { a: 2 } }, // b 默认 1
  );
  assert.deepEqual(idList(result), [2, 1, 3]);
  assert.equal(result[0].score, 2 / (DEFAULT_RRF_K + 2) + 1 / (DEFAULT_RRF_K + 1));
  assert.equal(result[1].score, 2 / (DEFAULT_RRF_K + 1));
  assert.equal(result[2].score, 1 / (DEFAULT_RRF_K + 2));
});

test('reciprocalRankFusion 零权重通道不产生任何贡献', () => {
  const channels: RankedChannels = { a: [{ id: 1 }, { id: 2 }], b: [{ id: 2 }, { id: 3 }] };
  const result = reciprocalRankFusion(channels, { weights: { a: 0 } });
  // id1 仅来自零权重通道 a → 不输出；id2/id3 仍由正权重通道 b 保留
  assert.deepEqual(idList(result), [2, 3]);
  assert.equal(result[0].score, 1 / (DEFAULT_RRF_K + 1));
  assert.deepEqual(result[0].ranks, { b: 1 }); // 不记录零权重通道 a 的排名
  assert.equal(result[1].score, 1 / (DEFAULT_RRF_K + 2));
  assert.deepEqual(result[1].ranks, { b: 2 });
});

test('reciprocalRankFusion 全零权重返回空结果', () => {
  assert.deepEqual(reciprocalRankFusion({ a: [{ id: 1 }] }, { weights: { a: 0 } }), []);
});

test('reciprocalRankFusion score 并列时按 id 升序', () => {
  // 两个单条目通道得分相同（各 1/(K+1)）
  const result = reciprocalRankFusion({ a: [{ id: 7 }], b: [{ id: 3 }] });
  assert.deepEqual(idList(result), [3, 7]);
  assert.equal(result[0].score, result[1].score);
  // 不同排名 + 不同权重构造出完全相同的得分：a rank2（62/62）== b rank1（61/61）
  const tied = reciprocalRankFusion(
    { a: [{ id: 3 }, { id: 1 }], b: [{ id: 2 }] },
    { weights: { a: 62, b: 61 } },
  );
  assert.deepEqual(idList(tied), [3, 1, 2]);
  assert.equal(tied[0].score, 62 / (DEFAULT_RRF_K + 1));
  assert.equal(tied[1].score, 1); // 62/62
  assert.equal(tied[2].score, 1); // 61/61
});

test('reciprocalRankFusion 支持自定义 rrfK（有界 1..1000）', () => {
  assert.equal(reciprocalRankFusion({ a: [{ id: 1 }] }, { rrfK: 100 })[0].score, 1 / 101);
  assert.equal(reciprocalRankFusion({ a: [{ id: 1 }] }, { rrfK: 1 })[0].score, 1 / 2);
  assert.equal(reciprocalRankFusion({ a: [{ id: 1 }] }, { rrfK: 1000 })[0].score, 1 / 1001);
  assert.throws(() => reciprocalRankFusion({ a: [{ id: 1 }] }, { rrfK: 0 }));
  assert.throws(() => reciprocalRankFusion({ a: [{ id: 1 }] }, { rrfK: 1001 }));
  assert.throws(() => reciprocalRankFusion({ a: [{ id: 1 }] }, { rrfK: -1 }));
  assert.throws(() => reciprocalRankFusion({ a: [{ id: 1 }] }, { rrfK: NaN }));
  assert.throws(() => reciprocalRankFusion({ a: [{ id: 1 }] }, { rrfK: Infinity }));
  assert.throws(() => reciprocalRankFusion({ a: [{ id: 1 }] }, { rrfK: '60' as unknown as number }));
});

test('reciprocalRankFusion 校验权重', () => {
  const channels: RankedChannels = { a: [{ id: 1 }] };
  assert.throws(() => reciprocalRankFusion(channels, { weights: { a: -1 } }));
  assert.throws(() => reciprocalRankFusion(channels, { weights: { a: NaN } }));
  assert.throws(() => reciprocalRankFusion(channels, { weights: { a: Infinity } }));
  assert.throws(() => reciprocalRankFusion(channels, { weights: { nope: 1 } })); // 未知通道
});

test('reciprocalRankFusion 校验 id（正安全整数）', () => {
  const bad: unknown[] = [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'];
  for (const id of bad) {
    assert.throws(() => reciprocalRankFusion({ a: [{ id: id as number }] }));
  }
  assert.throws(() => reciprocalRankFusion({ a: [null as unknown as RankedItem] }));
  assert.throws(() => reciprocalRankFusion({ a: [{ id: 1 }, { id: 0 }] }));
});

test('reciprocalRankFusion 校验通道结构', () => {
  assert.throws(() => reciprocalRankFusion({})); // 至少一个通道
  assert.throws(() => reciprocalRankFusion({ a: 'x' as unknown as readonly RankedItem[] }));
  assert.throws(() => reciprocalRankFusion(null as unknown as RankedChannels));
});

test('reciprocalRankFusion 结果唯一且确定', () => {
  const channels: RankedChannels = {
    title: [{ id: 1 }, { id: 2 }, { id: 3 }],
    category: [{ id: 3 }, { id: 2 }, { id: 4 }],
  };
  const first = reciprocalRankFusion(channels);
  const second = reciprocalRankFusion(channels);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map(r => r.id)).size, first.length); // 无重复 id
});

// ---- weightedHybridFusion --------------------------------------------------

test('weightedHybridFusion 组合归一化关键词得分与余弦得分', () => {
  const keywordRows: KeywordRow[] = [{ id: 1, score: 100 }, { id: 2, score: 50 }];
  const vectorRows: VectorRow[] = [{ id: 1, score: 0.8 }, { id: 3, score: 0.9 }];
  const result = weightedHybridFusion(keywordRows, vectorRows);
  assert.deepEqual(result.map(r => r.id), [1, 2, 3]);
  closeTo(result[0].score, DEFAULT_KEYWORD_WEIGHT * 1 + DEFAULT_VECTOR_WEIGHT * 0.8);
  closeTo(result[1].score, DEFAULT_KEYWORD_WEIGHT * 0.5 + DEFAULT_VECTOR_WEIGHT * 0);
  closeTo(result[2].score, DEFAULT_KEYWORD_WEIGHT * 0 + DEFAULT_VECTOR_WEIGHT * 0.9);
});

test('weightedHybridFusion 精确匹配受 exactMatch + exactBoost 保护', () => {
  // 同分时精确匹配排在前面
  const equal = weightedHybridFusion(
    [{ id: 1, score: 100, exactMatch: true }, { id: 2, score: 100 }],
    [],
  );
  assert.deepEqual(equal.map(r => r.id), [1, 2]);
  closeTo(equal[0].score, DEFAULT_KEYWORD_WEIGHT * 1 * DEFAULT_EXACT_BOOST);
  closeTo(equal[1].score, DEFAULT_KEYWORD_WEIGHT * 1);
  // 精确匹配的关键词得分略低（90 vs 100）仍能压过非精确最高分
  const lower = weightedHybridFusion(
    [{ id: 1, score: 90, exactMatch: true }, { id: 2, score: 100 }],
    [],
  );
  assert.deepEqual(lower.map(r => r.id), [1, 2]);
  // exactMatch: false 不触发提升
  const noBoost = weightedHybridFusion(
    [{ id: 1, score: 100, exactMatch: false }, { id: 2, score: 100 }],
    [],
  );
  assert.deepEqual(noBoost.map(r => r.id), [1, 2]); // 并列时 id 升序
  closeTo(noBoost[0].score, noBoost[1].score);
});

test('weightedHybridFusion 支持自定义 exactBoost', () => {
  const result = weightedHybridFusion(
    [{ id: 1, score: 100, exactMatch: true }],
    [],
    { exactBoost: 2 },
  );
  closeTo(result[0].score, DEFAULT_KEYWORD_WEIGHT * 1 * 2);
});

test('weightedHybridFusion 支持自定义权重', () => {
  const result = weightedHybridFusion(
    [{ id: 1, score: 100 }],
    [{ id: 2, score: 1 }],
    { keywordWeight: 0.3, vectorWeight: 0.7 },
  );
  assert.deepEqual(result.map(r => r.id), [2, 1]); // 向量权重高 → 纯向量命中靠前
  closeTo(result[0].score, 0.7);
  closeTo(result[1].score, 0.3);
});

test('weightedHybridFusion 余弦得分截断到 [0,1]', () => {
  const over = weightedHybridFusion([], [{ id: 1, score: 2 }]);
  closeTo(over[0].score, DEFAULT_VECTOR_WEIGHT); // 2 → 1
  const negative = weightedHybridFusion(
    [{ id: 1, score: 100 }],
    [{ id: 1, score: -0.5 }],
  );
  closeTo(negative[0].score, DEFAULT_KEYWORD_WEIGHT); // -0.5 → 0
});

test('weightedHybridFusion 同一 id 去重合并', () => {
  const dup = weightedHybridFusion(
    [{ id: 1, score: 100 }, { id: 1, score: 50 }],
    [],
  );
  assert.equal(dup.length, 1); // 首次出现生效
  closeTo(dup[0].score, DEFAULT_KEYWORD_WEIGHT);
  const merged = weightedHybridFusion(
    [{ id: 1, score: 100 }],
    [{ id: 1, score: 0.5 }],
  );
  assert.equal(merged.length, 1);
  closeTo(merged[0].score, DEFAULT_KEYWORD_WEIGHT + DEFAULT_VECTOR_WEIGHT * 0.5);
});

test('weightedHybridFusion 校验输入', () => {
  assert.throws(() => weightedHybridFusion([{ id: 0, score: 1 }], []));
  assert.throws(() => weightedHybridFusion([{ id: -1, score: 1 }], []));
  assert.throws(() => weightedHybridFusion([{ id: 1.5, score: 1 }], []));
  assert.throws(() => weightedHybridFusion([{ id: 1, score: NaN }], []));
  assert.throws(() => weightedHybridFusion([{ id: 1, score: Infinity }], []));
  assert.throws(() => weightedHybridFusion([], [{ id: 0, score: 1 }]));
  assert.throws(() => weightedHybridFusion(undefined as unknown as KeywordRow[], []));
  assert.throws(() => weightedHybridFusion([], undefined as unknown as VectorRow[]));
});

test('weightedHybridFusion 校验权重与 exactBoost 范围', () => {
  const rows: KeywordRow[] = [{ id: 1, score: 100 }];
  assert.throws(() => weightedHybridFusion(rows, [], { keywordWeight: -0.1 }));
  assert.throws(() => weightedHybridFusion(rows, [], { keywordWeight: 1.5 }));
  assert.throws(() => weightedHybridFusion(rows, [], { keywordWeight: NaN }));
  assert.throws(() => weightedHybridFusion(rows, [], { vectorWeight: -0.1 }));
  assert.throws(() => weightedHybridFusion(rows, [], { vectorWeight: 1.5 }));
  assert.throws(() => weightedHybridFusion(rows, [], { exactBoost: 0.5 }));
  assert.throws(() => weightedHybridFusion(rows, [], { exactBoost: NaN }));
});

test('weightedHybridFusion 空输入与确定性', () => {
  assert.deepEqual(weightedHybridFusion([], []), []);
  const rows: KeywordRow[] = [{ id: 1, score: 100 }, { id: 2, score: 60 }];
  const vectors: VectorRow[] = [{ id: 2, score: 0.9 }, { id: 3, score: 0.7 }];
  const first = weightedHybridFusion(rows, vectors);
  assert.deepEqual(first, weightedHybridFusion(rows, vectors));
  assert.equal(new Set(first.map(r => r.id)).size, first.length); // 无重复 id
});
