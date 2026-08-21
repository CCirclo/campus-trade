// backend/server/search.ts
//
// 纯函数、可离线测试的搜索规划模块（不访问数据库）：
//  - Unicode NFKC 归一化（全角→半角、拉丁小写、清理无关标点）
//  - 有界的校园别名扩展（高数↔高等数学 …）
//  - 词间 AND、组内 OR 的参数化加权 SQL（title > category > description；短语/精确标题加权）
//  - 数字/型号/版本 token 的精确匹配保护（REGEXP_LIKE 非数字边界）
//  - 分页参数校验（页码、每页数量及最大 offset，避免昂贵的深分页）
//
// 安全约定：SQL 片段只由固定模板 + 占位符（?）构成，用户文本一律进入参数数组。

export interface SearchOptions {
  aliases?: Readonly<Record<string, readonly string[]>>;
  /** 每个词条最多生成的别名变体数（不含原词）。 */
  maxPerTerm?: number;
  /** 参与匹配的总词条数上限（含别名变体）。 */
  maxTerms?: number;
}

export const DEFAULT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  '高数': ['高等数学'],
  '数分': ['数学分析'],
  '大物': ['大学物理'],
  '计组': ['计算机组成原理'],
};

export const SEARCH_WEIGHTS = {
  title: 30,
  category: 20,
  description: 10,
  phraseTitle: 60,
  exactTitle: 100,
} as const;

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_KEYWORD_LENGTH = 40;
/** 页码硬上限，先拒绝异常大的数值输入。 */
export const MAX_PAGE = 1_000_000;
/** 深分页上限，避免公开搜索接口触发代价过高的数据库 OFFSET 扫描。 */
export const MAX_OFFSET = 10_000;

export const DEFAULT_SEARCH_OPTIONS: Required<SearchOptions> = {
  aliases: DEFAULT_ALIASES,
  maxPerTerm: 4,
  maxTerms: 12,
};

/** Unicode NFKC 归一化：全角→半角、拉丁字母小写、无关标点转为空格。 */
export function normalizeKeyword(input: unknown): string {
  return String(input ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}.+\-]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** 归一化并校验搜索关键词；超长输入必须显式拒绝，不能静默截断并改变查询语义。 */
export function parseKeyword(input: unknown): string | { error: string } {
  const keyword = normalizeKeyword(input);
  if (keyword.length > MAX_KEYWORD_LENGTH) {
    return { error: `keyword 最多 ${MAX_KEYWORD_LENGTH} 个字符` };
  }
  return keyword;
}

/** 将归一化后的关键词拆分为小写搜索词。 */
export function tokenize(normalized: string): string[] {
  return normalized.toLowerCase().split(/\s+/).filter(Boolean);
}

/** 判断一个词是否属于需要“精确匹配保护”的数字/型号/版本 token。 */
export function isExactToken(term: string): boolean {
  return /\d/.test(term);
}

/** 转义用户输入，使其可安全用作 REGEXP 模式（作为参数值传入，而非拼接 SQL）。 */
export function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 生成“非数字边界”的精确匹配模式（配合 REGEXP_LIKE(col, ?, 'i') 使用）：
 *  - "15" 不会误匹配 "1500" / "2015"
 *  - "m2" 不会误匹配 "m2022"
 *  - 仍可命中 "iphone15"（字母紧邻）这类常见写法
 */
export function exactTokenPattern(term: string): string {
  return `(^|[^0-9])${escapeRegex(term)}([^0-9]|$)`;
}

/** 双向别名表：高数↔高等数学、数分↔数学分析、大物↔大学物理、计组↔计算机组成原理。 */
export function buildAliasMap(aliases: Readonly<Record<string, readonly string[]>>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [key, rawValues] of Object.entries(aliases)) {
    const normalizedKey = key.normalize('NFKC');
    const values = rawValues.map(v => v.normalize('NFKC')).filter(v => v !== normalizedKey);
    const forward = map.get(normalizedKey) ?? [];
    for (const value of values) {
      if (!forward.includes(value)) forward.push(value);
      const reverse = map.get(value) ?? [];
      if (!reverse.includes(normalizedKey)) reverse.push(normalizedKey);
      map.set(value, reverse);
    }
    map.set(normalizedKey, forward);
  }
  return map;
}

