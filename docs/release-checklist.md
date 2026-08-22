# 上线检查清单

## 代码与数据

- [ ] `git diff --check` 无错误。
- [ ] `npm test` 全部通过。
- [ ] `npm run build` 全部通过。
- [ ] 数据库改动是向前兼容的，旧版在回滚期间仍可运行。
- [ ] 未提交 `.env`、密钥、生产数据、联系方式或原始搜索词。
- [ ] 新配置有保守默认值和可用的关闭开关。

## 搜索与推荐

- [ ] 用冻结匿名 Benchmark 对比 Recall@10、NDCG@10、MRR、零结果率和 P95。
- [ ] 用生产数量级执行 `EXPLAIN ANALYZE`，确认查询计划和扫描边界。
- [ ] 更换 Embedding 模型/维度时提升 `EMBEDDING_MODEL_VERSION`。
- [ ] 只运行一个回填进程，确认完成率后再开启混合检索。
- [ ] 推荐从 5% 灰度开始，不直接调到 100%。

## 生产发布

- [ ] GitHub Actions 测试、构建、上传与激活步骤全部成功。
- [ ] `readlink -f /srv/campus-market/current` 指向目标 commit。
- [ ] 本机和公网 `/api/health` 都返回 `{"ok":true}`。
- [ ] 首页返回 200，登录、发布、搜索和商品详情做最小冒烟验证。
- [ ] systemd 无重启循环，Web/TEI 内存低于 High 线。
- [ ] `item_embeddings` 无长时间 `processing`，`failed` 没有持续增长。

## 观察与回退

- [ ] 记录发布 commit、工作流 URL、算法版本、灰度比例和开始时间。
- [ ] 观察 5xx、P95、零结果率、CTR、收藏率、会话发起率和覆盖率。
- [ ] 已知道本次发布的快速降级开关和上一 release 路径。
- [ ] 错误率、延迟或核心业务指标明显恶化时停止扩大灰度并降级/回滚。
