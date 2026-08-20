# GitHub Actions 部署

工作流在 GitHub 的 Ubuntu Runner 上完成依赖安装、测试和构建，再通过 SSH 将完整运行包主动推送到国内服务器。服务器不需要访问 GitHub 或 npm。

## Repository secrets

- `DEPLOY_HOST`：服务器 IP 或域名。
- `DEPLOY_USER`：专用部署用户，建议 `deploy`。
- `DEPLOY_SSH_KEY`：部署用户私钥。
- `DEPLOY_HOST_KEY`：重装后执行 `ssh-keyscan -H <host>` 得到的完整主机公钥行；应通过可信渠道核对指纹后填写。

## Ubuntu 首次安装

创建 `campus-market` 系统用户，安装 Node.js 22、MySQL 8、nginx 和 curl。将生产环境变量保存为 `/etc/campus-market/.env`，权限设为 `600`。

把 `backend/deploy/campus-market-web.service` 安装到 `/etc/systemd/system/`，把 `backend/deploy/deploy-campus-market` 安装到 `/usr/local/sbin/` 并设为 `755`。只允许部署用户免密执行这一条脚本，不授予通用 sudo：

```sudoers
deploy ALL=(root) NOPASSWD: /usr/local/sbin/deploy-campus-market
```

首次恢复数据库后，在 GitHub 手动运行 `Test and deploy campus market`。后续推送到 `main` 会自动发布，失败时脚本自动恢复上一个版本。