/** 有界别名扩展：词条命中别名键/值时，生成替换后的变体（每词条最多 maxPerTerm 个变体）。 */
export function expandTerm(term: string, aliasMap: ReadonlyMap<string, string[]>, maxPerTerm: number): string[] {
  const variants = new Set([term]);
  for (const [key, values] of aliasMap) {
    if (variants.size >= 1 + maxPerTerm) break;
    if (term.includes(key)) {
      for (const value of values) {
        if (variants.size >= 1 + maxPerTerm) break;
        variants.add(term.replace(key, value));
      }
    } else {
      const hit = values.find(value => term.includes(value));
      if (hit) variants.add(term.replace(hit, key));
    }
  }
  return [...variants];
}

export interface BuiltSearch {
  /** WHERE 中的布尔表达式（仅含 ? 占位符）。 */
  whereClause: string;
  /** ORDER BY 使用的加权相关度表达式（仅含 ? 占位符）。 */
  scoreExpr: string;
  /** WHERE 占位符对应的参数。 */
  whereArgs: unknown[];
  /** 相关度表达式占位符对应的参数（位于 SQL 中 ORDER BY 之后）。 */
  scoreArgs: unknown[];
  /** 实际参与匹配的搜索词（含别名变体），供离线评估/排序复用。 */
  terms: string[];
  /**
   * 每个原始查询词对应的候选变体组（含别名）。组内是 OR 替代（任一变体命中任一字段即可），
   * 组与组之间是 AND（“iphone 15” 必须同时命中 iphone 与 15）。
   */
  groups: string[][];
  /** 归一化后的原始短语（用于精确标题/短语加权）。 */
  phrase: string;
}

const COLUMNS = ['title', 'category', 'description'] as const;

export function buildKeywordSearch(normalized: string, options: SearchOptions = {}): BuiltSearch {
  const opts: Required<SearchOptions> = {
    aliases: options.aliases ?? DEFAULT_SEARCH_OPTIONS.aliases,
    maxPerTerm: options.maxPerTerm ?? DEFAULT_SEARCH_OPTIONS.maxPerTerm,
    maxTerms: options.maxTerms ?? DEFAULT_SEARCH_OPTIONS.maxTerms,
  };
  const aliasMap = buildAliasMap(opts.aliases);

  // 每个原始查询词生成一组变体（含别名）。组与组之间是 AND 关系；
  // maxTerms 限制总词条数，maxPerTerm 限制每个词条的变体数。
  const terms: string[] = [];
  const groups: string[][] = [];
  for (const token of tokenize(normalized)) {
    if (terms.length >= opts.maxTerms) break;
    const group: string[] = [];
    for (const variant of expandTerm(token, aliasMap, opts.maxPerTerm)) {
      if (terms.length >= opts.maxTerms) break;
      if (!terms.includes(variant)) {
        terms.push(variant);
        group.push(variant);
      }
    }
    if (group.length > 0) groups.push(group);
  }

  const whereArgs: unknown[] = [];
  const scoreArgs: unknown[] = [];
  const groupClauses: string[] = [];
  const scoreParts: string[] = [];

  const addField = (column: (typeof COLUMNS)[number], term: string, weight: number): string => {
    if (isExactToken(term)) {
      const pattern = exactTokenPattern(term);
      whereArgs.push(pattern);
      scoreArgs.push(pattern);
      scoreParts.push(`CASE WHEN REGEXP_LIKE(i.${column}, ?, 'i') THEN ${weight} ELSE 0 END`);
      return `REGEXP_LIKE(i.${column}, ?, 'i')`;
    }
    const pattern = `%${term}%`;
    whereArgs.push(pattern);
    scoreArgs.push(pattern);
    scoreParts.push(`CASE WHEN i.${column} LIKE ? THEN ${weight} ELSE 0 END`);
    return `i.${column} LIKE ?`;
  };

  // 组内：“变体 × 字段”的 OR 替代；组与组之间用 AND 连接。
  for (const group of groups) {
    const clauses: string[] = [];
    for (const term of group) {
      for (const column of COLUMNS) clauses.push(addField(column, term, SEARCH_WEIGHTS[column]));
    }
    groupClauses.push(`(${clauses.join(' OR ')})`);
  }

  // 整句加权：标题完全相等 > 标题包含整句。整句子句是各 AND 组的子集，
  // 用 OR 并入 WHERE 不影响“词间 AND”语义，只作为额外命中加分。
  const phrase = normalized.toLowerCase();
  const phraseClauses: string[] = [];
  if (phrase) {
    const exact = isExactToken(phrase);
    whereArgs.push(phrase);
    scoreArgs.push(phrase);
    scoreParts.push(`CASE WHEN i.title = ? THEN ${SEARCH_WEIGHTS.exactTitle} ELSE 0 END`);
    phraseClauses.push('i.title = ?');
    if (exact) {
      const pattern = exactTokenPattern(phrase);
      whereArgs.push(pattern);
      scoreArgs.push(pattern);
      scoreParts.push(`CASE WHEN REGEXP_LIKE(i.title, ?, 'i') THEN ${SEARCH_WEIGHTS.phraseTitle} ELSE 0 END`);
      phraseClauses.push(`REGEXP_LIKE(i.title, ?, 'i')`);
    } else {
      const pattern = `%${phrase}%`;
      whereArgs.push(pattern);
      scoreArgs.push(pattern);
      scoreParts.push(`CASE WHEN i.title LIKE ? THEN ${SEARCH_WEIGHTS.phraseTitle} ELSE 0 END`);
      phraseClauses.push(`i.title LIKE ?`);
    }
  }

  const andExpr = groupClauses.join(' AND ');
  const phraseExpr = phraseClauses.length > 0 ? `(${phraseClauses.join(' OR ')})` : '';
  let whereClause: string;
  if (andExpr && phraseExpr) whereClause = `((${andExpr}) OR ${phraseExpr})`;
  else if (andExpr) whereClause = `(${andExpr})`;
  else if (phraseExpr) whereClause = phraseExpr;
  else whereClause = '(1=1)';

  return {
    whereClause,
    scoreExpr: `(${scoreParts.join(' + ')})`,
    whereArgs,
    scoreArgs,
    terms,
    groups,
    phrase,
  };
}

