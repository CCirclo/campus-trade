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
cd frontend
cp .env.example .env   # 填写 MySQL、邮箱 SMTP、腾讯云 COS 等配置
npm install
npm run dev            # 前端 :5173，API :8787
```

生产环境构建与检查：

```bash
cd frontend
npm test
npm run build
NODE_ENV=production npm start
```

详细说明见 [`frontend/README.md`](frontend/README.md)。

## 接口文档

- [`docs/api.md`](docs/api.md) —— 后端 REST API 完整接口文档

## 待办 / 预留

- [ ] iOS 客户端（`app-ios/`）
- [ ] Android 客户端（`app-android/`）
- [ ] 更多接口与部署文档（`docs/`）

## 许可证

本项目代码仅供学习与内部使用。
