// backend/server/vector-search.ts
//
// 纯函数、无状态、可离线测试的向量数学与检索融合工具（不访问数据库、不依赖网络/鉴权）：
//  - normalizeVector      ：L2 归一化（带最大绝对值缩放，避免大数溢出、小数下溢误判为零向量）
//  - cosineSimilarity     ：余弦相似度（归一化/原始向量通用，钳制浮点漂移到 [-1,1]）
//  - reciprocalRankFusion ：多通道 RRF 融合（通道内按首次出现去重、可配权重、K 有界）
//  - weightedHybridFusion ：关键词 + 向量混合融合（exactMatch 精确匹配保护）
//
// 安全约定：所有输入都做显式校验——id 必须是正安全整数、数值必须有限、权重/参数有界，
// 非法输入一律抛出 Error，绝不静默截断或改变语义。结果排序确定：score 降序、id 升序。

// ---------------------------------------------------------------------------
// normalizeVector / cosineSimilarity
// ---------------------------------------------------------------------------

/** 校验一组数值均为有限数，并返回最大绝对值（0 表示全零向量）。 */
function finiteMaxAbs(values: readonly number[]): number {
  let maxAbs = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`向量第 ${i} 个元素必须是有限数值，收到 ${String(v)}`);
    }
    const abs = Math.abs(v);
    if (abs > maxAbs) maxAbs = abs;
  }
  return maxAbs;
}

/**
 * L2 归一化：返回与输入同方向的单位向量。
 * 校验非空、元素均为有限数值；零向量抛出 Error。
 * 先按最大绝对值缩放再归一化，避免超大数值溢出（1e200）与超小数值平方下溢（1e-200）
 * 被误判为零向量。
 */
export function normalizeVector(values: readonly number[]): number[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('向量不能为空');
  }
  const maxAbs = finiteMaxAbs(values);
  if (maxAbs === 0) {
    throw new Error('零向量无法归一化');
  }
  const scaled = new Array<number>(values.length);
  let sumSquares = 0;
  for (let i = 0; i < values.length; i++) {
    const s = values[i] / maxAbs;
    scaled[i] = s;
    sumSquares += s * s;
  }
  const norm = Math.sqrt(sumSquares);
  const result = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    result[i] = scaled[i] / norm;
  }
  return result;
}

/**
 * 余弦相似度：归一化向量与原始向量通用（分母内隐完成归一化）。
 * 校验两向量同维度、非空、元素均为有限数值；任一零向量抛出 Error。
 * 浮点舍入可能让裸值略微越界，统一钳制到 [-1,1]。
 */
export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    throw new Error('两个输入都必须是数组');
  }
  if (left.length === 0 || right.length === 0) {
    throw new Error('向量不能为空');
  }
  if (left.length !== right.length) {
    throw new Error(`两个向量维度必须相同（${left.length} != ${right.length}）`);
  }
  let maxAbs = 0;
  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = right[i];
    if (typeof a !== 'number' || !Number.isFinite(a) || typeof b !== 'number' || !Number.isFinite(b)) {
      throw new Error(`向量第 ${i} 个元素必须是有限数值`);
    }
    maxAbs = Math.max(maxAbs, Math.abs(a), Math.abs(b));
  }
  if (maxAbs === 0) {
    throw new Error('零向量没有余弦相似度');
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i++) {
    const a = left[i] / maxAbs;
    const b = right[i] / maxAbs;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    throw new Error('零向量没有余弦相似度');
  }
  const raw = dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
  return Math.max(-1, Math.min(1, raw));
}

// ---------------------------------------------------------------------------
// reciprocalRankFusion
// ---------------------------------------------------------------------------

/** 单条排名条目：score 仅为可选的携带字段，RRF 只使用列表中的排名位置。 */
export interface RankedItem {
  id: number;
  score?: number;
}

/** 命名通道的排名列表（列表顺序即排名，越靠前排名越高）。 */
export type RankedChannels = Readonly<Record<string, readonly RankedItem[]>>;

export interface ReciprocalRankFusionOptions {
  /** 每个通道的权重，默认 1；必须有限非负；声明了不存在的通道名视为配置错误。 */
  weights?: Readonly<Record<string, number>>;
  /** RRF 平滑常数 K，默认 60，允许范围 1..1000。 */
  rrfK?: number;
}

