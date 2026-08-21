# 搜索基线与离线评测

## 当前方案

`GET /api/items` 在同校、在售等硬过滤条件内执行参数化检索。搜索文本经过 Unicode NFKC、拉丁字母小写、标点清理和空白归一化，再进行有界的校园别名扩展。

内置别名包括：

- 高数 ↔ 高等数学
- 数分 ↔ 数学分析
- 大物 ↔ 大学物理
- 计组 ↔ 计算机组成原理

**多个查询词之间是 AND 关系**：每个原始查询词生成一组候选变体（含别名），组内是 OR 替代（任一变体命中任一字段即可），组与组之间用 AND 连接。例如 `iphone 15` 必须同时命中 `iphone` 与 `15`；`高数教材` 必须命中 `高数`（或其别名 `高等数学`）与 `教材`。整句匹配（标题完全相等 / 标题包含整句）作为额外加分条件并入 WHERE，不影响词间 AND 语义。

默认相关度权重为：精确标题 100、标题短语 60、标题词 30、类目词 20、描述词 10。含数字的型号和版本词使用非数字边界匹配，避免 `15` 命中 `150` 或 `2015`；该保护按查询词逐个生效，`iphone 15` 不会返回仅含 `iphone` 或 `15` 落在更长数字里的商品。所有用户文本都通过 SQL 参数传入，不拼接进 SQL 片段。

显式的价格排序会覆盖相关度排序；所有排序最终都使用发布时间和商品 ID 作为稳定的决胜条件。

检索规划（`backend/server/search.ts`）是纯函数、不依赖数据库，其 AND 分组、参数占位符对齐、精确数字边界、关键词长度及深分页上限均有 DB-free 单元测试（`backend/test/search.test.ts`）。搜索接口拒绝归一化后超过 40 个字符的关键词，并将最大 OFFSET 限制为 10,000。指标函数（Recall@10、NDCG@10、MRR、零结果率、P95）独立在 `backend/server/search-metrics.ts` 并配有测试（`backend/test/search-metrics.test.ts`），供 CLI 与后续持续评测复用。

## Benchmark 格式

```json
{
  "dataset": "benchmark-v1",
  "production": true,
  "description": "已匿名化的搜索标注",
  "items": [
    { "id": 1, "title": "高等数学第七版", "category": "教材", "description": "同济版上下册" }
  ],
  "queries": [
    { "query": "高数教材", "relevant": [1] }
  ]
}
```

仓库中的 `backend/data/search-example.json` 是手工构造的流程示例，不代表生产效果。真实数据应先匿名化，并避免把用户身份、联系方式或聊天内容写入 Benchmark。

## 运行评测

```bash
npm run search:evaluate
npm run search:evaluate -- path/to/benchmark.json
npm run search:evaluate -- path/to/benchmark.json --json search-results.json
```

脚本同时输出旧版整句 `LIKE` baseline 和增强检索的 Recall@10、NDCG@10、MRR、零结果率与 P95 离线打分延迟。前三项只在至少有一个相关商品的标注查询上取平均；零结果率覆盖全部查询。示例数据的指标只用于验证流程；正式结论必须来自 #2 的冻结 Benchmark。

## 限制与后续工作

**诚实说明：内置示例数据（`backend/data/search-example.json`）的指标只用于验证评估流程，不代表线上效果。** 正式结论必须来自冻结的匿名 Benchmark（`production: true`），并且要在真实生产库上运行 `EXPLAIN ANALYZE` 验证 `REGEXP_LIKE`/`LIKE` 的索引使用与端到端延迟；当前输出里的 P95 是内存打分耗时，不是线上查询延迟。

当前查询仍基于 `LIKE` 与 `REGEXP_LIKE`，数据规模增大后需要结合生产数据运行 `EXPLAIN ANALYZE`。MySQL 8 ngram FULLTEXT 已纳入候选方案，但本次暂不增加强制索引迁移：应先在冻结 Benchmark 上验证召回收益，并评估索引体积、写入成本、中文 token 大小和生产回滚方式。

本阶段也不包含向量召回；后续混合检索应复用本文的 Benchmark，并保留关键词通道作为型号和版本的精确保护。
