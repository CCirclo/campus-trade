# 校园闲鱼（campus-trade）

校园二手闲置交易平台——同校好物、放心交易。本仓库为多端统一代码仓库，Web 端已实现，iOS / Android 端预留位置。

## 仓库结构

```
project
│
├── frontend/        # Web 前端（React + Vite）—— ✅ 已实现
│
├── app-ios/         # iOS 客户端（Swift / SwiftUI）—— ⏳ 预留，待开发
│
├── app-android/     # Android 客户端（Kotlin / Jetpack Compose）—— ⏳ 预留，待开发
│
├── backend/         # 后端 API（Node.js + Express + MySQL）—— ✅ 已实现
│
├── docs/            # 接口文档与技术文档
│
└── README.md        # 本文件
```

## 各模块说明

| 目录 | 说明 | 状态 |
| --- | --- | --- |
| `frontend/` | Web 前端，基于 React 19 + Vite 7，移动优先布局，含管理后台 | ✅ 已实现 |
| `backend/` | 后端 API，Node.js + Express 5 + MySQL 8，含邮箱验证码注册登录、腾讯云 COS 图片存储、站内聊天、举报与管理后台接口 | ✅ 已实现 |
| `app-ios/` | iOS 客户端（预留） | ⏳ 预留 |
| `app-android/` | Android 客户端（预留） | ⏳ 预留 |
| `docs/` | 接口文档 | 📄 见 [`docs/api.md`](docs/api.md) |

## 快速开始（Web 全栈）

要求 Node.js 22+ 与 MySQL 8.0+：

```bash
cp .env.example .env   # 填写 MySQL、邮箱 SMTP、腾讯云 COS 等配置
npm install
npm run dev            # 前端 :5173，API :8787
```

生产环境构建与检查：

```bash
npm test
npm run build
NODE_ENV=production npm start
```

详细说明见 [`frontend/README.md`](frontend/README.md)。

## 接口文档

- [`docs/api.md`](docs/api.md) —— 后端 REST API 完整接口文档

## 生产部署

- 线上地址：<https://20250821cdcdifc.top/campus-trade/>
- 健康检查：<https://20250821cdcdifc.top/campus-trade/api/health>
- 服务器：腾讯云 Ubuntu Server 24.04 LTS（Node.js 22、MySQL 8、Nginx）
- 服务名：`campus-market-web.service`
- 发布目录：`/srv/campus-market/releases/<commit-sha>`
- 当前版本：`/srv/campus-market/current`
- 环境配置：`/etc/campus-market/.env`，不得提交到 Git

推送到 `main` 后，[GitHub Actions](.github/workflows/deploy.yml) 会依次执行
`npm ci`、测试和生产构建，再通过 SSH 发布。服务器使用 npmmirror 安装依赖，
发布脚本会原子切换 `current` 链接、重启服务并检查 `/api/health`；失败时自动
恢复上一个可用版本，最多保留 5 个历史版本。

仓库需要配置以下 Actions Secrets：

- `DEPLOY_HOST`：服务器地址
- `DEPLOY_USER`：受限部署用户
- `DEPLOY_SSH_KEY`：专用部署私钥
- `DEPLOY_HOST_KEY`：服务器 SSH host key

服务器只允许部署用户免密执行固定的 `/usr/local/sbin/deploy-campus-market`，
不授予通用 root shell。数据库已从重装前备份恢复；部署不会覆盖数据库。

## 待办 / 预留

- [ ] iOS 客户端（`app-ios/`）
- [ ] Android 客户端（`app-android/`）
- [ ] 更多接口与部署文档（`docs/`）

## 许可证

本项目代码仅供学习与内部使用。