export interface FusedItem {
  id: number;
  score: number;
  /** 该条目在参与贡献（权重 > 0）的通道中的 1-based 排名。 */
  ranks: Record<string, number>;
}

export const DEFAULT_RRF_K = 60;
export const MIN_RRF_K = 1;
export const MAX_RRF_K = 1000;

function assertPositiveSafeId(id: unknown, label: string): void {
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`${label} 的 id 必须是正安全整数，收到 ${String(id)}`);
  }
}

/**
 * 多通道 Reciprocal Rank Fusion：
 *  - 每个通道内按首次出现去重；
 *  - 条目得分 = Σ weight[c] / (K + rank[c])，只累计权重 > 0 的通道；
 *  - 零权重通道不产生任何贡献：仅出现在零权重通道的条目不会出现在结果中，
 *    但若同一条目也来自其他正权重通道，则仍会被保留（此时 ranks 不记录零权重通道）；
 *  - 结果唯一，按 score 降序、id 升序排列。
 */
export function reciprocalRankFusion(
  channels: RankedChannels,
  options: ReciprocalRankFusionOptions = {},
): FusedItem[] {
  if (typeof channels !== 'object' || channels === null || Array.isArray(channels)) {
    throw new Error('channels 必须是对象');
  }
  const names = Object.keys(channels);
  if (names.length === 0) {
    throw new Error('channels 至少需要一个通道');
  }
  if (typeof options !== 'object' || options === null) {
    throw new Error('options 必须是对象');
  }

  const weightByChannel = new Map<string, number>();
  const rawWeights = options.weights ?? {};
  if (typeof rawWeights !== 'object' || rawWeights === null || Array.isArray(rawWeights)) {
    throw new Error('weights 必须是对象');
  }
  for (const [name, weight] of Object.entries(rawWeights)) {
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
      throw new Error(`通道 "${name}" 的权重必须是有限非负数值，收到 ${String(weight)}`);
    }
    if (!(name in channels)) {
      throw new Error(`weights 指定了未知通道 "${name}"`);
    }
    weightByChannel.set(name, weight);
  }

  const k = options.rrfK ?? DEFAULT_RRF_K;
  if (typeof k !== 'number' || !Number.isFinite(k) || k < MIN_RRF_K || k > MAX_RRF_K) {
    throw new Error(`rrfK 必须在 ${MIN_RRF_K}..${MAX_RRF_K} 之间，收到 ${String(k)}`);
  }

  interface Acc {
    score: number;
    rankEntries: Array<[string, number]>;
  }
  const acc = new Map<number, Acc>();

  for (const name of names) {
    const channel = channels[name];
    if (!Array.isArray(channel)) {
      throw new Error(`通道 "${name}" 必须是数组`);
    }
    const weight = weightByChannel.get(name) ?? 1;
    const seen = new Set<number>();
    let rank = 0;
    for (const item of channel) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        throw new Error(`通道 "${name}" 包含无效条目`);
      }
      assertPositiveSafeId(item.id, `通道 "${name}"`);
      if (seen.has(item.id)) continue; // 去重：保留首次出现
      seen.add(item.id);
      rank += 1;
      if (weight <= 0) continue; // 零权重通道不产生任何贡献
      let entry = acc.get(item.id);
      if (!entry) {
        entry = { score: 0, rankEntries: [] };
        acc.set(item.id, entry);
      }
      entry.score += weight / (k + rank);
      entry.rankEntries.push([name, rank]);
    }
  }

  const results: FusedItem[] = [];
  for (const [id, entry] of acc) {
    results.push({ id, score: entry.score, ranks: Object.fromEntries(entry.rankEntries) });
  }
  return results.sort((a, b) => b.score - a.score || a.id - b.id);
}

// ---------------------------------------------------------------------------
// weightedHybridFusion
// ---------------------------------------------------------------------------

export interface KeywordRow {
  id: number;
  /** 关键词原始得分（如 scoreItem 输出），参与融合前按批内最大值归一化到 [0,1]。 */
  score: number;
  /** 精确匹配保护标记：为 true 时最终得分乘以 exactBoost。 */
  exactMatch?: boolean;
}

export interface VectorRow {
  id: number;
  /** 余弦相似度（[-1,1]），参与融合前截断到 [0,1]。 */
  score: number;
}

