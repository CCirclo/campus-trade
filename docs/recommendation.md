# 行为事件与首页推荐上线说明

## 数据边界

- 事件只记录事件标识、请求标识、匿名会话标识、服务端会话确定的用户、商品、来源、位置、算法版本和时间。
- 搜索词在进程内做 NFKC 归一化后使用 `ANALYTICS_HASH_SECRET` 进行 HMAC-SHA256，原文不落库。
- 不采集聊天内容、微信号、邮箱或其他联系方式。客户端提交的 `userId` 会被忽略。
- 匿名用户只允许上报搜索、曝光和点击；收藏与会话转化必须由登录态或业务接口生成。
- 事件保留 90 天，服务启动时清理过期记录；分析接口仅管理员可访问。

## 推荐策略

`GET /api/recommendations` 仅召回同校、在售的商品。规则模型使用近期类目兴趣、新鲜度、平滑热度、价格相似度和确定性探索奖励；最近 24 小时已曝光商品会受到降权。多样性重排限制连续卖家和六条窗口内的类目集中度，但不会丢弃有效候选。

未命中灰度的用户使用 `latest-v1`，因此关闭推荐或将灰度比例设为 0 即可立即回退最新发布。灰度分桶由登录用户 ID 或匿名 `sessionId` 稳定决定。游标使用 HMAC-SHA256 签名、30 分钟过期，并绑定学校、身份和算法版本。

## 配置与灰度

生产必须配置互不相同的随机密钥：

```dotenv
ANALYTICS_HASH_SECRET=至少32字符随机值（推荐）
CURSOR_SIGNING_SECRET=另一个至少32字符随机值（推荐）
RECOMMENDATION_ENABLED=true
RECOMMENDATION_ROLLOUT_PERCENT=5
RECOMMENDATION_ALGORITHM_VERSION=home-rules-v1
```

为兼容旧生产环境，专用密钥缺失时会分别生成独立的 256 位随机值并持久化到 `runtime_secrets`；环境中的专用随机密钥仍是首选。

推荐权重可通过 `RECOMMENDATION_WEIGHT_INTEREST/FRESHNESS/POPULARITY/PRICE/EXPLORATION` 和 `RECOMMENDATION_REPEAT_PENALTY` 调整。所有值均有边界校验，非法配置自动使用保守默认值。

## 验证与监控

```bash
npm test
npm run build
npm run recommendation:evaluate
```

管理员指标接口：`GET /api/admin/analytics/recommendations?days=7`，按 `source + algorithm_version` 返回曝光、点击、收藏、会话、覆盖商品数及对应比率。

灰度顺序建议为 5% → 20% → 50% → 100%。每阶段至少观察一个完整校园交易周期。接口错误率或 P95 明显恶化、CTR/收藏率持续下降、商品或卖家覆盖显著收缩时，设置 `RECOMMENDATION_ENABLED=false` 即可回退，无需数据库回滚。

合成离线数据只验证算法约束和评测管线，不代表线上收益；版本间业务效果必须使用事件表中的真实曝光分母比较。
