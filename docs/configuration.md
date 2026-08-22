# 配置说明

开发环境从 `.env.example` 开始，生产环境从 `backend/deploy/production.env.example` 开始。生产真实文件为 `/etc/campus-market/.env`，权限必须为 `600`。

## 核心与数据库

| 变量 | 生产建议 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `production` | 启用生产安全行为 |
| `HOST` | `127.0.0.1` | 只允许 nginx 代理 |
| `PORT` | `8787` | API 本机端口 |
| `APP_ORIGIN` | 完整 HTTPS 源 | 状态变更请求的 Origin 校验 |
| `VITE_BASE_PATH` | `/campus-trade/` | 前端部署子路径 |
| `MYSQL_*` | 独立库与最小权限账户 | 连接数默认 10，小内存机可调低 |

## 隐私与推荐

| 变量 | 默认/范围 | 说明 |
| --- | --- | --- |
| `ANALYTICS_HASH_SECRET` | 建议独立 32+ 字符 | 搜索指纹 HMAC 密钥 |
| `CURSOR_SIGNING_SECRET` | 建议另一个 32+ 字符 | 推荐游标签名密钥 |
| `RECOMMENDATION_ENABLED` | `false` | 推荐总开关 |
| `RECOMMENDATION_ROLLOUT_PERCENT` | `0..100` | 稳定用户/会话灰度 |
| `RECOMMENDATION_ALGORITHM_VERSION` | `home-rules-v1` | 事件与指标分组版本 |

两个专用密钥缺失时，生产启动会分别生成独立的 256 位随机值并写入 `runtime_secrets`。设置环境密钥后以环境值为准；更换游标密钥会使已签发游标失效。

## Embedding 与混合检索

| 变量 | 建议值 | 作用 |
| --- | --- | --- |
| `EMBEDDING_ENABLED` | 服务就绪后 `true` | 生成/读取向量 |
| `HYBRID_SEARCH_ENABLED` | 回填完成后 `true` | 混合搜索总开关 |
| `EMBEDDING_API_URL` | `http://127.0.0.1:8080/v1/embeddings` | 仅允许 HTTPS 或本机 HTTP |
| `EMBEDDING_MODEL` | `BAAI/bge-small-zh-v1.5` | TEI 模型 ID |
| `EMBEDDING_MODEL_VERSION` | `bge-small-zh-v1.5@1` | 向量隔离/重建版本 |
| `EMBEDDING_DIMENSIONS` | `512` | 响应维度强校验 |
| `EMBEDDING_TIMEOUT_MS` | `5000` | 单次请求与排队超时 |
| `EMBEDDING_BATCH_SIZE` | `1` | 兼容配置；代码强制单条 |
| `EMBEDDING_MAX_PENDING` | `8` | 进程内等待上限，最大 32 |
| `EMBEDDING_VECTOR_SCAN_LIMIT` | `500` | 每次查询向量扫描上限，最大 1000 |
| `HYBRID_SPARSE_RESULT_THRESHOLD` | `12` | 低于此值时允许稀疏搜索排队 |

变更模型或向量维度时必须同时提升 `EMBEDDING_MODEL_VERSION`，先回填新版本，再开启混合检索。

## 外部服务

- `COS_*`：使用只允许目标存储桶所需操作的密钥。
- `EMAIL_*`：SMTP 密码应使用授权码，不使用邮箱登录密码。
- `ADMIN_EMAILS`：逗号分隔；只对已有账号授权。