export interface HybridFusionOptions {
  /** 关键词权重，默认 0.7，范围 0..1（含）。 */
  keywordWeight?: number;
  /** 向量权重，默认 0.3，范围 0..1（含）。 */
  vectorWeight?: number;
  /** 精确匹配提升倍数，默认 1.25，必须 >= 1。 */
  exactBoost?: number;
}

export interface HybridFusedItem {
  id: number;
  score: number;
}

export const DEFAULT_KEYWORD_WEIGHT = 0.7;
export const DEFAULT_VECTOR_WEIGHT = 0.3;
export const DEFAULT_EXACT_BOOST = 1.25;

function validateScoreRow(row: { id: number; score: number }, label: string): void {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    throw new Error(`${label} 包含无效条目`);
  }
  assertPositiveSafeId(row.id, label);
  if (typeof row.score !== 'number' || !Number.isFinite(row.score)) {
    throw new Error(`${label} 的 score 必须是有限数值，收到 ${String(row.score)}`);
  }
}

/**
 * 关键词 + 向量混合融合：
 *  - 关键词得分按批内最大值归一化到 [0,1]（无关键词命中则为 0）；
 *  - 余弦得分截断到 [0,1]（负相似度视为 0、>1 视为 1）；
 *  - score = keywordWeight * 归一化关键词 + vectorWeight * 归一化余弦；
 *  - exactMatch === true 的条目最终得分再乘以 exactBoost（精确匹配保护）；
 *  - 每个列表内按首次出现去重，结果唯一，按 score 降序、id 升序。
 */
export function weightedHybridFusion(
  keywordRows: readonly KeywordRow[],
  vectorRows: readonly VectorRow[],
  options: HybridFusionOptions = {},
): HybridFusedItem[] {
  if (!Array.isArray(keywordRows)) throw new Error('keywordRows 必须是数组');
  if (!Array.isArray(vectorRows)) throw new Error('vectorRows 必须是数组');
  if (typeof options !== 'object' || options === null) {
    throw new Error('options 必须是对象');
  }

  const keywordWeight = options.keywordWeight ?? DEFAULT_KEYWORD_WEIGHT;
  const vectorWeight = options.vectorWeight ?? DEFAULT_VECTOR_WEIGHT;
  const exactBoost = options.exactBoost ?? DEFAULT_EXACT_BOOST;
  for (const [label, value] of [
    ['keywordWeight', keywordWeight],
    ['vectorWeight', vectorWeight],
  ] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${label} 必须是 0..1 之间的有限数值，收到 ${String(value)}`);
    }
  }
  if (typeof exactBoost !== 'number' || !Number.isFinite(exactBoost) || exactBoost < 1) {
    throw new Error(`exactBoost 必须是 >= 1 的有限数值，收到 ${String(exactBoost)}`);
  }

  const keywordBy = new Map<number, KeywordRow>();
  let maxKeywordScore = 0;
  for (const row of keywordRows) {
    validateScoreRow(row, 'keywordRows');
    if (keywordBy.has(row.id)) continue; // 去重：保留首次出现
    keywordBy.set(row.id, row);
    if (row.score > maxKeywordScore) maxKeywordScore = row.score;
  }

  const vectorBy = new Map<number, number>();
  for (const row of vectorRows) {
    validateScoreRow(row, 'vectorRows');
    if (vectorBy.has(row.id)) continue;
    vectorBy.set(row.id, row.score);
  }

  const ids = new Set<number>([...keywordBy.keys(), ...vectorBy.keys()]);
  const results: HybridFusedItem[] = [];
  for (const id of ids) {
    const kw = keywordBy.get(id);
    const vectorScore = vectorBy.get(id);
    const normalizedKeyword = kw !== undefined && maxKeywordScore > 0
      ? Math.max(0, Math.min(1, kw.score / maxKeywordScore))
      : 0;
    const normalizedVector = vectorScore === undefined ? 0 : Math.max(0, Math.min(1, vectorScore));
    let score = keywordWeight * normalizedKeyword + vectorWeight * normalizedVector;
    if (kw?.exactMatch === true) score *= exactBoost;
    results.push({ id, score });
  }

  return results.sort((a, b) => b.score - a.score || a.id - b.id);
}
