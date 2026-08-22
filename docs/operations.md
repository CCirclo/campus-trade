# 生产运维手册

## 发布与回滚

`main` 推送触发 `.github/workflows/deploy.yml`：安装依赖、测试、生产构建、打包、SCP 上传，最后调用受限的 `/usr/local/sbin/deploy-campus-market`。脚本会：

1. 校验 release SHA 和 tar 路径，阻止绝对路径/`..` 越界。
2. 解压到 `/srv/campus-market/releases/<sha>` 并以 `campus-market` 身份安装生产依赖。
3. 原子切换 `/srv/campus-market/current` 软链接后重启 systemd。
4. 本机 `/api/health` 失败时自动恢复上一 release。
5. 成功后保留最新 5 个 release。

手动验证：

```bash
systemctl status campus-market-web.service --no-pager
curl -fsS http://127.0.0.1:8787/api/health
curl -fsS https://20250821cdcdifc.top/campus-trade/api/health
readlink -f /srv/campus-market/current
```

## 安装本地 Embedding

前置：Docker、可访问 GHCR/Hugging Face、至少 1.5 GiB `MemAvailable`，并允许部署用户只执行指定安装命令。

```bash
sudo /srv/campus-market/current/backend/deploy/install-local-embedding \
  /srv/campus-market/current
```

安装器会先检查内存，再拉取 TEI CPU 1.9 镜像，启动 `BAAI/bge-small-zh-v1.5`，通过 `/health` 后才更新应用环境并重启 Web。任何错误会恢复原 `.env`。

资源上限：

- Web：`MemoryHigh=384M`、`MemoryMax=512M`、`TasksMax=128`。
- TEI systemd：`MemoryHigh=640M`、`MemoryMax=768M`。
- Docker：704 MiB memory/swap、1 CPU、192 PIDs，仅绑定 `127.0.0.1:8080`。

旧商品首次回填：

```bash
cd /srv/campus-market/current
set -a; source /etc/campus-market/.env; set +a
npm run embeddings:rebuild
```

脚本严格单件处理。不要并行启动多个回填进程。若需从头重算，显式加 `--force`。

## 日常监控

```bash
systemctl is-active campus-market-web.service campus-embedding.service
systemctl show campus-market-web.service -p MemoryCurrent -p MemoryPeak
systemctl show campus-embedding.service -p MemoryCurrent -p MemoryPeak
docker stats campus-embedding --no-stream
journalctl -u campus-market-web.service -n 200 --no-pager
journalctl -u campus-embedding.service -n 200 --no-pager
```

MySQL 队列检查：

```sql
SELECT status,COUNT(*) count,MAX(retry_count) max_retry
FROM item_embeddings
GROUP BY status;

SELECT item_id,retry_count,next_retry_at,last_error,updated_at
FROM item_embeddings
WHERE status IN ('failed','processing')
ORDER BY updated_at DESC
LIMIT 50;
```

建议告警：Web 健康检查失败、TEI 连续重启、内存超过 High 线、`failed` 持续增长、搜索零结果率/P95 显著恶化、推荐错误率或覆盖率异常。

## 快速降级

| 故障 | 操作 | 业务结果 |
| --- | --- | --- |
| TEI 不稳定/内存紧张 | `HYBRID_SEARCH_ENABLED=false` 后重启 Web | 仅关键词搜索，发布不受影响 |
| 需停止生成新向量 | 再设 `EMBEDDING_ENABLED=false` | worker 停止，队列数据保留 |
| 推荐指标恶化 | `RECOMMENDATION_ENABLED=false` | 立即回退 `latest-v1` |
| 只需缩小影响 | 下调 `RECOMMENDATION_ROLLOUT_PERCENT` | 稳定减少灰度用户 |

修改 `/etc/campus-market/.env` 前先备份，修改后执行 `systemctl restart campus-market-web.service` 并检查本机与公网健康端点。

## 常见故障

- **Web 启动前退出**：先看 `journalctl`；重点检查 MySQL 连接、新表创建权限和环境变量。
- **Embedding 一直 failed**：检查 TEI `/health`、模型维度和 `EMBEDDING_MODEL_VERSION`；不要反复 `--force` 制造队列压力。
- **搜索慢**：先关闭混合通道区分 MySQL/TEI，再检查向量扫描上限、MySQL P95 和索引。
- **内存迫近上限**：立即关闭混合检索并停止 `campus-embedding.service`；不调高上限直到找到原因。
- **部署健康检查失败**：发布脚本会恢复上一 release；先修复新版本启动错误，不要手动强指向失败 release。
