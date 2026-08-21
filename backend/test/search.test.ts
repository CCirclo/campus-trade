import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAliasMap, buildKeywordSearch, DEFAULT_PAGE_SIZE, exactTokenPattern, expandTerm,
  isExactToken, MAX_OFFSET, MAX_PAGE, MAX_PAGE_SIZE, normalizeKeyword, parseKeyword, parsePagination, scoreItem, tokenize,
} from '../server/search.js';

test('keyword normalization applies NFKC, lowercases Latin and removes irrelevant punctuation', () => {
  assert.equal(normalizeKeyword('  Ｈｉ ＩＰＨＯＮＥ 15 '), 'hi iphone 15');
  assert.equal(normalizeKeyword('高数　教材'), '高数 教材'); // 全角空格 → 半角
  assert.equal(normalizeKeyword('  iPhone，15（Pro）!!! '), 'iphone 15 pro');
  assert.equal(normalizeKeyword('  a   b  c  '), 'a b c');
  assert.equal(normalizeKeyword(''), '');
  assert.equal(normalizeKeyword(undefined), '');
});

test('keyword parser rejects normalized input longer than the documented limit', () => {
  assert.equal(parseKeyword('Ａ'.repeat(40)), 'a'.repeat(40));
  assert.deepEqual(parseKeyword('Ａ'.repeat(41)), { error: 'keyword 最多 40 个字符' });
});

test('tokenize lower-cases and splits on whitespace', () => {
  assert.deepEqual(tokenize('iPhone 15 Pro'), ['iphone', '15', 'pro']);
  assert.deepEqual(tokenize('  高数  教材 '), ['高数', '教材']);
  assert.deepEqual(tokenize(''), []);
});

test('alias expansion is bidirectional and bounded', () => {
  const single = buildAliasMap({ '高数': ['高等数学'] });
  assert.deepEqual(expandTerm('高数', single, 4), ['高数', '高等数学']);
  assert.deepEqual(expandTerm('高等数学', single, 4), ['高等数学', '高数']);
  assert.deepEqual(expandTerm('高数教材', single, 4), ['高数教材', '高等数学教材']);
  assert.equal(expandTerm('高数', single, 0).length, 1); // maxPerTerm=0 → 仅原词

  const all = buildAliasMap({
    '高数': ['高等数学'],
    '数分': ['数学分析'],
    '大物': ['大学物理'],
    '计组': ['计算机组成原理'],
  });
  const variants = expandTerm('高数', all, 4);
  assert.ok(variants.includes('高等数学'));
  assert.ok(variants.length <= 5); // 有界：原词 + maxPerTerm
  assert.deepEqual(expandTerm('数学', all, 4), ['数学']); // 通用词不扩展
});

test('bounded total expansion caps the final term list', () => {
  const built = buildKeywordSearch('高数 数分 大物 计组 教材 手机 键盘 鼠标 台灯 充电器 数据线 耳机 背包', { maxTerms: 8 });
  assert.ok(built.terms.length <= 8);
});

test('exact tokens detect numeric, model and version terms', () => {
  assert.equal(isExactToken('15'), true);
  assert.equal(isExactToken('m2'), true);
  assert.equal(isExactToken('14.2'), true);
  assert.equal(isExactToken('iphone'), false);
  assert.equal(isExactToken('pro'), false);
});

test('exact token patterns escape regex metacharacters and bound by non-digits', () => {
  assert.equal(exactTokenPattern('15'), '(^|[^0-9])15([^0-9]|$)');
  assert.equal(exactTokenPattern('14.2'), '(^|[^0-9])14\\.2([^0-9]|$)');
  assert.match(exactTokenPattern('a+b'), /a\\\+b/);
});

test('SQL builder keeps placeholders and args aligned, never interpolates user text', () => {
  const built = buildKeywordSearch("iPhone 15' --");
  // 每个 ? 占位符都有且仅有一个参数
  const placeholderCount = (built.whereClause + ' ' + built.scoreExpr).split('?').length - 1;
  assert.equal(placeholderCount, built.whereArgs.length + built.scoreArgs.length);
  // 用户文本绝不能以字面量形式出现在 SQL 片段中
  assert.ok(!built.whereClause.includes("15'"));
  assert.ok(!built.whereClause.includes('--'));
  assert.ok(!built.whereClause.includes('iPhone'));
});

test('alias terms flow into the builder and the full statement stays aligned', () => {
  const built = buildKeywordSearch('高数 15');
  assert.ok(built.terms.includes('高等数学'));
  const whereSql = `SELECT COUNT(*) FROM items i WHERE i.school_id=? AND i.status='在售' AND ${built.whereClause}`;
  const countArgs = ['ruc_suzhou', ...built.whereArgs];
  const selectSql = `${whereSql} ORDER BY ${built.scoreExpr} DESC, i.created_at DESC, i.id DESC LIMIT 20 OFFSET 0`;
  const selectArgs = [...countArgs, ...built.scoreArgs];
  assert.equal((whereSql.match(/\?/g) || []).length, countArgs.length);
  assert.equal((selectSql.match(/\?/g) || []).length, selectArgs.length);
});

test('scoreItem ranks exact phrase above partial and stays deterministic', () => {
  const built = buildKeywordSearch('iphone 15');
  const exact = { title: 'iPhone 15 手机壳', category: '生活用品', description: '' };
  const partial = { title: 'iPhone 14 手机壳', category: '生活用品', description: '' };
  assert.ok(scoreItem(exact, built) > scoreItem(partial, built));
  assert.equal(scoreItem(exact, built), scoreItem(exact, built));
});

