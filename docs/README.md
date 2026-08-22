# 项目文档索引

| 文档 | 适用场景 |
| --- | --- |
| [`architecture.md`](architecture.md) | 理解 Web、API、MySQL、推荐和 Embedding 的边界与数据流 |
| [`api.md`](api.md) | 对接 REST API、鉴权、请求与响应 |
| [`configuration.md`](configuration.md) | 配置开发/生产环境变量和密钥 |
| [`search.md`](search.md) | 关键词、向量、混合检索及离线评测 |
| [`recommendation.md`](recommendation.md) | 行为事件、推荐策略、灰度与指标 |
| [`operations.md`](operations.md) | 生产部署、Embedding 安装、监控、降级、回滚和排障 |
| [`release-checklist.md`](release-checklist.md) | 每次上线前后的可执行检查清单 |
| [`github-actions-deployment.md`](github-actions-deployment.md) | GitHub Actions 与服务器初次接入 |

生产事实以代码、`backend/deploy/production.env.example` 和已安装的 systemd 单元为准。真实 `.env`、邮箱、COS、SSH 和数据库密钥不得进入仓库。