/**
 * 与 SQL 加权规则一致的内存打分（同一套权重、同一套精确 token 边界），
 * 供离线评估/排序复用，不依赖数据库。
 *
 * 与 SQL 的 AND 语义保持一致：任意一个原始查询词组在三个字段中都未命中时返回 0。
 */
export function scoreItem(item: { title: string; category?: string; description?: string }, built: BuiltSearch): number {
  const title = String(item.title ?? '').toLowerCase();
  const category = String(item.category ?? '').toLowerCase();
  const description = String(item.description ?? '').toLowerCase();
  const has = (text: string, term: string) => {
    if (isExactToken(term)) {
      return new RegExp(`(^|[^0-9])${escapeRegex(term)}([^0-9]|$)`, 'i').test(text);
    }
    return text.includes(term);
  };
  // AND 语义：每个原始查询词的变体组必须至少命中一个字段。
  for (const group of built.groups) {
    const matched = group.some(term => has(title, term) || has(category, term) || has(description, term));
    if (!matched) return 0;
  }
  let score = 0;
  for (const term of built.terms) {
    if (has(title, term)) score += SEARCH_WEIGHTS.title;
    if (has(category, term)) score += SEARCH_WEIGHTS.category;
    if (has(description, term)) score += SEARCH_WEIGHTS.description;
  }
  if (built.phrase) {
    if (title === built.phrase) score += SEARCH_WEIGHTS.exactTitle;
    if (has(title, built.phrase)) score += SEARCH_WEIGHTS.phraseTitle;
  }
  return score;
}

export interface PageParams {
  page: number;
  pageSize: number;
}

export function parsePagination(pageRaw: unknown, pageSizeRaw: unknown): PageParams | { error: string } {
  const page = pageRaw === undefined || pageRaw === null || pageRaw === '' ? DEFAULT_PAGE : Number(pageRaw);
  const pageSize = pageSizeRaw === undefined || pageSizeRaw === null || pageSizeRaw === '' ? DEFAULT_PAGE_SIZE : Number(pageSizeRaw);
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
    return { error: `page 必须是 1-${MAX_PAGE} 的整数` };
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    return { error: `pageSize 必须是 1-${MAX_PAGE_SIZE} 的整数` };
  }
  if ((page - 1) * pageSize > MAX_OFFSET) {
    return { error: `分页位置不能超过 ${MAX_OFFSET} 条，请缩小 page 或 pageSize` };
  }
  return { page, pageSize };
}