test('numeric tokens never match inside longer numbers', () => {
  const built = buildKeywordSearch('15');
  // 词条命中标题(30) + 整句精确 token 命中标题(60)
  assert.equal(scoreItem({ title: 'iPhone 15 手机壳' }, built), 30 + 60);
  assert.equal(scoreItem({ title: 'iPhone 150 保护壳' }, built), 0);
  assert.equal(scoreItem({ title: '2015 日历' }, built), 0);
  const m2 = buildKeywordSearch('m2');
  assert.equal(scoreItem({ title: 'MacBook Air M2' }, m2) > 0, true);
  assert.equal(scoreItem({ title: 'MacBook m2022 款' }, m2), 0);
});

test('distinct query tokens are AND groups: every original token must match', () => {
  const built = buildKeywordSearch('iphone 15');
  // 两个原始词各自独立成组
  assert.deepEqual(built.groups, [['iphone'], ['15']]);
  // 两个词都在 → 命中
  assert.ok(scoreItem({ title: 'iPhone 15 手机壳', category: '生活用品', description: '' }, built) > 0);
  // 只有 iphone、没有 15 → 0 分（AND 语义）
  assert.equal(scoreItem({ title: 'iPhone 14 手机壳', category: '生活用品', description: '' }, built), 0);
  // 只有 15、没有 iphone → 0 分（AND 语义）
  assert.equal(scoreItem({ title: '手机壳 全新', category: '生活用品', description: '型号 15 使用' }, built), 0);
  // 两个词分布在不同字段 → 仍命中
  assert.ok(scoreItem({ title: 'iPhone 手机壳', category: '生活用品', description: '型号 15 使用' }, built) > 0);
});

test('alias variants stay inside one AND group and keep the token semantics', () => {
  const built = buildKeywordSearch('高数 教材');
  // 高数组含别名变体，教材组独立
  assert.deepEqual(built.groups, [['高数', '高等数学'], ['教材']]);
  // 用别名“高等数学”命中高数组，同时命中教材组 → 通过
  assert.ok(scoreItem({ title: '高等数学辅导讲义', category: '教材', description: '' }, built) > 0);
  // 只命中高数组，缺教材 → 0 分
  assert.equal(scoreItem({ title: '高等数学第七版', category: '生活用品', description: '同济版' }, built), 0);
});

test('exact numeric protection applies per token inside AND groups', () => {
  // “iphone 15” 不能返回 15 落在更长数字里、或缺少任一 token 的商品
  const built = buildKeywordSearch('iphone 15');
  assert.equal(scoreItem({ title: 'iPhone 150 手机壳', category: '生活用品', description: '' }, built), 0);
  assert.equal(scoreItem({ title: 'iPhone 2015 款', category: '生活用品', description: '' }, built), 0);
  assert.equal(scoreItem({ title: 'Apple Watch 表带', category: '生活用品', description: '适配 iPhone' }, built), 0);
  // 型号词单独出现也受边界保护
  const m2 = buildKeywordSearch('macbook m2');
  assert.ok(scoreItem({ title: 'MacBook Air M2 二手', category: '电子产品', description: '' }, m2) > 0);
  assert.equal(scoreItem({ title: 'MacBook Air m2022 款', category: '电子产品', description: '' }, m2), 0);
});

test('WHERE uses one AND group per original token plus phrase OR, args stay aligned', () => {
  const built = buildKeywordSearch('iphone 15');
  assert.ok(built.whereClause.includes('AND'));
  assert.match(built.whereClause, /REGEXP_LIKE\(i\.\w+, \?, 'i'\)/); // 数值词用非数字边界
  // 组结构：((iphone…) AND (15…)) OR (短语…)
  const whereSql = `SELECT COUNT(*) FROM items i WHERE i.school_id=? AND i.status='在售' AND ${built.whereClause}`;
  const countArgs = ['ruc_suzhou', ...built.whereArgs];
  const selectSql = `${whereSql} ORDER BY ${built.scoreExpr} DESC, i.created_at DESC, i.id DESC LIMIT 20 OFFSET 0`;
  const selectArgs = [...countArgs, ...built.scoreArgs];
  assert.equal((whereSql.match(/\?/g) || []).length, countArgs.length);
  assert.equal((selectSql.match(/\?/g) || []).length, selectArgs.length);
});

test('extreme pages and expensive deep offsets are rejected', () => {
  assert.ok('error' in parsePagination(String(MAX_PAGE + 1), '20'));
  assert.ok('error' in parsePagination(String(Number.MAX_SAFE_INTEGER), '20'));
  assert.ok('error' in parsePagination('9007199254740991', '100'));
  assert.deepEqual(parsePagination(String(MAX_OFFSET / 100 + 1), '100'), { page: 101, pageSize: 100 });
  assert.ok('error' in parsePagination(String(MAX_OFFSET / 100 + 2), '100'));
});

test('pagination validates page and pageSize with defaults and bounds', () => {
  assert.deepEqual(parsePagination(undefined, undefined), { page: 1, pageSize: DEFAULT_PAGE_SIZE });
  assert.deepEqual(parsePagination('2', '50'), { page: 2, pageSize: 50 });
  assert.deepEqual(parsePagination('', ''), { page: 1, pageSize: DEFAULT_PAGE_SIZE });
  assert.deepEqual(parsePagination('1', String(MAX_PAGE_SIZE)), { page: 1, pageSize: MAX_PAGE_SIZE });
  assert.ok('error' in parsePagination('0', '20'));
  assert.ok('error' in parsePagination('abc', '20'));
  assert.ok('error' in parsePagination('2.5', '20'));
  assert.ok('error' in parsePagination('-1', '20'));
  assert.ok('error' in parsePagination('1', '0'));
  assert.ok('error' in parsePagination('1', '101'));
});
